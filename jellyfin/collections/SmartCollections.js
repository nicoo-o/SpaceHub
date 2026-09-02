/**
 * SpaceHub — Smart Collections
 * Version: 0.5.0
 *
 * Moteur de collections intelligentes dynamiques pour Jellyfin.
 * Permet de générer des collections virtuelles basées sur des critères dynamiques :
 * - Les mieux notés (Top Rated)
 * - Films cultes par décennie (80s, 90s, 2000s)
 * - Média non vus par genre (Sci-Fi, Action, Animation, etc.)
 * - Récemment mis à jour
 */

'use strict';

import Logger from '../../core/Logger.js';

import * as svc from '../../core/services.js';
class SmartCollections {
    constructor() {
        this._log = new Logger('SmartCollections');
        this._cache = svc.cache() || null;
        this._log.info('Initialisé.');
    }

    get _apiClient() {
        return svc.api()?.getClient('jellyfin');
    }

    /**
     * Récupère les films les mieux notés de la bibliothèque (note > 7.5).
     * @param {number} [limit=20]
     * @returns {Promise<Array<Object>>}
     */
    async getTopRated(limit = 20) {
        const userId = window.ApiClient?.getCurrentUserId?.() || '';
        const params = new URLSearchParams({
            userId,
            includeItemTypes: 'Movie,Series',
            sortBy: 'CommunityRating',
            sortOrder: 'Descending',
            minCommunityRating: '7.5',
            recursive: 'true',
            limit: String(limit),
            fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating'
        });

        const data = await this._apiClient.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }

    /**
     * Récupère des médias non visionnés filtrés par genre.
     * @param {string} genre
     * @param {number} [limit=20]
     * @returns {Promise<Array<Object>>}
     */
    async getUnwatchedByGenre(genre, limit = 20) {
        const userId = window.ApiClient?.getCurrentUserId?.() || '';
        const params = new URLSearchParams({
            userId,
            genres: genre,
            isPlayed: 'false',
            includeItemTypes: 'Movie,Series',
            sortBy: 'CommunityRating,DateCreated',
            sortOrder: 'Descending',
            recursive: 'true',
            limit: String(limit),
            fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating,Genres'
        });

        const data = await this._apiClient.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }

    /**
     * Récupère les classiques par plage d'années (ex: 1980 - 1989).
     * @param {number} startYear
     * @param {number} endYear
     * @param {number} [limit=20]
     * @returns {Promise<Array<Object>>}
     */
    async getDecadeClassics(startYear, endYear, limit = 20) {
        const userId = window.ApiClient?.getCurrentUserId?.() || '';
        const params = new URLSearchParams({
            userId,
            years: Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i).join(','),
            includeItemTypes: 'Movie',
            sortBy: 'CommunityRating',
            sortOrder: 'Descending',
            recursive: 'true',
            limit: String(limit),
            fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating'
        });

        const data = await this._apiClient.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }

    /**
     * Exécute une requête de collection intelligente personnalisée.
     * @param {Object} queryParams
     * @returns {Promise<Array<Object>>}
     */
    async queryCustom(queryParams = {}) {
        const userId = window.ApiClient?.getCurrentUserId?.() || '';
        const params = new URLSearchParams({
            userId,
            recursive: 'true',
            fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating',
            ...queryParams
        });

        const data = await this._apiClient.get(`/Items?${params.toString()}`);
        return data?.Items || [];
    }
}

export default SmartCollections;
