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
        this._settingsKey = 'jellyseerr';
        this._log = new Logger('JellyseerrApi');
    }

    /**
     * Met à jour la configuration active depuis les settings SpaceHub.
     */
    updateConfig() {
        const settings = window.SpaceHub?.core?.settings;
        this.baseUrl = (settings?.get('jellyseerr.url', 'http://localhost:5055') || 'http://localhost:5055').replace(/\/$/, '');
        this.apiKey = settings?.get('jellyseerr.apiKey', '') || '';
    }

    /**
     * Teste la connexion avec le serveur Jellyseerr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        this.updateConfig();
        try {
            // 1. Tester le statut de l'application
            const status = await this.get('/api/v1/status');
            const version = status?.version || status?.commitTag || '1.x';

            // 2. Si une clé est renseignée, valider l'authentification avec le compteur de requêtes
            if (this.apiKey) {
                try {
                    await this.get('/api/v1/request/count');
                } catch (authErr) {
                    this._log.warn('Status accessible mais clé API non reconnue:', authErr);
                    return { success: false, error: 'Serveur accessible, mais la clé API est invalide' };
                }
            }

            this._log.info(`Connexion Jellyseerr réussie (version: ${version})`);
            return { success: true, version: String(version) };
        } catch (err) {
            this._log.error('Échec du test de connexion Jellyseerr:', err);
            return { success: false, error: err.message || 'Serveur injoignable' };
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
     * Helper renvoyant directement la liste des médias tendances.
     * @returns {Promise<Array>}
     */
    async getTrendingMedia() {
        const res = await this.getTrending(1);
        return res?.results || [];
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
     * Helper renvoyant directement la liste des films populaires.
     * @returns {Promise<Array>}
     */
    async getPopularMoviesList() {
        const res = await this.getPopularMovies(1);
        return (res?.results || []).map(item => ({ ...item, mediaType: 'movie' }));
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
     * Helper renvoyant directement la liste des séries populaires.
     * @returns {Promise<Array>}
     */
    async getPopularSeriesList() {
        const res = await this.getPopularSeries(1);
        return (res?.results || []).map(item => ({ ...item, mediaType: 'tv' }));
    }

    /**
     * Récupère les sorties de films à venir.
     * @param {number} [page=1]
     * @returns {Promise<Object>}
     */
    async getUpcomingMovies(page = 1) {
        return await this.get(`/api/v1/discover/movies/upcoming?page=${page}`);
    }

    /**
     * Helper renvoyant directement la liste des sorties très attendues.
     * @returns {Promise<Array>}
     */
    async getUpcomingMediaList() {
        try {
            const res = await this.getUpcomingMovies(1);
            if (res?.results && res.results.length > 0) {
                return res.results.map(item => ({ ...item, mediaType: 'movie' }));
            }
        } catch {
            // Fallback si endpoint upcoming non disponible
        }
        const fallback = await this.getTrending(2);
        return fallback?.results || [];
    }

    /**
     * Helper de demande rapide en 1-clic.
     * @param {'movie'|'tv'} type
     * @param {number|string} mediaId
     * @param {Array<number>} [seasons]
     * @returns {Promise<Object>}
     */
        /**
     * Récupère la configuration des serveurs Radarr (profils de qualité et dossiers racines).
     * @returns {Promise<Array<Object>>}
     */
    async getRadarrServers() {
        try {
            return await this.get('/api/v1/service/radarr') || [];
        } catch (e) {
            this._log.debug('getRadarrServers non disponible:', e);
            return [];
        }
    }

    /**
     * Récupère la configuration des serveurs Sonarr (profils de qualité et dossiers racines).
     * @returns {Promise<Array<Object>>}
     */
    async getSonarrServers() {
        try {
            return await this.get('/api/v1/service/sonarr') || [];
        } catch (e) {
            this._log.debug('getSonarrServers non disponible:', e);
            return [];
        }
    }

    /**
     * Récupère les détails d'un média depuis Jellyseerr/TMDB.
     * @param {'movie'|'tv'} mediaType
     * @param {number|string} mediaId
     * @returns {Promise<Object|null>}
     */
    async getMediaDetails(mediaType, mediaId) {
        try {
            const endpoint = mediaType === 'tv' ? `/api/v1/tv/${mediaId}` : `/api/v1/movie/${mediaId}`;
            return await this.get(endpoint);
        } catch (e) {
            this._log.debug('getMediaDetails erreur:', e);
            return null;
        }
    }

    async requestMedia(type, mediaId, seasons = null) {
        const payload = {
            mediaType: type === 'tv' ? 'tv' : 'movie',
            mediaId: Number(mediaId)
        };
        if (type === 'tv') {
            payload.seasons = seasons && seasons.length > 0 ? seasons : 'all';
        }
        return await this.createRequest(payload);
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
