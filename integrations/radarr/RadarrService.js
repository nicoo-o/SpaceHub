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
    constructor() {
        this.api = new RadarrApi();
        this._log = new Logger('RadarrService');
        this._cache = window.SpaceHub?.core?.cache || null;
        this._eventBus = window.SpaceHub?.core?.eventBus || null;

        // Mise à jour de l'API client si les paramètres changent
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                // Réagir aux changements individuels ou globaux (batch)
                if (key === 'radarr.url' || (key === '*' && value['radarr.url'])) {
                    this.api.setBaseUrl(key === '*' ? value['radarr.url'] : value);
                }
                if (key === 'radarr.apiKey' || (key === '*' && value['radarr.apiKey'])) {
                    this.api.setApiKey(key === '*' ? value['radarr.apiKey'] : value);
                }
            });
        }
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
