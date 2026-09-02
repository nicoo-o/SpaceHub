/**
 * SpaceHub — Sonarr API Client
 * Version: 0.6.0
 *
 * Client HTTP spécialisé pour l'API Sonarr (v3).
 * Gère la communication, l'authentification par clé API, la gestion du calendrier,
 * des séries, des profils de qualité et de la file d'attente.
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';
import Logger from '../../core/Logger.js';

import * as svc from '../../core/services.js';
class SonarrApi extends BaseApiClient {
    constructor() {
        const settings = svc.settings();
        const url = settings?.get('sonarr.url', 'http://localhost:8989') || 'http://localhost:8989';
        const apiKey = settings?.get('sonarr.apiKey', '') || '';

        super(url, apiKey);
        this._settingsKey = 'sonarr';
        this._log = new Logger('SonarrApi');
    }

    /**
     * Met à jour la configuration depuis les paramètres SpaceHub.
     */
    updateConfig() {
        const settings = svc.settings();
        this.baseUrl = (settings?.get('sonarr.url', 'http://localhost:8989') || 'http://localhost:8989').replace(/\/$/, '');
        this.apiKey = settings?.get('sonarr.apiKey', '') || '';
    }

    /**
     * Teste la connexion avec le serveur Sonarr.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        this.updateConfig();
        try {
            const systemStatus = await this.get('/api/v3/system/status');
            this._log.info(`Connexion Sonarr réussie (version: ${systemStatus?.version || 'inconnue'})`);
            return { success: true, version: systemStatus?.version };
        } catch (err) {
            this._log.error('Échec du test de connexion Sonarr:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── Séries ───────────────────────────────────────────────────────────────

    /**
     * Récupère toutes les séries gérées dans Sonarr.
     * @returns {Promise<Array<Object>>}
     */
    async getSeries() {
        return await this.get('/api/v3/series');
    }

    /**
     * Récupère une série par son identifiant Sonarr.
     * @param {number|string} seriesId
     * @returns {Promise<Object>}
     */
    async getSeriesById(seriesId) {
        return await this.get(`/api/v3/series/${seriesId}`);
    }

    /**
     * Recherche de nouvelles séries via Sonarr (lookup TVDB/TMDB).
     * @param {string} term
     * @returns {Promise<Array<Object>>}
     */
    async searchSeries(term) {
        return await this.get(`/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
    }

    /**
     * Ajoute une nouvelle série à Sonarr.
     * @param {Object} seriesData
     * @returns {Promise<Object>}
     */
    async addSeries(seriesData) {
        return await this.post('/api/v3/series', seriesData);
    }

    /**
     * Supprime une série de Sonarr.
     * @param {number|string} seriesId
     * @param {boolean} [deleteFiles=false]
     * @returns {Promise<void>}
     */
    async deleteSeries(seriesId, deleteFiles = false) {
        return await this.delete(`/api/v3/series/${seriesId}?deleteFiles=${deleteFiles}`);
    }

    // ─── Calendrier & File d'attente ──────────────────────────────────────────

    /**
     * Récupère le calendrier des épisodes pour une plage de dates.
     * @param {Date|string} [start]
     * @param {Date|string} [end]
     * @param {boolean} [includeSeries=true]
     * @returns {Promise<Array<Object>>}
     */
    async getCalendar(start = new Date(), end = null, includeSeries = true) {
        const startDate = start instanceof Date ? start.toISOString() : start;
        const endDateObj = end ? (end instanceof Date ? end : new Date(end)) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const endDate = endDateObj.toISOString();

        return await this.get(`/api/v3/calendar?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&includeSeries=${includeSeries}`);
    }

    /**
     * Récupère la file d'attente des téléchargements en cours.
     * @returns {Promise<Object>}
     */
    async getQueue() {
        return await this.get('/api/v3/queue?includeSeries=true&includeEpisode=true');
    }

    // ─── Configuration & Métadonnées ──────────────────────────────────────────

    /**
     * Récupère les profils de qualité disponibles.
     * @returns {Promise<Array<Object>>}
     */
    async getQualityProfiles() {
        return await this.get('/api/v3/qualityprofile');
    }

    /**
     * Récupère les dossiers racine configurés dans Sonarr.
     * @returns {Promise<Array<Object>>}
     */
    async getRootFolders() {
        return await this.get('/api/v3/rootfolder');
    }
}

export default SonarrApi;
