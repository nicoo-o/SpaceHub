/**
 * SpaceHub — Sonarr Service
 * Version: 0.6.0
 *
 * Couche de service métier pour l'intégration Sonarr.
 * Gère la logique de synchronisation, la mise en cache des séries et du calendrier,
 * ainsi que l'émission des événements dans l'EventBus.
 */

'use strict';

import Logger from '../../core/Logger.js';
import SonarrApi from './SonarrApi.js';

class SonarrService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('SonarrService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'sonarr.url') this.api?.setBaseUrl?.(value);
                if (key === 'sonarr.apiKey') this.api?.setApiKey?.(value);
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
        const url = this._settings?.get('sonarr.url') || this.api?.baseUrl;
        const key = this._settings?.get('sonarr.apiKey') || this.api?.apiKey;

        if (!url) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'sonarr', status: this.status });
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

        this._eventBus?.emit('service:statusChanged', { id: 'sonarr', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère toutes les séries avec cache.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<Array<Object>>}
     */
    async getAllSeries(forceRefresh = false) {
        const cacheKey = 'sonarr_all_series';
        if (!forceRefresh && this._cache) {
            const cached = await this._cache.get('sonarr', cacheKey);
            if (cached) return cached;
        }

        const series = await this.api.getSeries();
        if (this._cache) {
            await this._cache.set('sonarr', cacheKey, series, 300); // 5 min TTL
        }
        return series;
    }

    /**
     * Vérifie si une série est déjà suivie dans Sonarr (par tvdbId ou titre).
     * @param {{ tvdbId?: number, tmdbId?: number, title?: string }} criteria
     * @returns {Promise<Object|null>}
     */
    async findExistingSeries(criteria) {
        try {
            const all = await this.getAllSeries();
            return all.find(s => {
                if (criteria.tvdbId && s.tvdbId === criteria.tvdbId) return true;
                if (criteria.tmdbId && s.tmdbId === criteria.tmdbId) return true;
                if (criteria.title && s.title?.toLowerCase() === criteria.title.toLowerCase()) return true;
                return false;
            }) || null;
        } catch {
            return null;
        }
    }

    /**
     * Ajoute une nouvelle série avec les profils et dossiers par défaut.
     * @param {Object} seriesData
     * @returns {Promise<Object>}
     */
    async addSeriesWithDefaults(seriesData) {
        const existing = await this.findExistingSeries({
            tvdbId: seriesData.tvdbId,
            tmdbId: seriesData.tmdbId,
            title: seriesData.title
        });

        if (existing) {
            throw new Error(`La série "${seriesData.title}" est déjà suivie dans Sonarr.`);
        }

        // Récupérer root folder et profile par défaut si non spécifiés
        let rootFolderPath = seriesData.rootFolderPath;
        if (!rootFolderPath) {
            const rootFolders = await this.api.getRootFolders();
            rootFolderPath = rootFolders[0]?.path || '/tv';
        }

        let qualityProfileId = seriesData.qualityProfileId;
        if (!qualityProfileId) {
            const profiles = await this.api.getQualityProfiles();
            qualityProfileId = profiles[0]?.id || 1;
        }

        const payload = {
            title: seriesData.title,
            tvdbId: seriesData.tvdbId,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            monitored: true,
            seasonFolder: true,
            addOptions: {
                searchForMissingEpisodes: true,
                monitor: 'all'
            },
            ...seriesData
        };

        const result = await this.api.addSeries(payload);
        this._log.info(`Série "${seriesData.title}" ajoutée avec succès.`);

        // Invalider le cache
        if (this._cache) await this._cache.delete('sonarr', 'sonarr_all_series');

        // Notifier les autres modules
        if (this._eventBus) {
            this._eventBus.emit('sonarr:seriesAdded', result);
        }

        window.SpaceHub?.ui?.components?.toaster?.success(`Série "${seriesData.title}" ajoutée à Sonarr !`);
        return result;
    }

    /**
     * Supprime une série et émet un événement.
     * @param {number|string} seriesId
     * @param {boolean} [deleteFiles=false]
     */
    async deleteSeries(seriesId, deleteFiles = false) {
        await this.api.deleteSeries(seriesId, deleteFiles);
        this._log.info(`Série ${seriesId} supprimée.`);

        if (this._cache) await this._cache.delete('sonarr', 'sonarr_all_series');
        if (this._eventBus) {
            this._eventBus.emit('sonarr:seriesDeleted', { seriesId, deleteFiles });
        }

        window.SpaceHub?.ui?.components?.toaster?.info('Série supprimée de Sonarr.');
    }

    /**
     * Récupère les prochains épisodes avec tri et mise en forme.
     * @param {number} [daysAhead=14]
     * @returns {Promise<Array<Object>>}
     */
    async getUpcomingEpisodes(daysAhead = 14) {
        const start = new Date();
        const end = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

        const cacheKey = `sonarr_upcoming_${daysAhead}`;
        if (this._cache) {
            const cached = await this._cache.get('sonarr', cacheKey);
            if (cached) return cached;
        }

        const episodes = await this.api.getCalendar(start, end);
        if (this._cache) {
            await this._cache.set('sonarr', cacheKey, episodes, 300); // 5 min TTL
        }
        return episodes;
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

export default SonarrService;
