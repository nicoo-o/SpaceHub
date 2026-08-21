/**
 * SpaceHub — Jellyfin API Service
 * Version: 0.5.0
 *
 * Couche de service et d'abstraction complète pour l'API Jellyfin.
 * Inclut la gestion du cache transparent (CacheManager), les métadonnées,
 * les bibliothèques, la lecture et les sessions actives.
 */

'use strict';

import Logger from '../../core/Logger.js';

class JellyfinAPI {
    constructor() {
        this._log = new Logger('JellyfinAPI');
        this._cache = window.SpaceHub?.core?.cache || null;
    }

    get _client() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    get _rawApiClient() {
        return window.ApiClient;
    }

    // ─── Utilisateur & Authentification ───────────────────────────────────────

    async getCurrentUser() {
        if (this._rawApiClient?.getCurrentUser) {
            return await this._rawApiClient.getCurrentUser();
        }
        return null;
    }

    getUserId() {
        return this._rawApiClient?.getCurrentUserId?.() || null;
    }

    // ─── Bibliothèques & Éléments ─────────────────────────────────────────────

    /**
     * Récupère les bibliothèques (UserViews) de l'utilisateur connecté.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<Array<Object>>}
     */
    async getUserViews(forceRefresh = false) {
        const userId = this.getUserId();
        if (!userId) return [];

        const cacheKey = `user_views_${userId}`;
        if (!forceRefresh && this._cache) {
            const cached = await this._cache.get('jellyfin', cacheKey);
            if (cached) return cached;
        }

        const data = await this._client.get(`/Users/${userId}/Views`);
        const views = data?.Items || [];

        if (this._cache) {
            await this._cache.set('jellyfin', cacheKey, views, 600); // 10 min TTL
        }

        return views;
    }

    /**
     * Récupère les détails complets d'un élément (film, série, épisode, etc.).
     * @param {string} itemId
     * @returns {Promise<Object>}
     */
    async getItem(itemId) {
        const userId = this.getUserId();
        const endpoint = userId ? `/Users/${userId}/Items/${itemId}` : `/Items/${itemId}`;
        return await this._client.get(endpoint);
    }

    /**
     * Récupère les éléments enfants d'un dossier / saison / collection.
     * @param {string} parentId
     * @param {Object} [queryOptions]
     * @returns {Promise<Array<Object>>}
     */
    async getItems(parentId, queryOptions = {}) {
        const userId = this.getUserId();
        const params = new URLSearchParams({
            parentId: parentId || '',
            userId: userId || '',
            fields: 'PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating',
            enableImageTypes: 'Primary,Backdrop,Thumb',
            ...queryOptions
        });

        const data = await this._client.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }

    /**
     * Récupère les épisodes pour une saison ou une série.
     * @param {string} seriesId
     * @param {string} [seasonId]
     * @returns {Promise<Array<Object>>}
     */
    async getEpisodes(seriesId, seasonId = null) {
        const userId = this.getUserId();
        const params = new URLSearchParams({
            userId: userId || '',
            seasonId: seasonId || '',
            fields: 'ItemCounts,PrimaryImageAspectRatio,Overview'
        });

        const data = await this._client.get(`/Shows/${seriesId}/Episodes?${params.toString()}`);
        return data?.Items || [];
    }

    // ─── Sessions de Lecture ──────────────────────────────────────────────────

    /**
     * Récupère la session active de l'appareil courant.
     * @returns {Promise<Object|null>}
     */
    async getActiveSession() {
        const deviceId = this._rawApiClient?.deviceId?.();
        if (!deviceId) return null;

        const sessions = await this._client.get(`/Sessions?deviceId=${encodeURIComponent(deviceId)}`);
        if (Array.isArray(sessions) && sessions.length > 0) {
            return sessions[0];
        }
        return sessions || null;
    }

    // ─── Gestion de l'état de lecture ─────────────────────────────────────────

    /**
     * Marque un élément comme lu / non lu.
     * @param {string} itemId
     * @param {boolean} played
     */
    async setPlayedStatus(itemId, played = true) {
        const userId = this.getUserId();
        if (!userId) return;

        const method = played ? 'post' : 'delete';
        await this._client[method](`/Users/${userId}/PlayedItems/${itemId}`);
        this._log.info(`Élément ${itemId} marqué comme ${played ? 'lu' : 'non lu'}`);
    }

    /**
     * Marque ou retire un élément des favoris.
     * @param {string} itemId
     * @param {boolean} isFavorite
     */
    async setFavorite(itemId, isFavorite = true) {
        const userId = this.getUserId();
        if (!userId) return;

        const method = isFavorite ? 'post' : 'delete';
        await this._client[method](`/Users/${userId}/FavoriteItems/${itemId}`);
    }

    // ─── URL d'Images ─────────────────────────────────────────────────────────

    getImageUrl(itemId, type = 'Primary', options = {}) {
        return this._client?.getImageUrl(itemId, type, options) || '';
    }
}

export default JellyfinAPI;
