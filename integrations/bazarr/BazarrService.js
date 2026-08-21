/**
 * SpaceHub — Bazarr Service
 * Version: 0.9.0
 *
 * Couche de service métier pour l'intégration Bazarr.
 * Gère le suivi des sous-titres manquants, les fournisseurs, la mise en cache
 * et la synchronisation avec l'EventBus.
 */

'use strict';

import Logger from '../../core/Logger.js';
import BazarrApi from './BazarrApi.js';

class BazarrService {
    constructor() {
        this.api = new BazarrApi();
        this._log = new Logger('BazarrService');
        this._cache = window.SpaceHub?.core?.cache || null;
        this._eventBus = window.SpaceHub?.core?.eventBus || null;

        // Mise à jour de l'API client si les paramètres changent
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                // Réagir aux changements individuels ou globaux (batch)
                if (key === 'bazarr.url' || (key === '*' && value['bazarr.url'])) {
                    this.api.setBaseUrl(key === '*' ? value['bazarr.url'] : value);
                }
                if (key === 'bazarr.apiKey' || (key === '*' && value['bazarr.apiKey'])) {
                    this.api.setApiKey(key === '*' ? value['bazarr.apiKey'] : value);
                }
            });
        }
    }

    /**
     * Récupère un résumé complet des sous-titres recherchés (films + épisodes).
     * @returns {Promise<{ movies: Array<Object>, episodes: Array<Object>, totalWanted: number }>}
     */
    async getWantedSummary() {
        const cacheKey = 'bazarr_wanted_summary';
        if (this._cache) {
            const cached = await this._cache.get('bazarr', cacheKey);
            if (cached) return cached;
        }

        const [moviesRes, episodesRes] = await Promise.all([
            this.api.getWantedMovies(0, 15).catch(() => ({ data: [] })),
            this.api.getWantedEpisodes(0, 15).catch(() => ({ data: [] }))
        ]);

        const movies = moviesRes?.data || [];
        const episodes = episodesRes?.data || [];
        const totalWanted = (moviesRes?.total || movies.length) + (episodesRes?.total || episodes.length);

        const summary = { movies, episodes, totalWanted };

        if (this._cache) {
            await this._cache.set('bazarr', cacheKey, summary, 180); // 3 min TTL
        }

        return summary;
    }

    /**
     * Récupère l'état de santé des fournisseurs de sous-titres.
     * @returns {Promise<Array<Object>>}
     */
    async getProvidersStatus() {
        const providers = await this.api.getProviders();
        return providers.map(p => ({
            name: p.name || p.id,
            enabled: p.enabled !== false,
            authenticated: p.authenticated ?? true
        }));
    }

    /**
     * Lance la recherche de sous-titres pour un film.
     * @param {number|string} radarrId
     * @returns {Promise<Object>}
     */
    async searchMovieSubtitles(radarrId) {
        this._log.info(`Recherche de sous-titres pour le film radarrId: ${radarrId}...`);
        const result = await this.api.searchMovieSubtitles(radarrId);

        if (this._cache) await this._cache.delete('bazarr', 'bazarr_wanted_summary');
        if (this._eventBus) this._eventBus.emit('bazarr:subtitlesDownloaded', { type: 'movie', id: radarrId });

        window.SpaceHub?.ui?.components?.toaster?.success('Recherche de sous-titres lancée dans Bazarr !');
        return result;
    }

    /**
     * Lance la recherche de sous-titres pour un épisode.
     * @param {number|string} sonarrEpisodeId
     * @returns {Promise<Object>}
     */
    async searchEpisodeSubtitles(sonarrEpisodeId) {
        this._log.info(`Recherche de sous-titres pour l'épisode sonarrEpisodeId: ${sonarrEpisodeId}...`);
        const result = await this.api.searchEpisodeSubtitles(sonarrEpisodeId);

        if (this._cache) await this._cache.delete('bazarr', 'bazarr_wanted_summary');
        if (this._eventBus) this._eventBus.emit('bazarr:subtitlesDownloaded', { type: 'episode', id: sonarrEpisodeId });

        window.SpaceHub?.ui?.components?.toaster?.success('Recherche de sous-titres d\'épisode lancée !');
        return result;
    }

    /**
     * Déclenche une synchronisation des bibliothèques.
     * @returns {Promise<Object>}
     */
    async triggerSync() {
        this._log.info('Déclenchement de la synchronisation Bazarr...');
        const result = await this.api.syncLibraries();
        window.SpaceHub?.ui?.components?.toaster?.info('Synchronisation Bazarr lancée.');
        return result;
    }
}

export default BazarrService;
