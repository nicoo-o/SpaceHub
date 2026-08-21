/**
 * SpaceHub — Lidarr API Client
 * Version: 1.0.0
 *
 * Client API pour l'intégration Lidarr (Musique automatisée).
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';

class LidarrApi extends BaseApiClient {
    constructor(baseUrl, apiKey) {
        super(baseUrl, apiKey, {}, { devProxy: true });
    }

    /**
     * Teste la connexion à Lidarr.
     */
    async testConnection() {
        try {
            await this.get('/api/v1/system/status');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Récupère le calendrier des sorties d'albums.
     */
    getCalendar(start, end) {
        return this.get(`/api/v1/calendar?start=${start}&end=${end}`);
    }

    /**
     * Récupère la file d'attente de téléchargement.
     */
    getQueue() {
        return this.get('/api/v1/queue');
    }

    /**
     * Récupère la liste des artistes.
     */
    getArtists() {
        return this.get('/api/v1/artist');
    }
}

export default LidarrApi;
