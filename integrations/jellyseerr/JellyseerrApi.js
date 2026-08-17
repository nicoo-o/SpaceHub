/**
 * SpaceHub — Jellyseerr / Overseerr API Client
 * Version: 0.10.0
 *
 * Client HTTP spécialisé pour l'API Jellyseerr / Overseerr (v1).
 * Gère la communication, l'authentification par clé API, les demandes de médias,
 * l'approbation / refus, ainsi que la découverte (tendances et populaires).
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';
import Logger from '../../core/Logger.js';

class JellyseerrApi extends BaseApiClient {
    constructor() {
        const settings = window.SpaceHub?.core?.settings;
        const url = settings?.get('jellyseerr.url', 'http://localhost:5055') || 'http://localhost:5055';
        const apiKey = settings?.get('jellyseerr.apiKey', '') || '';

        super(url, apiKey);
        this._log = new Logger('JellyseerrApi');
    }

    /**
     * Teste la connexion avec le serveur Jellyseerr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        try {
            const status = await this.get('/api/v1/status');
            this._log.info(`Connexion Jellyseerr réussie (version: ${status?.version || 'inconnue'})`);
            return { success: true, version: status?.version };
        } catch (err) {
            this._log.error('Échec du test de connexion Jellyseerr:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── Demandes (Requests) ──────────────────────────────────────────────────

    /**
     * Récupère la liste des demandes de médias.
     * @param {number} [take=20]
     * @param {number} [skip=0]
     * @param {'all'|'pending'|'approved'|'processing'|'available'} [filter='all']
     * @returns {Promise<Object>}
     */
    async getRequests(take = 20, skip = 0, filter = 'all') {
        return await this.get(`/api/v1/request?take=${take}&skip=${skip}&filter=${filter}&sort=added`);
    }

    /**
     * Récupère le compteur global de demandes par statut.
     * @returns {Promise<{ total: number, movie: number, tv: number, pending: number, approved: number, processing: number, available: number }>}
     */
    async getRequestCount() {
        return await this.get('/api/v1/request/count');
    }

    /**
     * Approuve une demande de média.
     * @param {number|string} requestId
     * @returns {Promise<Object>}
     */
    async approveRequest(requestId) {
        return await this.post(`/api/v1/request/${requestId}/approve`);
    }

    /**
     * Refuse / supprime une demande de média.
     * @param {number|string} requestId
     * @returns {Promise<Object>}
     */
    async declineRequest(requestId) {
        return await this.delete(`/api/v1/request/${requestId}`);
    }

    /**
     * Crée une nouvelle demande de média.
     * @param {{ mediaType: 'movie'|'tv', mediaId: number, seasons?: Array<number> }} requestData
     * @returns {Promise<Object>}
     */
    async createRequest(requestData) {
        return await this.post('/api/v1/request', requestData);
    }

    // ─── Découverte & Tendances ───────────────────────────────────────────────

    /**
     * Récupère les médias tendances du moment.
     * @param {number} [page=1]
     * @returns {Promise<Object>}
     */
    async getTrending(page = 1) {
        return await this.get(`/api/v1/discover/trending?page=${page}`);
    }

    /**
     * Récupère les films populaires.
     * @param {number} [page=1]
     * @returns {Promise<Object>}
     */
    async getPopularMovies(page = 1) {
        return await this.get(`/api/v1/discover/movies?page=${page}&sortBy=popularity.desc`);
    }

    /**
     * Récupère les séries populaires.
     * @param {number} [page=1]
     * @returns {Promise<Object>}
     */
    async getPopularSeries(page = 1) {
        return await this.get(`/api/v1/discover/tv?page=${page}&sortBy=popularity.desc`);
    }

    /**
     * Recherche globale de films et séries dans Jellyseerr.
     * @param {string} query
     * @param {number} [page=1]
     * @returns {Promise<Object>}
     */
    async search(query, page = 1) {
        return await this.get(`/api/v1/search?query=${encodeURIComponent(query)}&page=${page}`);
    }
}

export default JellyseerrApi;
