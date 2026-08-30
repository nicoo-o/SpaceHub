/**
 * SpaceHub — Jellyseerr Service
 * Version: 0.10.0
 *
 * Couche de service métier pour l'intégration Jellyseerr / Overseerr.
 * Gère le cycle de vie des demandes de médias, la découverte et les événements.
 */

'use strict';

import Logger from '../../core/Logger.js';
import JellyseerrApi from './JellyseerrApi.js';

class JellyseerrService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('JellyseerrService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'jellyseerr.url') this.api?.setBaseUrl?.(value);
                if (key === 'jellyseerr.apiKey') this.api?.setApiKey?.(value);
            });
        }
    }

    _createDefaultApi() {
        return new JellyseerrApi();
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('jellyseerr.url') || this.api?.baseUrl;
        const key = this._settings?.get('jellyseerr.apiKey') || this.api?.apiKey;

        if (!url) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'jellyseerr', status: this.status });
            return this.status;
        }

        this.status = 'connecting';
        const start = Date.now();
        try {
            if (typeof this.api?.getStatus === 'function') {
                await this.api.getStatus();
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

        this._eventBus?.emit('service:statusChanged', { id: 'jellyseerr', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère la liste des demandes en attente d'approbation (Pending).
     * @returns {Promise<Array<Object>>}
     */
    async getPendingRequests() {
        const cacheKey = 'jellyseerr_pending_requests';
        if (this._cache) {
            const cached = await this._cache.get('general', cacheKey);
            if (cached) return cached;
        }

        const res = await this.api.getRequests(20, 0, 'pending');
        const results = res?.results || [];

        if (this._cache) {
            await this._cache.set('general', cacheKey, results, 120); // 2 min TTL
        }

        return results;
    }

    /**
     * Approuve une demande utilisateur.
     * @param {number|string} requestId
     * @returns {Promise<Object>}
     */
    async approveRequest(requestId) {
        this._log.info(`Approbation de la demande #${requestId}...`);
        const res = await this.api.approveRequest(requestId);

        if (this._cache) await this._cache.delete('general', 'jellyseerr_pending_requests');
        if (this._eventBus) this._eventBus.emit('jellyseerr:requestApproved', { requestId });

        window.SpaceHub?.ui?.components?.toaster?.success('Demande de média approuvée !');
        return res;
    }

    /**
     * Refuse / supprime une demande utilisateur.
     * @param {number|string} requestId
     * @returns {Promise<Object>}
     */
    async declineRequest(requestId) {
        this._log.info(`Refus de la demande #${requestId}...`);
        const res = await this.api.declineRequest(requestId);

        if (this._cache) await this._cache.delete('general', 'jellyseerr_pending_requests');
        if (this._eventBus) this._eventBus.emit('jellyseerr:requestDeclined', { requestId });

        window.SpaceHub?.ui?.components?.toaster?.info('Demande de média refusée.');
        return res;
    }

    /**
     * Crée une demande de film ou série.
     * @param {'movie'|'tv'} mediaType
     * @param {number} mediaId - Identifiant TMDB
     * @param {Array<number>} [seasons]
     * @returns {Promise<Object>}
     */
    async requestMedia(mediaType, mediaId, seasons = null) {
        this._log.info(`Création d'une demande pour ${mediaType} #${mediaId}...`);
        const payload = {
            mediaType,
            mediaId: Number(mediaId),
            ...(seasons ? { seasons } : {})
        };

        const res = await this.api.createRequest(payload);

        if (this._cache) await this._cache.delete('general', 'jellyseerr_pending_requests');
        if (this._eventBus) this._eventBus.emit('jellyseerr:requestCreated', res);

        window.SpaceHub?.ui?.components?.toaster?.success('Demande envoyée avec succès !');
        return res;
    }

    /**
     * Récupère les médias tendances pour la découverte.
     * @returns {Promise<Array<Object>>}
     */
    async getTrendingMedia() {
        const cacheKey = 'jellyseerr_trending';
        if (this._cache) {
            const cached = await this._cache.get('general', cacheKey);
            if (cached) return cached;
        }

        const res = await this.api.getTrending(1);
        const results = res?.results || [];

        if (this._cache) {
            await this._cache.set('general', cacheKey, results, 600); // 10 min TTL
        }

        return results;
    }
}

export default JellyseerrService;
