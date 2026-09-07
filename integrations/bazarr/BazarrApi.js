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

import * as svc from '../../core/services.js';
class BazarrApi extends BaseApiClient {
    constructor() {
        const settings = svc.settings();
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
        const settings = svc.settings();
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
     * Lance la synchronisation des bibliothèques Bazarr avec Sonarr & Radarr.
     *
     * Cette méthode DISAIT toujours oui. Elle avalait toutes les erreurs
     * (`catch { }` vide, `.catch(() => ({ status: 'ok' }))`) et finissait sur
     * un `return { status: 'sync_requested' }` inconditionnel. Le service
     * appelant n'ayant aucun moyen de distinguer, il affichait
     * « Synchronisation Bazarr lancée avec succès ! » même serveur éteint,
     * même URL fausse, même tâche inexistante.
     *
     * Un bouton qui annonce un succès qu'il n'a pas obtenu est pire qu'un
     * bouton absent : on croit la bibliothèque synchronisée, on ne revient pas
     * voir, et les sous-titres manquants restent manquants.
     *
     * Bazarr expose des noms de tâches variables selon les versions, d'où les
     * deux formes de POST — mais chaque issue est désormais NOMMÉE.
     *
     * @returns {Promise<{success: boolean, status: string, task?: string, error?: string}>}
     */
    async syncLibraries() {
        let taches;
        try {
            const reponse = await this.get('/api/system/tasks');
            taches = Array.isArray(reponse) ? reponse : (reponse?.data || []);
        } catch (err) {
            return { success: false, status: 'unreachable', error: err?.message || 'Bazarr injoignable' };
        }

        const tache = taches.find(t => /sync|update/i.test(t.name || t.id || t.action || ''));
        if (!tache) return { success: false, status: 'unsupported' };

        const nom = tache.name || tache.id;
        // Deux formes selon la version de Bazarr : nom en query, ou en corps.
        try {
            const r = await this.post(`/api/system/tasks?name=${encodeURIComponent(nom)}`);
            return { success: true, status: 'started', task: nom, ...(r || {}) };
        } catch (premiere) {
            try {
                const r = await this.post('/api/system/tasks', { name: nom });
                return { success: true, status: 'started', task: nom, ...(r || {}) };
            } catch (seconde) {
                return { success: false, status: 'failed', task: nom,
                    error: seconde?.message || premiere?.message || 'Échec du déclenchement' };
            }
        }
    }
}

export default BazarrApi;
