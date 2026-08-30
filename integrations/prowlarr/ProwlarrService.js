/**
 * SpaceHub — Prowlarr Service
 * Version: 0.8.0
 *
 * Couche de service métier pour l'intégration Prowlarr.
 * Gère la santé des indexeurs, le cache, la recherche unifiée de torrents / usenet,
 * et la communication avec l'EventBus.
 */

'use strict';

import Logger from '../../core/Logger.js';
import ProwlarrApi from './ProwlarrApi.js';

class ProwlarrService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('ProwlarrService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'prowlarr.url') this.api?.setBaseUrl?.(value);
                if (key === 'prowlarr.apiKey') this.api?.setApiKey?.(value);
            });
        }
    }

    _createDefaultApi() {
        return new ProwlarrApi();
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('prowlarr.url') || this.api?.baseUrl;
        const key = this._settings?.get('prowlarr.apiKey') || this.api?.apiKey;

        if (!url) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'prowlarr', status: this.status });
            return this.status;
        }

        this.status = 'connecting';
        const start = Date.now();
        try {
            if (typeof this.api?.getSystemStatus === 'function') {
                await this.api.getSystemStatus();
            }
            this.lastLatency = Date.now() - start;
            this.status = 'connected';
        } catch (err) {
            this.lastLatency = Date.now() - start;
            if (err.status === 401 || err.status === 403) {
                this.status = 'auth_failed';
            } else {
                this.status = 'offline';
            }
        }

        this._eventBus?.emit('service:statusChanged', { id: 'prowlarr', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère tous les indexeurs avec mise en cache.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<Array<Object>>}
     */
    async getAllIndexers(forceRefresh = false) {
        const cacheKey = 'prowlarr_all_indexers';
        if (!forceRefresh && this._cache) {
            const cached = await this._cache.get('prowlarr', cacheKey);
            if (cached) return cached;
        }

        const indexers = await this.api.getIndexers();
        if (this._cache) {
            await this._cache.set('prowlarr', cacheKey, indexers, 300); // 5 min TTL
        }
        return indexers;
    }

    /**
     * Récupère un résumé complet de santé et de performances des indexeurs.
     * @returns {Promise<{ total: number, enabled: number, healthy: number, degraded: number, indexers: Array<Object> }>}
     */
    async getHealthSummary() {
        const [indexers, statuses] = await Promise.all([
            this.getAllIndexers(),
            this.api.getIndexerStatuses().catch(() => [])
        ]);

        const statusMap = new Map();
        statuses.forEach(s => statusMap.set(s.indexerId, s));

        let healthy = 0;
        let degraded = 0;
        let enabled = 0;

        const detailed = indexers.map(idx => {
            const status = statusMap.get(idx.id);
            const isEnabled = idx.enable === true;
            if (isEnabled) enabled++;

            const isHealthy = !status || status.status === 'Ok';
            if (isEnabled) {
                if (isHealthy) healthy++;
                else degraded++;
            }

            return {
                id: idx.id,
                name: idx.name,
                protocol: idx.protocol, // 'torrent' | 'usenet'
                enabled: isEnabled,
                status: status?.status || 'Ok',
                disabledTill: status?.disabledTill || null,
                lastExecutionTime: status?.lastExecutionTime || null
            };
        });

        return {
            total: indexers.length,
            enabled,
            healthy,
            degraded,
            indexers: detailed
        };
    }

    /**
     * Recherche globale de releases à travers les indexeurs avec tri par seeds/date.
     * @param {string} query
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async searchReleases(query, options = {}) {
        this._log.info(`Recherche de releases Prowlarr pour "${query}"...`);
        const results = await this.api.searchReleases(query, options);
        return results || [];
    }

    /**
     * Teste tous les indexeurs et notifie l'utilisateur.
     * @returns {Promise<Object>}
     */
    async testAllIndexers() {
        this._log.info('Lancement du test de tous les indexeurs...');
        const result = await this.api.testIndexer();

        if (this._cache) {
            await this._cache.delete('prowlarr', 'prowlarr_all_indexers');
        }

        if (this._eventBus) {
            this._eventBus.emit('prowlarr:indexersTested', result);
        }

        window.SpaceHub?.ui?.components?.toaster?.info('Test des indexeurs Prowlarr terminé.');
        return result;
    }
}

export default ProwlarrService;
