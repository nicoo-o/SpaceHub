/**
 * SpaceHub — SDK plugin catalog
 *
 * Le catalogue vérifie les métadonnées et l'intégrité avant de remettre le
 * code au chargeur. Il ne fait jamais d'eval/new Function et ne télécharge pas
 * un plugin non approuvé.
 */
'use strict';

import Logger from './Logger.js';

import * as svc from './services.js';
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

class PluginCatalog {
    constructor({ settings = null, eventBus = null, fetchImpl = null, userProvider = null, cache = null, hostVersion = '1.0.0', requireSigned = true } = {}) {
        this._settings = settings || (typeof window !== 'undefined' ? svc.settings() : null);
        this._eventBus = eventBus || (typeof window !== 'undefined' ? svc.eventBus() : null);
        this._fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        this._userProvider = userProvider || (() => typeof window !== 'undefined' ? svc.auth()?.getUser?.() : null);
        this._cache = cache || (typeof window !== 'undefined' ? svc.cache() : null);
        this._hostVersion = hostVersion;
        this._requireSigned = requireSigned;
        this._log = new Logger('PluginCatalog');
        this._entries = new Map();
        this._installedPackages = new Map();
        this._history = new Map();
    }

    register(entry) {
        const normalized = this.validate(entry);
        if (!normalized.valid) throw new Error(normalized.errors.join(' '));
        this._entries.set(normalized.entry.id, normalized.entry);
        this._eventBus?.emit('catalog:entry-registered', { id: normalized.entry.id });
        return normalized.entry;
    }

    registerMany(entries = []) {
        if (!Array.isArray(entries)) throw new TypeError('Le catalogue doit être un tableau.');
        const validated = entries.map(entry => {
            const result = this.validate(entry);
            if (!result.valid) throw new Error(result.errors.join(' '));
            return result.entry;
        });
        for (const entry of validated) this._entries.set(entry.id, entry);
        for (const entry of validated) this._eventBus?.emit('catalog:entry-registered', { id: entry.id });
        return validated;
    }

