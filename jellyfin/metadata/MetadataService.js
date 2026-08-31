/**
 * SpaceHub — MetadataService
 * Fusion explicite et traçable des métadonnées. Les données externes ne sont
 * jamais écrites dans Jellyfin automatiquement.
 */
'use strict';

import Logger from '../../core/Logger.js';

const DEFAULT_ORDER = ['jellyfin'];
const FIELDS = ['Name', 'OriginalTitle', 'Overview', 'Genres', 'People', 'PremiereDate', 'ProductionYear', 'Images', 'ProviderIds', 'CommunityRating'];

class MetadataService {
    constructor({ jellyfinApi = null, settings = null, eventBus = null, cache = null, cacheTtlSeconds = 300 } = {}) {
        this._jellyfin = jellyfinApi || window.SpaceHub?.jellyfin?.api;
        this._settings = settings || window.SpaceHub?.core?.settings;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus;
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._cacheTtlSeconds = cacheTtlSeconds;
        this._memoryCache = new Map();
        this._providers = new Map();
        this._log = new Logger('MetadataService');
    }

    registerProvider(provider) {
        if (!provider || typeof provider.id !== 'string' || typeof provider.fetch !== 'function') {
            throw new TypeError('Un fournisseur de métadonnées doit définir id et fetch().');
        }
        const id = provider.id.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new TypeError('Identifiant fournisseur invalide.');
        this._providers.set(id, { ...provider, id });
        this.clearCache();
        this._eventBus?.emit('metadata:provider-registered', { id });
        return () => {
            const removed = this._providers.delete(id);
            if (removed) this.clearCache();
            return removed;
        };
    }

    unregisterProvider(id) {
        const removed = this._providers.delete(String(id || '').toLowerCase());
        if (removed) this.clearCache();
        return removed;
    }

    clearCache() {
        this._memoryCache.clear();
        this._eventBus?.emit('metadata:cache-cleared');
    }

    getProviders() {
        return [...this._providers.values()].map(({ fetch, ...provider }) => ({ ...provider }));
    }

    getPolicy(libraryId = 'default') {
        const configured = this._settings?.get(`metadata.policies.${libraryId}`, null);
        return configured && typeof configured === 'object' ? configured : { defaultOrder: DEFAULT_ORDER, fields: {} };
    }

    setPolicy(libraryId, policy) {
        if (!libraryId || !policy || typeof policy !== 'object') throw new TypeError('Bibliothèque et politique requis.');
        const defaultOrder = Array.isArray(policy.defaultOrder) ? policy.defaultOrder : DEFAULT_ORDER;
        const fields = policy.fields && typeof policy.fields === 'object' ? policy.fields : {};
        const normalized = { defaultOrder: [...new Set(defaultOrder)], fields };
        this._settings?.set(`metadata.policies.${libraryId}`, normalized);
        this.clearCache();
        this._eventBus?.emit('metadata:policy-changed', { libraryId, policy: normalized });
        return normalized;
    }

    async get(itemId, { libraryId = 'default', force = false } = {}) {
        if (!itemId) return null;
        const policy = this.getPolicy(libraryId);
        const cacheKey = `metadata:${libraryId}:${itemId}:${JSON.stringify(policy)}`;
        if (!force) {
            const memory = this._memoryCache.get(cacheKey);
            if (memory && memory.expiresAt > Date.now()) return memory.value;
            if (this._cache) {
                const cached = await this._cache.get('jellyfin', cacheKey).catch(() => null);
                if (cached) return cached;
            }
        }
        const serverItem = await this._jellyfin?.getItem?.(itemId);
        if (!serverItem) return null;
        const sourceValues = [{ id: 'jellyfin', providerName: 'Jellyfin', item: serverItem, isServerAuthoritative: true }];
        const providerIds = this._orderedProviderIds(policy);

        for (const providerId of providerIds) {
            if (providerId === 'jellyfin') continue;
            const provider = this._providers.get(providerId);
            if (!provider) continue;
            try {
                const result = await provider.fetch(serverItem, { itemId, libraryId, force });
                if (result) sourceValues.push({ id: providerId, providerName: provider.name || providerId, item: result, isServerAuthoritative: false });
            } catch (error) {
                this._log.warn(`Fournisseur metadata "${providerId}" indisponible`, error);
                sourceValues.push({ id: providerId, providerName: provider.name || providerId, item: null, error: error.message, isServerAuthoritative: false });
            }
        }
        const merged = this._merge(sourceValues, policy);
        this._memoryCache.set(cacheKey, { value: merged, expiresAt: Date.now() + this._cacheTtlSeconds * 1000 });
        if (this._cache) await this._cache.set('jellyfin', cacheKey, merged, this._cacheTtlSeconds).catch(() => {});
        this._eventBus?.emit('metadata:resolved', { itemId, libraryId, sources: merged.sources });
        return merged;
    }

    async getProviderHealth() {
        const health = [];
        for (const provider of this._providers.values()) {
            try {
                const result = typeof provider.healthCheck === 'function' ? await provider.healthCheck() : { status: 'unknown' };
                health.push({ id: provider.id, name: provider.name || provider.id, ...result });
            } catch (error) {
                health.push({ id: provider.id, name: provider.name || provider.id, status: 'offline', error: error.message });
            }
        }
        return health;
    }

    async applyToServer(itemId, merged, { confirm = false } = {}) {
        if (!confirm) throw new Error('Confirmation explicite requise avant toute écriture Jellyfin.');
        if (window.SpaceHub?.auth?.getUser?.()?.Policy?.IsAdministrator !== true) {
            throw new Error('L’écriture de métadonnées exige un administrateur Jellyfin.');
        }
        if (!merged?.values || typeof merged.values !== 'object') throw new TypeError('Résultat de métadonnées invalide.');
        const patch = {};
        for (const [field, descriptor] of Object.entries(merged.values)) {
            if (descriptor?.value !== undefined && descriptor?.sourceId !== 'jellyfin') patch[field] = descriptor.value;
        }
        if (Object.keys(patch).length === 0) return { applied: false, reason: 'Aucune valeur externe à appliquer.' };
        const result = await this._jellyfin?.updateItemMetadata?.(itemId, patch);
        if (result === null || result === undefined) throw new Error('API Jellyfin indisponible pour écrire les métadonnées.');
        this._eventBus?.emit('metadata:applied-to-server', { itemId, fields: Object.keys(patch) });
        return { applied: true, patch, result };
    }

    _orderedProviderIds(policy) {
        const fields = Object.values(policy.fields || {}).flatMap(value => Array.isArray(value) ? value : []);
        return [...new Set([...(policy.defaultOrder || DEFAULT_ORDER), ...fields])];
    }

    _merge(sources, policy) {
        const values = {};
        for (const field of FIELDS) {
            const order = Array.isArray(policy.fields?.[field]) ? policy.fields[field] : policy.defaultOrder || DEFAULT_ORDER;
            const selected = order.map(id => sources.find(source => source.id === id && source.item?.[field] !== undefined && source.item?.[field] !== null && source.item?.[field] !== ''))
                .find(Boolean);
            if (selected) {
                values[field] = {
                    value: selected.item[field],
                    sourceId: selected.id,
                    providerName: selected.providerName,
                    fetchedAt: new Date().toISOString(),
                    isServerAuthoritative: selected.isServerAuthoritative,
                    isWritable: selected.isServerAuthoritative
                };
            }
        }
        return {
            values,
            sources: sources.map(source => ({ id: source.id, name: source.providerName, available: Boolean(source.item), error: source.error || null })),
            policy
        };
    }
}

export { FIELDS };
export default MetadataService;
