/**
 * SpaceHub — Immich API Client (Extended)
 * Version: 2.0.0
 *
 * Client API pour l'intégration Immich avec support IA (CLIP),
 * reconnaissance faciale (People), métadonnées GPS et albums.
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
     * Récupère les photos/vidéos avec filtres.
     */
    getAssets(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.get(`/assets?${query}`);
    }

    /**
     * Recherche sémantique IA (CLIP Embeddings) dans les photos.
     * @param {string} queryText - ex: "coucher de soleil sur la plage", "chien"
     */
    searchSmart(queryText) {
        return this.post('/search/smart', { query: queryText });
    }

    /**
     * Récupère la liste des personnes reconnues par l'IA.
     */
    getPeople() {
        return this.get('/people');
    }

    /**
     * Récupère les photos d'une personne spécifique.
     * @param {string} personId
     */
    getPersonAssets(personId) {
        return this.get(`/people/${personId}/assets`);
    }

    /**
     * Récupère les albums.
     */
    getAlbums() {
        return this.get('/albums');
    }

    /**
     * Récupère les marqueurs GPS pour la carte mondiale.
     */
    getMapMarkers() {
        return this.get('/map/markers');
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
