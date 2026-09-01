/**
 * SpaceHub — Radarr Service
 * Version: 0.7.0
 *
 * Couche de service métier pour l'intégration Radarr.
 * Gère la logique de synchronisation, la mise en cache des films et du calendrier,
 * ainsi que l'émission des événements dans l'EventBus.
 */

'use strict';

import Logger from '../../core/Logger.js';
import RadarrApi from './RadarrApi.js';

class RadarrService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('RadarrService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'radarr.url') this.api?.setBaseUrl?.(value);
                if (key === 'radarr.apiKey') this.api?.setApiKey?.(value);
            });
        }
    }

    _createDefaultApi() {
        return new RadarrApi();
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('radarr.url') || this.api?.baseUrl;
        const key = this._settings?.get('radarr.apiKey') || this.api?.apiKey;

        const explicitlyConfigured = this._settings?.has?.('radarr.url') || this._settings?.has?.('radarr.apiKey');
        if (!url || (this._settings && !explicitlyConfigured)) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'radarr', status: this.status });
            return this.status;
        }

        this.status = 'connecting';
        const start = Date.now();
        try {
            const result = await this.api.testConnection();
            if (!result.success) {
                const authFail = result.error?.includes('401') || result.error?.includes('403') || result.error?.includes('Unauthorized');
                this.status = authFail ? 'auth_failed' : 'offline';
            } else {
                this.status = 'connected';
            }
        } catch (err) {
            this.status = (err.status === 401 || err.status === 403) ? 'auth_failed' : 'offline';
        }
        this.lastLatency = Date.now() - start;

        this._eventBus?.emit('service:statusChanged', { id: 'radarr', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère tous les films avec cache.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<Array<Object>>}
     */
    async getAllMovies(forceRefresh = false) {
        const cacheKey = 'radarr_all_movies';
        if (!forceRefresh && this._cache) {
            const cached = await this._cache.get('radarr', cacheKey);
            if (cached) return cached;
        }

        const movies = await this.api.getMovies();
        if (this._cache) {
            await this._cache.set('radarr', cacheKey, movies, 300); // 5 min TTL
        }
        return movies;
    }

    /**
     * Vérifie si un film est déjà suivi dans Radarr (par tmdbId ou titre).
     * @param {{ tmdbId?: number, title?: string, year?: number }} criteria
     * @returns {Promise<Object|null>}
     */
    async findExistingMovie(criteria) {
        try {
            const all = await this.getAllMovies();
            return all.find(m => {
                if (criteria.tmdbId && m.tmdbId === criteria.tmdbId) return true;
                if (criteria.title && m.title?.toLowerCase() === criteria.title.toLowerCase()) {
                    if (criteria.year && m.year) return m.year === criteria.year;
                    return true;
                }
                return false;
            }) || null;
        } catch {
            return null;
        }
    }

    /**
     * Ajoute un nouveau film avec les profils et dossiers par défaut.
     * @param {Object} movieData
     * @returns {Promise<Object>}
     */
    async addMovieWithDefaults(movieData) {
        const existing = await this.findExistingMovie({
            tmdbId: movieData.tmdbId,
            title: movieData.title,
            year: movieData.year
        });

        if (existing) {
            throw new Error(`Le film "${movieData.title}" est déjà présent dans Radarr.`);
        }

        // Récupérer root folder et profile par défaut si non spécifiés
        let rootFolderPath = movieData.rootFolderPath;
        if (!rootFolderPath) {
            const rootFolders = await this.api.getRootFolders();
            rootFolderPath = rootFolders[0]?.path || '/movies';
        }

        let qualityProfileId = movieData.qualityProfileId;
        if (!qualityProfileId) {
            const profiles = await this.api.getQualityProfiles();
            qualityProfileId = profiles[0]?.id || 1;
        }

        const payload = {
            title: movieData.title,
            tmdbId: movieData.tmdbId,
            year: movieData.year,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            monitored: true,
            addOptions: {
                searchForMovie: true
            },
            ...movieData
        };

        const result = await this.api.addMovie(payload);
        this._log.info(`Film "${movieData.title}" ajouté avec succès.`);

        // Invalider le cache
        if (this._cache) await this._cache.delete('radarr', 'radarr_all_movies');

        // Notifier les autres modules
        if (this._eventBus) {
            this._eventBus.emit('radarr:movieAdded', result);
        }

        window.SpaceHub?.ui?.components?.toaster?.success(`Film "${movieData.title}" ajouté à Radarr !`);
        return result;
    }

    /**
     * Supprime un film et émet un événement.
     * @param {number|string} movieId
     * @param {boolean} [deleteFiles=false]
     */
    async deleteMovie(movieId, deleteFiles = false) {
        await this.api.deleteMovie(movieId, deleteFiles);
        this._log.info(`Film ${movieId} supprimé.`);

        if (this._cache) await this._cache.delete('radarr', 'radarr_all_movies');
        if (this._eventBus) {
            this._eventBus.emit('radarr:movieDeleted', { movieId, deleteFiles });
        }

        window.SpaceHub?.ui?.components?.toaster?.info('Film supprimé de Radarr.');
    }

    /**
     * Récupère les sorties de films à venir (digital, physical, cinemas).
     * @param {number} [daysAhead=30]
     * @returns {Promise<Array<Object>>}
     */
    async getUpcomingMovies(daysAhead = 30) {
        const start = new Date();
        const end = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

        const cacheKey = `radarr_upcoming_${daysAhead}`;
        if (this._cache) {
            const cached = await this._cache.get('radarr', cacheKey);
            if (cached) return cached;
        }

        const movies = await this.api.getCalendar(start, end);
        if (this._cache) {
            await this._cache.set('radarr', cacheKey, movies, 300); // 5 min TTL
        }
        return movies;
    }

    /**
     * Récupère l'état de la file d'attente (téléchargements en cours).
     * @returns {Promise<Array<Object>>}
     */
    async getQueueItems() {
        const queue = await this.api.getQueue();
        return queue?.records || [];
    }
}

export default RadarrService;
