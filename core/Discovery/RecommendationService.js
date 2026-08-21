/**
 * SpaceHub — RecommendationService
 * Version: 1.0.0
 *
 * Moteur de découverte média intelligent.
 * Génère des recommandations basées sur l'historique Jellyfin,
 * détecte les pépites cachées et agrège les tendances du serveur.
 */

'use strict';

import Logger from '../Logger.js';

class RecommendationService {
    constructor(eventBus) {
        this._log = new Logger('RecommendationService');
        this._eventBus = eventBus;
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Récupère des recommandations personnalisées via l'API Jellyfin.
     */
    async getPersonalized(limit = 10) {
        const userId = window.SpaceHub?.auth?.getUserId();
        if (!userId) return [];
        try {
            const data = await this._apiClient.get(`/Users/${userId}/Suggestions?Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating,Overview`);
            return data?.Items || [];
        } catch (err) {
            this._log.error('Erreur suggestions personnalisées:', err);
            return [];
        }
    }

    /**
     * Récupère les tendances du serveur (plus regardés récemment).
     */
    async getTrending(limit = 10) {
        try {
            const data = await this._apiClient.get(`/Items?Recursive=true&SortBy=PlayCount,CommunityRating&SortOrder=Descending&IncludeItemTypes=Movie,Series&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating,UserData`);
            return data?.Items || [];
        } catch (err) {
            this._log.error('Erreur tendances:', err);
            return [];
        }
    }

    /**
     * Recommande des médias similaires basés sur un élément donné.
     * @param {Object} item - Média de référence
     * @param {number} limit
     */
    async getSimilar(item, limit = 8) {
        if (!item?.Id) return [];
        const userId = window.SpaceHub?.auth?.getUserId();
        try {
            const data = await this._apiClient.get(`/Items/${item.Id}/Similar?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating`);
            return data?.Items || [];
        } catch (err) {
            this._log.warn(`Impossible de récupérer les similaires pour ${item.Name}:`, err.message);
            return [];
        }
    }

    /**
     * Détecte les "Pépites Cachées" : films/séries très bien notés (> 7.5) mais jamais visionnés.
     * @param {number} limit
     */
    async getHiddenGems(limit = 10) {
        const userId = window.SpaceHub?.auth?.getUserId();
        try {
            const data = await this._apiClient.get(`/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&IsPlayed=false&MinCommunityRating=7.5&SortBy=CommunityRating,Random&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating,Overview`);
            return data?.Items || [];
        } catch (err) {
            this._log.error('Erreur récupération pépites cachées:', err);
            return [];
        }
    }

    /**
     * Récupère les meilleurs médias d'un genre donné.
     * @param {string} genre
     * @param {number} limit
     */
    async getTopByGenre(genre, limit = 10) {
        const userId = window.SpaceHub?.auth?.getUserId();
        try {
            const data = await this._apiClient.get(`/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Genres=${encodeURIComponent(genre)}&SortBy=CommunityRating&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating`);
            return data?.Items || [];
        } catch (err) {
            this._log.error(`Erreur top genre ${genre}:`, err);
            return [];
        }
    }
}

export default RecommendationService;