    /**
     * Charge un catalogue JSON distant. Le document doit être HTTPS et, en
     * mode signé, prendre la forme { entries, signature, publicKey }.
     */
    async load(url) {
        if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
            throw new TypeError('Le catalogue distant doit utiliser HTTPS.');
        }
        if (!this._fetch) throw new Error('Client HTTP indisponible.');
        const response = await this._fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`Catalogue indisponible (HTTP ${response.status}).`);
        const document = await response.json();
        const entries = Array.isArray(document) ? document : document?.entries;
        if (!Array.isArray(entries)) throw new Error('Format de catalogue invalide.');
        if (this._requireSigned) {
            if (Array.isArray(document)) throw new Error('Un catalogue distant signé doit fournir une enveloppe signée.');
            const payload = JSON.stringify(entries);
            if (!(await this.verifySignature(payload, document.signature, document.publicKey))) {
                throw new Error('Signature du catalogue invalide.');
            }
        }
        const registered = this.registerMany(entries);
        this._settings?.set('plugins.catalogUrl', url);
        this._eventBus?.emit('catalog:loaded', { url, count: registered.length });
        return registered;
    }

    validate(entry) {
        const errors = [];
        if (!entry || typeof entry !== 'object') errors.push('Entrée de catalogue invalide.');
        if (!entry?.id || !ID_PATTERN.test(entry.id)) errors.push('Identifiant catalogue invalide.');
        if (!entry?.version || !VERSION_PATTERN.test(entry.version)) errors.push('Version SemVer invalide.');
        if (!entry?.manifest || typeof entry.manifest !== 'object') errors.push('Manifest absent.');
        if (!Array.isArray(entry?.permissions)) errors.push('Permissions absentes ou invalides.');
        if (Array.isArray(entry?.permissions) && Array.isArray(entry?.manifest?.permissions)) {
            const declared = [...new Set(entry.permissions)].sort().join('|');
            const manifestPermissions = [...new Set(entry.manifest.permissions)].sort().join('|');
            if (declared !== manifestPermissions) errors.push('Les permissions du catalogue et du manifest doivent correspondre.');
        }
        if (entry?.entrypoint && !/^https:\/\//i.test(entry.entrypoint)) errors.push('L’entrypoint doit utiliser HTTPS.');
        if (entry?.integrity && !/^sha256-[A-Za-z0-9+/=]+$/.test(entry.integrity)) errors.push('Intégrité SHA-256 invalide.');
        if (this._requireSigned && entry?.entrypoint && (!entry.signature || !entry.publicKey)) errors.push('Signature et clé publique requises pour un plugin distant.');
        if (entry?.compatibility?.minSpaceHub && !this._isCompatible(entry.compatibility.minSpaceHub)) {
            errors.push(`Plugin incompatible avec SpaceHub ${this._hostVersion}.`);
        }
        if (entry?.versions !== undefined && (!Array.isArray(entry.versions) || entry.versions.some(version => !version || typeof version !== 'object'))) {
            errors.push('Historique de versions invalide.');
        }
        return { valid: errors.length === 0, errors, entry: errors.length ? null : { ...entry } };
    }

    list({ approvedOnly = false, includeRevoked = false } = {}) {
        return [...this._entries.values()].filter(entry => {
            if (!includeRevoked && this.isRevoked(entry.id)) return false;
            return !approvedOnly || this.isApproved(entry.id);
        });
    }

    get(id) { return this._entries.get(String(id || '').toLowerCase()) || null; }

    isInstalled(id) {
        const normalized = String(id || '').toLowerCase();
        return this._installedPackages.has(normalized) || Boolean(this._settings?.get(`catalog.installed.${normalized}`, null));
    }

    getStatus(id) {
        const normalized = String(id || '').toLowerCase();
        const installed = this._installedPackages.get(normalized);
        return this._settings?.get(`catalog.status.${normalized}`, installed
            ? { state: 'installed', version: installed.entry.version }
            : { state: 'available' }) || { state: 'available' };
    }

    getHistory(id) {
        const normalized = String(id || '').toLowerCase();
        const memory = this._history.get(normalized) || [];
        const persisted = this._settings?.get(`catalog.history.${normalized}`, []) || [];
        return [...new Set([...memory.map(item => item.entry.version), ...persisted])];
    }

    approve(id, permissions = null) {
        this._assertAdmin();
        const entry = this._get(id);
        if (this.isRevoked(id)) throw new Error('Un plugin révoqué ne peut pas être approuvé.');
        const approved = permissions || entry.permissions || [];
        this._settings?.set(`catalog.approved.${entry.id}`, { approved: true, permissions: approved, at: Date.now() });
        this._settings?.set(`catalog.status.${entry.id}`, { state: 'approved', at: Date.now() });
        this._eventBus?.emit('catalog:approved', { id: entry.id, permissions: approved });
        return true;
    }

    revoke(id, reason = 'Révoqué par l’administrateur') {
        this._assertAdmin();
        const entry = this._get(id);
        this._settings?.set(`catalog.revoked.${entry.id}`, { revoked: true, reason, at: Date.now() });
        this._settings?.set(`catalog.status.${entry.id}`, { state: 'revoked', reason, at: Date.now() });
        this._eventBus?.emit('catalog:revoked', { id: entry.id, reason });
        return true;
    }

    isApproved(id) { return this._settings?.get(`catalog.approved.${String(id || '').toLowerCase()}.approved`, false) === true; }
    isRevoked(id) { return this._settings?.get(`catalog.revoked.${String(id || '').toLowerCase()}.revoked`, false) === true; }

    /** Télécharge et vérifie un package précis du catalogue. */
    async fetchPackage(id, { version = null } = {}) {
        const entry = this._getVersionEntry(id, version);
        if (!this._fetch || !entry.entrypoint) throw new Error('Source du plugin indisponible.');
        if (this.isRevoked(entry.id)) throw new Error('Plugin révoqué par la politique locale.');
        if (!this.isApproved(entry.id)) throw new Error('Plugin non approuvé par l’administrateur.');
        this._setStatus(entry.id, 'downloading', null, entry.version);
        try {
            const response = await this._fetch(entry.entrypoint, { credentials: 'omit' });
            if (!response.ok) throw new Error(`Téléchargement plugin refusé (HTTP ${response.status}).`);
            const source = await response.text();
            if (!entry.integrity || !(await this.verifyIntegrity(source, entry.integrity))) {
                throw new Error('Une intégrité SHA-256 valide est requise.');
            }
            if (this._requireSigned && !(await this.verifySignature(source, entry.signature, entry.publicKey))) {
                throw new Error('Signature du plugin invalide.');
            }
            this._setStatus(entry.id, 'verified', null, entry.version);
            return { source, entry };
        } catch (error) {
            this._setStatus(entry.id, 'error', error.message, entry.version);
            throw error;
        }
    }

    async install(id, { loader = null, pluginManager = null, replace = false } = {}) {
        this._assertAdmin();
        const normalizedId = String(id || '').toLowerCase();
        if (this.isInstalled(normalizedId) && !replace) {
            throw new Error(`Plugin "${normalizedId}" déjà installé. Utilisez update().`);
        }
        const packageData = await this.fetchPackage(normalizedId);
        return this._activatePackage(packageData, { loader, pluginManager, replace, previous: this._installedPackages.get(normalizedId) });
    }

    async update(id, { loader = null, pluginManager = null } = {}) {
        this._assertAdmin();
        const normalizedId = String(id || '').toLowerCase();
        const previous = this._installedPackages.get(normalizedId) || await this._restoreInstalledPackage(normalizedId);
        if (!previous) throw new Error(`Plugin "${normalizedId}" non installé.`);
        const entry = this._get(normalizedId);
        if (entry.version === previous.entry.version) {
            return { updated: false, reason: 'Version déjà installée.', version: entry.version };
        }
        const packageData = await this.fetchPackage(normalizedId);
        return this._activatePackage(packageData, { loader, pluginManager, replace: true, previous });
    }

    async rollback(id, { version = null, loader = null, pluginManager = null } = {}) {
        this._assertAdmin();
        const normalizedId = String(id || '').toLowerCase();
        const current = this._installedPackages.get(normalizedId) || await this._restoreInstalledPackage(normalizedId);
        if (!current) throw new Error(`Plugin "${normalizedId}" non installé.`);
        const targetVersion = version || this.getHistory(normalizedId).filter(candidate => candidate !== current.entry.version).at(-1);
        if (!targetVersion || targetVersion === current.entry.version) throw new Error('Aucune version précédente disponible.');
        const historical = [...(this._history.get(normalizedId) || [])].reverse().find(item => item.entry.version === targetVersion);
        const cachedValue = this._cache?.get ? await this._cache.get('general', this._packageCacheKey(normalizedId, targetVersion)).catch(() => null) : null;
        const cached = historical || cachedValue;
        const packageData = cached || await this.fetchPackage(normalizedId, { version: targetVersion });
        return this._activatePackage(packageData, { loader, pluginManager, replace: true, previous: current, rollback: true });
    }

    async uninstall(id, { pluginManager = null } = {}) {
        this._assertAdmin();
        const normalizedId = String(id || '').toLowerCase();
        this._get(normalizedId);
        const manager = pluginManager || (typeof window !== 'undefined' ? svc.plugins() : null);
        if (manager?.getPlugins?.().some(plugin => plugin.id === normalizedId)) await manager.unloadPlugin(normalizedId);
        this._installedPackages.delete(normalizedId);
        this._setStatus(normalizedId, 'uninstalled');
        this._eventBus?.emit('catalog:uninstalled', { id: normalizedId });
        return true;
    }

    async _activatePackage(packageData, { loader = null, pluginManager = null, replace = false, previous = null, rollback = false } = {}) {
        const { source, entry } = packageData;
        const load = loader || this._createTrustedModuleLoader();
        if (typeof load !== 'function') throw new TypeError('Loader de plugin indisponible.');
        const manager = pluginManager || (typeof window !== 'undefined' ? svc.plugins() : null);
        if (!manager || typeof manager.registerPlugin !== 'function') {
            throw new Error('PluginManager indisponible : installation annulée.');
        }
        const previousManifest = manager.getPluginManifest?.(entry.id) || null;
        this._setStatus(entry.id, 'installing', null, entry.version);
        try {
            const result = await load(source, entry);
            const manifest = result?.default || result?.plugin || result;
            if (!manifest || typeof manifest !== 'object') throw new Error('Le package ne fournit aucun manifest exploitable.');
            if (String(manifest.id || '').toLowerCase() !== entry.id) throw new Error('L’identifiant du manifest ne correspond pas au catalogue.');
            const manifestPermissions = [...new Set(Array.isArray(manifest.permissions) ? manifest.permissions : [])].sort().join('|');
            const catalogPermissions = [...new Set(entry.permissions || [])].sort().join('|');
            if (manifestPermissions !== catalogPermissions) throw new Error('Les permissions du package ne correspondent pas au catalogue.');
            if (manager && manager.getPlugins?.().some(plugin => plugin.id === entry.id)) {
                if (!replace) throw new Error(`Plugin "${entry.id}" déjà enregistré.`);
                await manager.unloadPlugin(entry.id);
            }
            if (!(await manager.registerPlugin(manifest, { autoEnable: false }))) throw new Error('Manifest du plugin refusé par le PluginManager.');
            if (typeof manager.approvePermissions === 'function') manager.approvePermissions(entry.id, manifest.permissions || []);
            if (!(await manager.enablePlugin(entry.id))) throw new Error('Le plugin a été installé mais son activation a été refusée.');
            if (previous && previous.entry.version !== entry.version) this._rememberHistory(entry.id, previous);
            this._installedPackages.set(entry.id, { source, entry, result });
            await this._cache?.set?.('general', this._packageCacheKey(entry.id, entry.version), { source, entry }, null).catch(() => {});
            this._settings?.set(`catalog.installed.${entry.id}`, { version: entry.version, at: Date.now() });
            this._setStatus(entry.id, rollback ? 'rolled_back' : 'installed', null, entry.version);
            this._eventBus?.emit(rollback ? 'catalog:rolled-back' : 'catalog:installed', { id: entry.id, version: entry.version });
            return { installed: true, updated: Boolean(previous), rolledBack: rollback, version: entry.version, result };
        } catch (error) {
            this._setStatus(entry.id, 'error', error.message, entry.version);
            // Une mise à jour ratée tente de remettre le manifest précédent en service.
            if (replace && previousManifest && manager?.registerPlugin) {
                try {
                    await manager.registerPlugin(previousManifest);
                    await manager.enablePlugin(entry.id);
                } catch (restoreError) {
                    this._log.error(`Restauration du plugin \"${entry.id}\" impossible`, restoreError);
                }
            }
            throw error;
        }
    }

    async _restoreInstalledPackage(id) {
        const installed = this._settings?.get(`catalog.installed.${id}`, null);
        if (!installed?.version) return null;
        const cached = this._cache?.get ? await this._cache.get('general', this._packageCacheKey(id, installed.version)).catch(() => null) : null;
        return cached || { entry: { id, version: installed.version }, source: null, result: null };
    }

    _packageCacheKey(id, version) { return `plugin-package:${id}:${version}`; }

    _rememberHistory(id, packageData) {
        const history = this._history.get(id) || [];
        if (!history.some(item => item.entry.version === packageData.entry.version)) history.push(packageData);
        this._history.set(id, history.slice(-5));
        this._cache?.set?.('general', this._packageCacheKey(id, packageData.entry.version), packageData, null).catch(() => {});
        this._settings?.set(`catalog.history.${id}`, this._history.get(id).map(item => item.entry.version));
    }

    async verifySignature(source, signature, publicKey) {
        if (!signature || !publicKey || !globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return false;
        try {
            const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            const encoded = Uint8Array.from(atob(signature), char => char.charCodeAt(0));
            return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, encoded, new TextEncoder().encode(source));
        } catch {
            return false;
        }
    }

    _createTrustedModuleLoader() {
        if (typeof window === 'undefined' || !window.URL?.createObjectURL || typeof window.Blob === 'undefined') return null;
        return async source => {
            const url = window.URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            try {
                return await import(/* @vite-ignore */ url);
            } finally {
                window.URL.revokeObjectURL(url);
            }
        };
    }

    async verifyIntegrity(source, integrity) {
        if (!integrity || !/^sha256-[A-Za-z0-9+/=]+$/.test(integrity)) return false;
        if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return false;
        const bytes = new TextEncoder().encode(source);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const binary = String.fromCharCode(...new Uint8Array(digest));
        return btoa(binary) === integrity.slice('sha256-'.length);
    }

    _setStatus(id, state, error = null, version = null) {
        const payload = { state, error, version, at: Date.now() };
        this._settings?.set(`catalog.status.${id}`, payload);
        this._eventBus?.emit('catalog:status-changed', { id, ...payload });
    }

    _getVersionEntry(id, version = null) {
        const entry = this._get(id);
        if (!version || entry.version === version) return entry;
        const historical = Array.isArray(entry.versions) ? entry.versions.find(item => item.version === version) : null;
        if (!historical) throw new Error(`Version ${version} indisponible pour le plugin "${entry.id}".`);
        const candidate = { ...entry, ...historical, id: entry.id };
        const validation = this.validate(candidate);
        if (!validation.valid) throw new Error(validation.errors.join(' '));
        return validation.entry;
    }

    _isCompatible(minVersion) {
        const left = String(this._hostVersion).split('.').map(Number);
        const right = String(minVersion).split('.').map(Number);
        for (let index = 0; index < 3; index++) {
            if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) > (right[index] || 0);
        }
        return true;
    }

    _assertAdmin() {
        if (this._userProvider?.()?.Policy?.IsAdministrator !== true) {
            throw new Error('Cette opération exige un compte administrateur Jellyfin.');
        }
    }

    _get(id) {
        const entry = this.get(id);
        if (!entry) throw new Error(`Plugin catalogue introuvable : ${id}`);
        return entry;
    }
}

export default PluginCatalog;
