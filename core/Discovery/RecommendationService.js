/**
 * SpaceHub — RecommendationService
 * Version: 1.0.0
 *
 * Moteur de découverte média.
 * Génère des recommandations basées sur l'historique Jellyfin
 * et agrège les tendances du serveur.
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
        const userId = window.SpaceHub.auth.getUserId();
        try {
            // Utilise l'API de suggestion native de Jellyfin
            const data = await this._apiClient.get(`/Users/${userId}/Suggestions?Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,CommunityRating`);
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
            // Simulation : on récupère les items les mieux notés ou ajoutés récemment
            // car Jellyfin n'a pas d'API de tendances "globales" simple sans plugin.
            const data = await this._apiClient.get(`/Items?Recursive=true&SortBy=PlayCount,CommunityRating&SortOrder=Descending&IncludeItemTypes=Movie,Series&Limit=${limit}&Fields=PrimaryImageAspectRatio,UserData`);
            return data?.Items || [];
        } catch (err) {
            this._log.error('Erreur tendances:', err);
            return [];
        }
    }
}

export default RecommendationService;
