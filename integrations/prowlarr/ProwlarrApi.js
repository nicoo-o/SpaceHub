/**
 * SpaceHub — Prowlarr API Client
 * Version: 0.8.0
 *
 * Client HTTP spécialisé pour l'API Prowlarr (v1).
 * Gère la communication, l'authentification par clé API, la gestion des indexeurs,
 * les tests de connectivité et la recherche unifiée de releases.
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';
import Logger from '../../core/Logger.js';

class ProwlarrApi extends BaseApiClient {
    constructor() {
        const settings = window.SpaceHub?.core?.settings;
        const url = settings?.get('prowlarr.url', 'http://localhost:9696') || 'http://localhost:9696';
        const apiKey = settings?.get('prowlarr.apiKey', '') || '';

        super(url, apiKey);
        this._log = new Logger('ProwlarrApi');
    }

    /**
     * Teste la connexion avec le serveur Prowlarr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        try {
            const systemStatus = await this.get('/api/v1/system/status');
            this._log.info(`Connexion Prowlarr réussie (version: ${systemStatus?.version || 'inconnue'})`);
            return { success: true, version: systemStatus?.version };
        } catch (err) {
            this._log.error('Échec du test de connexion Prowlarr:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── Indexeurs ─────────────────────────────────────────────────────────────

    /**
     * Récupère la liste de tous les indexeurs configurés.
     * @returns {Promise<Array<Object>>}
     */
    async getIndexers() {
        return await this.get('/api/v1/indexer');
    }

    /**
     * Récupère le statut de santé des indexeurs.
     * @returns {Promise<Array<Object>>}
     */
    async getIndexerStatuses() {
        return await this.get('/api/v1/indexerstatus');
    }

    /**
     * Récupère les statistiques d'utilisation des indexeurs (requêtes, succès, échecs).
     * @returns {Promise<Array<Object>>}
     */
    async getIndexerStats() {
        return await this.get('/api/v1/indexerstats');
    }

    /**
     * Teste un indexeur spécifique ou tous les indexeurs.
     * @param {number|string} [indexerId]
     * @returns {Promise<Object>}
     */
    async testIndexer(indexerId = null) {
        if (indexerId) {
            return await this.post(`/api/v1/indexer/test/${indexerId}`);
        }
        return await this.post('/api/v1/indexer/testall');
    }

    // ─── Recherche de Releases ────────────────────────────────────────────────

    /**
     * Effectue une recherche globale de releases sur les indexeurs actifs.
     * @param {string} query
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async searchReleases(query, options = {}) {
        const params = new URLSearchParams({
            query: query || '',
            type: options.type || 'search',
            limit: options.limit ? String(options.limit) : '50',
            offset: '0',
            ...options.params
        });

        if (options.categories && Array.isArray(options.categories)) {
            options.categories.forEach(cat => params.append('categories', cat));
        }

        if (options.indexerIds && Array.isArray(options.indexerIds)) {
            options.indexerIds.forEach(id => params.append('indexerIds', id));
        }

        return await this.get(`/api/v1/search?${params.toString()}`);
    }

    // ─── Applications synchronisées ───────────────────────────────────────────

    /**
     * Récupère les applications clientes synchronisées (Sonarr, Radarr, etc.).
     * @returns {Promise<Array<Object>>}
     */
    async getApplications() {
        return await this.get('/api/v1/applications');
    }
}

export default ProwlarrApi;
