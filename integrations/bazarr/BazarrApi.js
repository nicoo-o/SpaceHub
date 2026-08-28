/**
 * SpaceHub — Bazarr API Client
 * Version: 0.9.0
 *
 * Client HTTP spécialisé pour l'API Bazarr (v1).
 * Gère la communication, l'authentification par clé API, la récupération des
 * sous-titres recherchés (Wanted), les fournisseurs et la synchronisation.
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';
import Logger from '../../core/Logger.js';

class BazarrApi extends BaseApiClient {
    constructor() {
        const settings = window.SpaceHub?.core?.settings;
        const url = settings?.get('bazarr.url', 'http://localhost:6767') || 'http://localhost:6767';
        const apiKey = settings?.get('bazarr.apiKey', '') || '';

        super(url, apiKey);
        this._settingsKey = 'bazarr';
        this._log = new Logger('BazarrApi');
    }

    /**
     * Met à jour la configuration depuis les paramètres SpaceHub.
     */
    updateConfig() {
        const settings = window.SpaceHub?.core?.settings;
        this.baseUrl = (settings?.get('bazarr.url', 'http://localhost:6767') || 'http://localhost:6767').replace(/\/$/, '');
        this.apiKey = settings?.get('bazarr.apiKey', '') || '';
    }

    /**
     * Teste la connexion avec le serveur Bazarr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        this.updateConfig();
        try {
            const status = await this.get('/api/system/status');
            this._log.info(`Connexion Bazarr réussie (version: ${status?.data?.version || status?.version || 'inconnue'})`);
            return { success: true, version: status?.data?.version || status?.version };
        } catch (err) {
            this._log.error('Échec du test de connexion Bazarr:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── Sous-titres recherchés (Wanted) ──────────────────────────────────────

    /**
     * Récupère la liste des films ayant des sous-titres manquants.
     * @param {number} [start=0]
     * @param {number} [length=50]
     * @returns {Promise<Object>}
     */
    async getWantedMovies(start = 0, length = 50) {
        return await this.get(`/api/movies/wanted?start=${start}&length=${length}`);
    }

    /**
     * Récupère la liste des épisodes ayant des sous-titres manquants.
     * @param {number} [start=0]
     * @param {number} [length=50]
     * @returns {Promise<Object>}
     */
    async getWantedEpisodes(start = 0, length = 50) {
        return await this.get(`/api/episodes/wanted?start=${start}&length=${length}`);
    }

    // ─── Recherche & Téléchargement ───────────────────────────────────────────

    /**
     * Lance la recherche et le téléchargement de sous-titres pour un film.
     * @param {number|string} radarrId
     * @returns {Promise<Object>}
     */
    async searchMovieSubtitles(radarrId) {
        return await this.post(`/api/movies/subtitles?radarrId=${radarrId}`);
    }

    /**
     * Lance la recherche et le téléchargement de sous-titres pour un épisode.
     * @param {number|string} sonarrEpisodeId
     * @returns {Promise<Object>}
     */
    async searchEpisodeSubtitles(sonarrEpisodeId) {
        return await this.post(`/api/episodes/subtitles?sonarrEpisodeId=${sonarrEpisodeId}`);
    }

    // ─── Fournisseurs (Providers) & Statuts ───────────────────────────────────

    /**
     * Récupère la liste et l'état des fournisseurs de sous-titres configurés.
     * @returns {Promise<Array<Object>>}
     */
    async getProviders() {
        const res = await this.get('/api/providers');
        return res?.data || res || [];
    }

    /**
     * Lance la synchronisation de la bibliothèque Bazarr avec Sonarr & Radarr.
     * @returns {Promise<Object>}
     */
    async syncLibraries() {
        return await this.post('/api/system/tasks/sync');
    }
}

export default BazarrApi;
