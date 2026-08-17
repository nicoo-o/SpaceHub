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
    constructor() {
        this.api = new ProwlarrApi();
        this._log = new Logger('ProwlarrService');
        this._cache = window.SpaceHub?.core?.cache || null;
        this._eventBus = window.SpaceHub?.core?.eventBus || null;

        // Mise à jour de l'API client si les paramètres changent
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'prowlarr.url') this.api.setBaseUrl(value);
                if (key === 'prowlarr.apiKey') this.api.setApiKey(value);
            });
        }
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
