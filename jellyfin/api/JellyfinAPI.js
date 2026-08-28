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
        if (window.SpaceHub?.auth?.getUser()) {
            return window.SpaceHub.auth.getUser();
        }
        if (this._rawApiClient?.getCurrentUser) {
            return await this._rawApiClient.getCurrentUser();
        }
        return null;
    }

    getUserId() {
        return window.SpaceHub?.auth?.getUserId() || this._rawApiClient?.getCurrentUserId?.() || null;
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
    /**
     * Récupère les détails complets d'un élément (film, série, épisode, etc.).
     * @param {string} itemId
     * @returns {Promise<Object>}
     */
    async getItem(itemId) {
        if (!itemId) return null;
        const userId = this.getUserId();

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl(`Users/${userId}/Items/${itemId}`, {
                    fields: 'People,MediaStreams,MediaSources,Genres,Overview,OfficialRating,Taglines,SpecialFeatureCount,Studios,ProductionYear,CommunityRating,RunTimeTicks,UserData,CriticRating,BackdropImageTags,ParentBackdropItemId'
                });
                const res = await this._rawApiClient.getJSON(url);
                if (res) return res;
            } catch (e) {
                this._log.debug('getItem rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            fields: 'People,MediaStreams,MediaSources,Genres,Overview,OfficialRating,Taglines,SpecialFeatureCount,Studios,ProductionYear,CommunityRating,RunTimeTicks,UserData,CriticRating,BackdropImageTags,ParentBackdropItemId'
        });
        const endpoint = userId ? `/Users/${userId}/Items/${itemId}?${params.toString()}` : `/Items/${itemId}?${params.toString()}`;
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

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Items', {
                    parentId: parentId || '',
                    userId: userId || '',
                    fields: 'PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,MediaStreams,Overview,Genres,CommunityRating,ProductionYear,RunTimeTicks,UserData',
                    enableImageTypes: 'Primary,Backdrop,Thumb',
                    ...queryOptions
                });
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('getItems rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            parentId: parentId || '',
            userId: userId || '',
            fields: 'PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,MediaStreams,Overview,Genres,CommunityRating,ProductionYear,RunTimeTicks,UserData',
            enableImageTypes: 'Primary,Backdrop,Thumb',
            ...queryOptions
        });

        const data = await this._client.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }

    /**
     * Récupère les éléments enfants avec le total exact d'enregistrements pour la pagination.
     * @param {string} parentId
     * @param {Object} [queryOptions]
     * @returns {Promise<{ items: Array<Object>, totalCount: number }>}
     */
    async getItemsWithTotal(parentId, queryOptions = {}) {
        const userId = this.getUserId();
        const itemType = queryOptions.includeItemTypes || queryOptions.IncludeItemTypes;
        const baseQuery = {
            parentId: parentId || '',
            userId: userId || '',
            fields: 'PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,MediaStreams,Overview,Genres,CommunityRating,ProductionYear,RunTimeTicks,UserData,OfficialRating,CriticRating',
            enableImageTypes: 'Primary,Backdrop,Thumb',
            recursive: 'true',
            ...queryOptions
        };

        if (itemType) {
            baseQuery.includeItemTypes = itemType;
            baseQuery.IncludeItemTypes = itemType;
        }

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Items', baseQuery);
                const res = await this._rawApiClient.getJSON(url);
                return {
                    items: res?.Items || (Array.isArray(res) ? res : []),
                    totalCount: res?.TotalRecordCount ?? (res?.Items?.length || 0)
                };
            } catch (e) {
                this._log.debug('getItemsWithTotal rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(baseQuery)) {
            if (v !== undefined && v !== null && v !== '') {
                params.set(k, String(v));
            }
        }

        try {
            const data = await this._client.get(`/Items?${params.toString()}`);
            return {
                items: data?.Items || [],
                totalCount: data?.TotalRecordCount ?? (data?.Items?.length || 0)
            };
        } catch (e) {
            this._log.warn('Erreur getItemsWithTotal:', e);
            return { items: [], totalCount: 0 };
        }
    }

    /**
     * Récupère la liste des genres disponibles pour une bibliothèque donnée.
     * @param {string} [parentId]
     * @returns {Promise<Array<string>>}
     */
    async getGenres(parentId = '') {
        const userId = this.getUserId();
        const query = {
            userId: userId || '',
            parentId: parentId || '',
            sortBy: 'SortName',
            sortOrder: 'Ascending'
        };

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Genres', query);
                const res = await this._rawApiClient.getJSON(url);
                const items = res?.Items || [];
                return items.map(g => g.Name).filter(Boolean);
            } catch (e) {
                this._log.debug('getGenres rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            userId: userId || '',
            parentId: parentId || '',
            sortBy: 'SortName',
            sortOrder: 'Ascending'
        });

        try {
            const data = await this._client.get(`/Genres?${params.toString()}`);
            return (data?.Items || []).map(g => g.Name).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    /**
     * Récupère les saisons d'une série.
     * @param {string} seriesId
     * @returns {Promise<Array<Object>>}
     */
    async getSeasons(seriesId) {
        if (!seriesId) return [];
        const userId = this.getUserId();

        if (this._rawApiClient?.getSeasons) {
            try {
                const res = await this._rawApiClient.getSeasons(seriesId, { userId: userId || '' });
                if (res?.Items) return res.Items;
                if (Array.isArray(res)) return res;
            } catch (e) {
                this._log.debug('getSeasons rawApiClient.getSeasons fallback:', e);
            }
        }

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl(`Shows/${seriesId}/Seasons`, {
                    userId: userId || '',
                    fields: 'ItemCounts,PrimaryImageAspectRatio,Overview,UserData'
                });
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('getSeasons rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            userId: userId || '',
            fields: 'ItemCounts,PrimaryImageAspectRatio,Overview,UserData'
        });

        try {
            const data = await this._client.get(`/Shows/${seriesId}/Seasons?${params.toString()}`);
            return data?.Items || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Récupère les épisodes pour une saison ou une série.
     * @param {string} seriesId
     * @param {string} [seasonId]
     * @returns {Promise<Array<Object>>}
     */
    async getEpisodes(seriesId, seasonId = null) {
        if (!seriesId) return [];
        const userId = this.getUserId();

        if (this._rawApiClient?.getEpisodes) {
            try {
                const opts = {
                    userId: userId || '',
                    fields: 'ItemCounts,PrimaryImageAspectRatio,Overview,MediaStreams,UserData,RunTimeTicks'
                };
                if (seasonId) opts.seasonId = seasonId;
                const res = await this._rawApiClient.getEpisodes(seriesId, opts);
                if (res?.Items) return res.Items;
                if (Array.isArray(res)) return res;
            } catch (e) {
                this._log.debug('getEpisodes rawApiClient.getEpisodes fallback:', e);
            }
        }

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const query = {
                    userId: userId || '',
                    fields: 'ItemCounts,PrimaryImageAspectRatio,Overview,MediaStreams,UserData,RunTimeTicks'
                };
                if (seasonId) query.seasonId = seasonId;
                const url = this._rawApiClient.getUrl(`Shows/${seriesId}/Episodes`, query);
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('getEpisodes rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            userId: userId || '',
            fields: 'ItemCounts,PrimaryImageAspectRatio,Overview,MediaStreams,UserData,RunTimeTicks'
        });
        if (seasonId) params.set('seasonId', seasonId);

        try {
            const data = await this._client.get(`/Shows/${seriesId}/Episodes?${params.toString()}`);
            return data?.Items || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Récupère le prochain épisode à regarder (NextUp) pour une série donnée.
     * @param {string} seriesId
     * @returns {Promise<Object|null>}
     */
    async getNextUp(seriesId) {
        if (!seriesId) return null;
        const userId = this.getUserId();

        if (this._rawApiClient?.getNextUp) {
            try {
                const res = await this._rawApiClient.getNextUp({
                    SeriesId: seriesId,
                    UserId: userId || '',
                    fields: 'MediaStreams,Overview,UserData,RunTimeTicks,PrimaryImageAspectRatio'
                });
                const items = res?.Items || (Array.isArray(res) ? res : []);
                if (items.length > 0) return items[0];
            } catch (e) {
                this._log.debug('getNextUp rawApiClient fallback:', e);
            }
        }

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Shows/NextUp', {
                    seriesId: seriesId,
                    userId: userId || '',
                    fields: 'MediaStreams,Overview,UserData,RunTimeTicks,PrimaryImageAspectRatio'
                });
                const res = await this._rawApiClient.getJSON(url);
                const items = res?.Items || (Array.isArray(res) ? res : []);
                if (items.length > 0) return items[0];
            } catch (e) {
                this._log.debug('getNextUp rawApiClient getUrl fallback:', e);
            }
        }

        const params = new URLSearchParams({
            seriesId: seriesId,
            userId: userId || '',
            fields: 'MediaStreams,Overview,UserData,RunTimeTicks,PrimaryImageAspectRatio'
        });

        try {
            const data = await this._client.get(`/Shows/NextUp?${params.toString()}`);
            const items = data?.Items || [];
            return items.length > 0 ? items[0] : null;
        } catch (e) {
            return null;
        }
    }



    /**
     * Récupère les titres similaires recommandés par Jellyfin.
     * @param {string} itemId
     * @param {number} [limit=6]
     * @returns {Promise<Array<Object>>}
     */
    async getSimilarItems(itemId, limit = 6) {
        if (!itemId) return [];
        const userId = this.getUserId();

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl(`Items/${itemId}/Similar`, {
                    userId: userId || '',
                    limit: String(limit),
                    fields: 'PrimaryImageAspectRatio,Overview,CommunityRating,ProductionYear,Genres,MediaStreams'
                });
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('getSimilarItems rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            userId: userId || '',
            limit: String(limit),
            fields: 'PrimaryImageAspectRatio,Overview,CommunityRating,ProductionYear,Genres,MediaStreams'
        });

        try {
            const data = await this._client.get(`/Items/${itemId}/Similar?${params.toString()}`);
            return data?.Items || [];
        } catch (e) {
            this._log.warn('Erreur getSimilarItems:', e);
            return [];
        }
    }

    /**
     * Recherche globale sur la bibliothèque Jellyfin.
     * @param {string} query
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async search(query, options = {}) {
        if (!query || query.trim().length === 0) return [];
        const userId = this.getUserId();
        const limit = options.limit || 15;
        const includeItemTypes = options.includeItemTypes || 'Movie,Series,Episode,MusicAlbum';

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Items', {
                    searchTerm: query.trim(),
                    userId: userId || '',
                    includeItemTypes: includeItemTypes,
                    limit: String(limit),
                    recursive: 'true',
                    fields: 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,CommunityRating,Overview,MediaStreams,Genres'
                });
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('search rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            searchTerm: query.trim(),
            userId: userId || '',
            includeItemTypes: includeItemTypes,
            limit: String(limit),
            recursive: 'true',
            fields: 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,CommunityRating,Overview,MediaStreams,Genres'
        });

        try {
            const data = await this._client.get(`/Items?${params.toString()}`);
            return data?.Items || [];
        } catch (e) {
            this._log.warn('Erreur search:', e);
            return [];
        }
    }

    /**
     * Récupère les films d'une saga / collection (BoxSet).
     * @param {string} boxsetId
     * @returns {Promise<Array<Object>>}
     */
    async getBoxSetItems(boxsetId) {
        if (!boxsetId) return [];
        const userId = this.getUserId();

        if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
            try {
                const url = this._rawApiClient.getUrl('Items', {
                    userId: userId || '',
                    parentId: boxsetId || '',
                    fields: 'PrimaryImageAspectRatio,Overview,CommunityRating,ProductionYear,RunTimeTicks,Genres,MediaStreams,MediaSources',
                    sortBy: 'PremiereDate,ProductionYear,SortName',
                    sortOrder: 'Ascending'
                });
                const res = await this._rawApiClient.getJSON(url);
                return res?.Items || (Array.isArray(res) ? res : []);
            } catch (e) {
                this._log.debug('getBoxSetItems rawApiClient fallback:', e);
            }
        }

        const params = new URLSearchParams({
            userId: userId || '',
            parentId: boxsetId || '',
            fields: 'PrimaryImageAspectRatio,Overview,CommunityRating,ProductionYear,RunTimeTicks,Genres,MediaStreams,MediaSources',
            sortBy: 'PremiereDate,ProductionYear,SortName',
            sortOrder: 'Ascending'
        });

        try {
            const data = await this._client.get(`/Items?${params.toString()}`);
            return data?.Items || [];
        } catch (e) {
            this._log.warn('Erreur getBoxSetItems:', e);
            return [];
        }
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

    // ─── Dashboard & Médias en Vedette ────────────────────────────────────────

    /**
     * Récupère la liste des médias en cours de lecture pour l'utilisateur.
     * @param {number} [limit=12]
     * @returns {Promise<Array<Object>>}
     */
    async getResumeItems(limit = 12) {
        const userId = this.getUserId();
        if (!userId) return [];
        try {
            const data = await this._client.get(`/Users/${userId}/Items/Resume?Limit=${limit}&MediaTypes=Video&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating,UserData,RunTimeTicks,SeriesName,SeriesId,SeasonId,IndexNumber,ParentIndexNumber`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn('Erreur getResumeItems:', err);
            return [];
        }
    }

    /**
     * Récupère les derniers ajouts pour l'utilisateur.
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async getLatestItems(options = {}) {
        const userId = this.getUserId();
        if (!userId) return [];
        const limit = options.limit || 16;
        const includeItemTypes = options.includeItemTypes || 'Movie,Series';
        try {
            const data = await this._client.get(`/Users/${userId}/Items/Latest?Limit=${limit}&IncludeItemTypes=${includeItemTypes}&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating`);
            return Array.isArray(data) ? data : (data?.Items || []);
        } catch (err) {
            this._log.warn('Erreur getLatestItems:', err);
            return [];
        }
    }

    /**
     * Récupère les films triés.
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async getMovies(options = {}) {
        const userId = this.getUserId();
        const limit = options.limit || 20;
        const sortBy = options.sortBy || 'DateCreated';
        const sortOrder = options.sortOrder || 'Descending';
        try {
            const data = await this._client.get(`/Items?userId=${userId || ''}&IncludeItemTypes=Movie&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}&Limit=${limit}&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating,UserData,RunTimeTicks,OfficialRating,CriticRating`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn('Erreur getMovies:', err);
            return [];
        }
    }

    /**
     * Récupère les séries triées.
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async getSeries(options = {}) {
        const userId = this.getUserId();
        const limit = options.limit || 20;
        const sortBy = options.sortBy || 'DateCreated';
        const sortOrder = options.sortOrder || 'Descending';
        try {
            const data = await this._client.get(`/Items?userId=${userId || ''}&IncludeItemTypes=Series&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}&Limit=${limit}&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating,UserData,ChildCount,RecursiveItemCount,ItemCounts,OfficialRating,CriticRating,RunTimeTicks`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn('Erreur getSeries:', err);
            return [];
        }
    }

    /**
     * Récupère les sagas et coffrets (BoxSet).
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async getBoxSets(options = {}) {
        const userId = this.getUserId();
        const limit = options.limit || 20;
        const sortBy = options.sortBy || 'SortName';
        const sortOrder = options.sortOrder || 'Ascending';
        try {
            const data = await this._client.get(`/Items?userId=${userId || ''}&IncludeItemTypes=BoxSet&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}&Limit=${limit}&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn('Erreur getBoxSets:', err);
            return [];
        }
    }

    /**
     * Récupère les albums de musique (MusicAlbum).
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>}
     */
    async getMusicAlbums(options = {}) {
        const userId = this.getUserId();
        const limit = options.limit || 20;
        const sortBy = options.sortBy || 'SortName';
        const sortOrder = options.sortOrder || 'Ascending';
        try {
            const data = await this._client.get(`/Items?userId=${userId || ''}&IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}&Limit=${limit}&Fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSources,Overview,Genres,CommunityRating`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn('Erreur getMusicAlbums:', err);
            return [];
        }
    }

    /**
     * Récupère les éléments vedettes (Hero Spotlight) avec backdrops haute résolution.
     * @returns {Promise<Array<Object>>}
     */
    async getFeaturedHeroItems() {
        const userId = this.getUserId();
        try {
            const data = await this._client.get(`/Items?userId=${userId || ''}&IncludeItemTypes=Movie,Series&Recursive=true&SortBy=CommunityRating,DateCreated&SortOrder=Descending&Limit=6&ImageTypes=Backdrop&Fields=PrimaryImageAspectRatio,Overview,Genres,CommunityRating,OfficialRating,ProductionYear,Taglines`);
            const items = data?.Items || [];
            return items.filter(item => item.BackdropImageTags && item.BackdropImageTags.length > 0);
        } catch (err) {
            this._log.warn('Erreur getFeaturedHeroItems:', err);
            return [];
        }
    }

    // ─── Administration & Monitoring Serveur (Tautulli & Health) ─────────────

    /**
     * Récupère toutes les sessions actives sur le serveur Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getAllSessions() {
        try {
            if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
                const url = this._rawApiClient.getUrl('Sessions');
                const res = await this._rawApiClient.getJSON(url);
                return Array.isArray(res) ? res : (res?.Items || []);
            }
            const data = await this._client.get('/Sessions');
            return Array.isArray(data) ? data : (data?.Items || []);
        } catch (err) {
            this._log.warn('Erreur getAllSessions:', err);
            return [];
        }
    }

    /**
     * Stoppe la lecture d'une session à distance.
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async stopSession(sessionId) {
        if (!sessionId) return false;
        try {
            await this._client.post(`/Sessions/${sessionId}/Playing/Stop`);
            return true;
        } catch (err) {
            this._log.warn('Erreur stopSession:', err);
            return false;
        }
    }

    /**
     * Envoie un message texte sur l'écran d'une session.
     * @param {string} sessionId
     * @param {string} text
     * @param {string} [header='SpaceHub Admin']
     * @param {number} [timeoutMs=8000]
     * @returns {Promise<boolean>}
     */
    async sendMessageToSession(sessionId, text, header = 'SpaceHub Admin', timeoutMs = 8000) {
        if (!sessionId || !text) return false;
        try {
            await this._client.post(`/Sessions/${sessionId}/Message`, {
                Text: text,
                Header: header,
                TimeoutMs: timeoutMs
            });
            return true;
        } catch (err) {
            this._log.warn('Erreur sendMessageToSession:', err);
            return false;
        }
    }

    /**
     * Récupère les informations système du serveur Jellyfin.
     * @returns {Promise<Object|null>}
     */
    async getSystemInfo() {
        try {
            if (this._rawApiClient?.getJSON && this._rawApiClient?.getUrl) {
                const url = this._rawApiClient.getUrl('System/Info');
                return await this._rawApiClient.getJSON(url);
            }
            return await this._client.get('/System/Info');
        } catch (err) {
            this._log.warn('Erreur getSystemInfo:', err);
            return null;
        }
    }

    /**
     * Récupère le nombre total d'éléments indexés par type.
     * @returns {Promise<Object>}
     */
    async getItemCounts() {
        const userId = this.getUserId();
        try {
            const endpoint = userId ? `/Items/Counts?userId=${userId}` : '/Items/Counts';
            return await this._client.get(endpoint);
        } catch (err) {
            this._log.warn('Erreur getItemCounts:', err);
            return { MovieCount: 0, SeriesCount: 0, EpisodeCount: 0, SongCount: 0 };
        }
    }

    /**
     * Déclenche l'actualisation complète de la médiathèque Jellyfin.
     * @returns {Promise<boolean>}
     */
    async refreshLibrary() {
        try {
            await this._client.post('/Library/Refresh');
            return true;
        } catch (err) {
            this._log.warn('Erreur refreshLibrary:', err);
            return false;
        }
    }

    // ─── Administration Système & Console Avancée ────────────────────────────

    /**
     * Récupère la liste de tous les utilisateurs du serveur Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getUsers() {
        try {
            const data = await this._client.get('/Users');
            return Array.isArray(data) ? data : [];
        } catch (err) {
            this._log.warn('Erreur getUsers:', err);
            return [];
        }
    }

    /**
     * Récupère la liste des tâches planifiées du serveur Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getScheduledTasks() {
        try {
            const data = await this._client.get('/ScheduledTasks');
            return Array.isArray(data) ? data : [];
        } catch (err) {
            this._log.warn('Erreur getScheduledTasks:', err);
            return [];
        }
    }

    /**
     * Démarre une tâche planifiée par son ID.
     * @param {string} taskId
     * @returns {Promise<boolean>}
     */
    async startScheduledTask(taskId) {
        if (!taskId) return false;
        try {
            await this._client.post(`/ScheduledTasks/Running/${taskId}`);
            return true;
        } catch (err) {
            this._log.warn(`Erreur startScheduledTask ${taskId}:`, err);
            return false;
        }
    }

    /**
     * Arrête une tâche planifiée en cours d'exécution.
     * @param {string} taskId
     * @returns {Promise<boolean>}
     */
    async stopScheduledTask(taskId) {
        if (!taskId) return false;
        try {
            await this._client.delete(`/ScheduledTasks/Running/${taskId}`);
            return true;
        } catch (err) {
            this._log.warn(`Erreur stopScheduledTask ${taskId}:`, err);
            return false;
        }
    }

    /**
     * Récupère la configuration générale du serveur Jellyfin.
     * @returns {Promise<Object|null>}
     */
    async getGeneralConfiguration() {
        try {
            return await this._client.get('/System/Configuration');
        } catch (err) {
            this._log.warn('Erreur getGeneralConfiguration:', err);
            return null;
        }
    }

    /**
     * Sauvegarde la configuration générale du serveur Jellyfin.
     * @param {Object} config
     * @returns {Promise<boolean>}
     */
    async setGeneralConfiguration(config) {
        if (!config) return false;
        try {
            await this._client.post('/System/Configuration', config);
            return true;
        } catch (err) {
            this._log.warn('Erreur setGeneralConfiguration:', err);
            return false;
        }
    }

    /**
     * Récupère la configuration réseau du serveur Jellyfin.
     * @returns {Promise<Object|null>}
     */
    async getNetworkConfiguration() {
        try {
            return await this._client.get('/System/Configuration/network');
        } catch (err) {
            this._log.warn('Erreur getNetworkConfiguration:', err);
            return null;
        }
    }

    /**
     * Sauvegarde la configuration réseau du serveur Jellyfin.
     * @param {Object} config
     * @returns {Promise<boolean>}
     */
    async setNetworkConfiguration(config) {
        if (!config) return false;
        try {
            await this._client.post('/System/Configuration/network', config);
            return true;
        } catch (err) {
            this._log.warn('Erreur setNetworkConfiguration:', err);
            return false;
        }
    }

    /**
     * Crée un nouvel utilisateur sur le serveur Jellyfin.
     * @param {string} name
     * @param {string} [password='']
     * @returns {Promise<Object|null>}
     */
    async createUser(name, password = '') {
        if (!name) return null;
        try {
            const user = await this._client.post('/Users/New', { Name: name, Password: password });
            return user;
        } catch (err) {
            this._log.warn('Erreur createUser:', err);
            return null;
        }
    }

    /**
     * Supprime un utilisateur du serveur.
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async deleteUser(userId) {
        if (!userId) return false;
        try {
            await this._client.delete(`/Users/${userId}`);
            return true;
        } catch (err) {
            this._log.warn(`Erreur deleteUser ${userId}:`, err);
            return false;
        }
    }

    /**
     * Met à jour la politique et les droits d'un utilisateur.
     * @param {string} userId
     * @param {Object} policy
     * @returns {Promise<boolean>}
     */
    async updateUserPolicy(userId, policy) {
        if (!userId || !policy) return false;
        try {
            await this._client.post(`/Users/${userId}/Policy`, policy);
            return true;
        } catch (err) {
            this._log.warn(`Erreur updateUserPolicy ${userId}:`, err);
            return false;
        }
    }

    /**
     * Récupère la liste des fichiers journaux (logs) du serveur.
     * @returns {Promise<Array<Object>>}
     */
    async getServerLogs() {
        try {
            const data = await this._client.get('/System/Logs');
            return Array.isArray(data) ? data : [];
        } catch (err) {
            this._log.warn('Erreur getServerLogs:', err);
            return [];
        }
    }

    /**
     * Récupère le contenu brut d'un fichier journal.
     * @param {string} logName
     * @returns {Promise<string>}
     */
    async getLogFile(logName) {
        if (!logName) return '';
        try {
            const client = this._client;
            const baseUrl = client?._baseUrl || window.SpaceHub?.auth?.getServerUrl?.() || '';
            const token = client?._apiKey || window.SpaceHub?.auth?.getToken?.() || '';
            const url = `${baseUrl.replace(/\/+$/, '')}/System/Logs/Log?name=${encodeURIComponent(logName)}`;

            const res = await fetch(url, {
                headers: token ? { 'Authorization': `MediaBrowser Client="SpaceHub", Token="${token}"`, 'X-Emby-Token': token } : {}
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            this._log.warn(`Erreur getLogFile ${logName}:`, err);
            return `[Erreur lors de la lecture du fichier journal : ${err.message}]`;
        }
    }

    /**
     * Récupère les options de configuration de transcodage / accélération matérielle.
     * @returns {Promise<Object|null>}
     */
    async getEncodingOptions() {
        try {
            return await this._client.get('/System/Configuration/encoding');
        } catch (err) {
            this._log.warn('Erreur getEncodingOptions:', err);
            return null;
        }
    }

    /**
     * Sauvegarde les options de transcodage.
     * @param {Object} options
     * @returns {Promise<boolean>}
     */
    async setEncodingOptions(options) {
        if (!options) return false;
        try {
            await this._client.post('/System/Configuration/encoding', options);
            return true;
        } catch (err) {
            this._log.warn('Erreur setEncodingOptions:', err);
            return false;
        }
    }

    /**
     * Récupère la liste des plugins serveur installés sur Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getPlugins() {
        try {
            const data = await this._client.get('/Plugins');
            return Array.isArray(data) ? data : [];
        } catch (err) {
            this._log.warn('Erreur getPlugins:', err);
            return [];
        }
    }

    /**
     * Demande le redémarrage du serveur Jellyfin.
     * @returns {Promise<boolean>}
     */
    async restartServer() {
        try {
            await this._client.post('/System/Restart');
            return true;
        } catch (err) {
            this._log.warn('Erreur restartServer:', err);
            return false;
        }
    }

    /**
     * Demande l'arrêt du serveur Jellyfin.
     * @returns {Promise<boolean>}
     */
    async shutdownServer() {
        try {
            await this._client.post('/System/Shutdown');
            return true;
        } catch (err) {
            this._log.warn('Erreur shutdownServer:', err);
            return false;
        }
    }

    // ─── URL d'Images ─────────────────────────────────────────────────────────

    getImageUrl(itemId, type = 'Primary', options = {}) {
        return this._client?.getImageUrl(itemId, type, options) || '';
    }
}

export default JellyfinAPI;
