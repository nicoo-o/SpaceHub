/**
 * SpaceHub — Immich API Client
 * Version: 1.0.0
 *
 * Client API pour l'intégration Immich (Photos/Vidéos personnelles).
 */

'use strict';

import { BaseApiClient } from '../../core/ApiClient.js';

class ImmichApi extends BaseApiClient {
    constructor(baseUrl, apiKey) {
        // Immich utilise l'en-tête 'x-api-key'
        super(baseUrl, apiKey, { 'x-api-key': apiKey }, { devProxy: true });
    }

    /**
     * Teste la connexion à Immich.
     */
    async testConnection() {
        try {
            await this.get('/server-info/version');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Récupère tous les actifs (photos/vidéos).
     */
    getAssets(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.get(`/assets?${query}`);
    }

    /**
     * Récupère les albums.
     */
    getAlbums() {
        return this.get('/albums');
    }

    /**
     * Retourne l'URL d'une miniature d'asset.
     */
    getThumbnailUrl(assetId, size = 'thumbnail') {
        const realUrl = `${this.baseUrl}/assets/${assetId}/thumbnail?size=${size}`;
        if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            return `/__sh-proxy?target=${encodeURIComponent(realUrl)}`;
        }
        return realUrl;
    }
}

export default ImmichApi;
