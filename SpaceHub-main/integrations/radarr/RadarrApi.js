/**
 * SpaceHub — Radarr API Client
 * Version: 0.7.0
 *
 * Client HTTP spécialisé pour l'API Radarr (v3).
 * Gère la communication, l'authentification par clé API, la gestion du calendrier des films,
 * de la bibliothèque de films, des profils de qualité et de la file d'attente.
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';
import Logger from '../../core/Logger.js';

class RadarrApi extends BaseApiClient {
    constructor() {
        const settings = window.SpaceHub?.core?.settings;
        const url = settings?.get('radarr.url', 'http://localhost:7878') || 'http://localhost:7878';
        const apiKey = settings?.get('radarr.apiKey', '') || '';

        super(url, apiKey);
        this._settingsKey = 'radarr';
        this._log = new Logger('RadarrApi');
    }

    /**
     * Met à jour la configuration depuis les paramètres SpaceHub.
     */
    updateConfig() {
        const settings = window.SpaceHub?.core?.settings;
        this.baseUrl = (settings?.get('radarr.url', 'http://localhost:7878') || 'http://localhost:7878').replace(/\/$/, '');
        this.apiKey = settings?.get('radarr.apiKey', '') || '';
    }

    /**
     * Teste la connexion avec le serveur Radarr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        this.updateConfig();
        try {
            const systemStatus = await this.get('/api/v3/system/status');
            this._log.info(`Connexion Radarr réussie (version: ${systemStatus?.version || 'inconnue'})`);
            return { success: true, version: systemStatus?.version };
        } catch (err) {
            this._log.error('Échec du test de connexion Radarr:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── Films ─────────────────────────────────────────────────────────────────

    /**
     * Récupère tous les films gérés dans Radarr.
     * @returns {Promise<Array<Object>>}
     */
    async getMovies() {
        return await this.get('/api/v3/movie');
    }

    /**
     * Récupère un film par son identifiant Radarr.
     * @param {number|string} movieId
     * @returns {Promise<Object>}
     */
    async getMovieById(movieId) {
        return await this.get(`/api/v3/movie/${movieId}`);
    }

    /**
     * Recherche de nouveaux films via Radarr (lookup TMDB).
     * @param {string} term
     * @returns {Promise<Array<Object>>}
     */
    async searchMovie(term) {
        return await this.get(`/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
    }

    /**
     * Ajoute un nouveau film à Radarr.
     * @param {Object} movieData
     * @returns {Promise<Object>}
     */
    async addMovie(movieData) {
        return await this.post('/api/v3/movie', movieData);
    }

    /**
     * Supprime un film de Radarr.
     * @param {number|string} movieId
     * @param {boolean} [deleteFiles=false]
     * @returns {Promise<void>}
     */
    async deleteMovie(movieId, deleteFiles = false) {
        return await this.delete(`/api/v3/movie/${movieId}?deleteFiles=${deleteFiles}`);
    }

    // ─── Calendrier & File d'attente ──────────────────────────────────────────

    /**
     * Récupère le calendrier des sorties cinéma / digital / physiques.
     * @param {Date|string} [start]
     * @param {Date|string} [end]
     * @returns {Promise<Array<Object>>}
     */
    async getCalendar(start = new Date(), end = null) {
        const startDate = start instanceof Date ? start.toISOString() : start;
        const endDateObj = end ? (end instanceof Date ? end : new Date(end)) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const endDate = endDateObj.toISOString();

        return await this.get(`/api/v3/calendar?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`);
    }

    /**
     * Récupère la file d'attente des téléchargements en cours.
     * @returns {Promise<Object>}
     */
    async getQueue() {
        return await this.get('/api/v3/queue?includeMovie=true');
    }

    // ─── Configuration & Profils ──────────────────────────────────────────────

    /**
     * Récupère les profils de qualité disponibles.
     * @returns {Promise<Array<Object>>}
     */
    async getQualityProfiles() {
        return await this.get('/api/v3/qualityprofile');
    }

    /**
     * Récupère les dossiers racine configurés dans Radarr.
     * @returns {Promise<Array<Object>>}
     */
    async getRootFolders() {
        return await this.get('/api/v3/rootfolder');
    }
}

export default RadarrApi;
