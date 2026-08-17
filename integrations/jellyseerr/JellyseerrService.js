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
    constructor() {
        this.api = new JellyseerrApi();
        this._log = new Logger('JellyseerrService');
        this._cache = window.SpaceHub?.core?.cache || null;
        this._eventBus = window.SpaceHub?.core?.eventBus || null;

        // Mise à jour de l'API client si les paramètres changent
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'jellyseerr.url') this.api.setBaseUrl(value);
                if (key === 'jellyseerr.apiKey') this.api.setApiKey(value);
            });
        }
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
