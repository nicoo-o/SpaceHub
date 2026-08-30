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
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('BazarrService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'bazarr.url') this.api?.setBaseUrl?.(value);
                if (key === 'bazarr.apiKey') this.api?.setApiKey?.(value);
            });
        }
    }

    _createDefaultApi() {
        return this.api;
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('bazarr.url') || this.api?.baseUrl;
        const key = this._settings?.get('bazarr.apiKey') || this.api?.apiKey;

        if (!url) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'bazarr', status: this.status });
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

        this._eventBus?.emit('service:statusChanged', { id: 'bazarr', status: this.status, latency: this.lastLatency });
        return this.status;
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
