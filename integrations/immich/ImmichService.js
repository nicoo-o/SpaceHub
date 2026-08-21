/**
 * SpaceHub — Immich & Photo Service
 * Version: 2.0.0
 *
 * Service pilotant l'accès aux photos (Immich natif et Jellyfin Photos en fallback).
 */

'use strict';

import ImmichApi from './ImmichApi.js';
import Logger from '../../core/Logger.js';

class ImmichService {
    constructor() {
        this._log = new Logger('ImmichService');
        this.api = null;
        this._init();
    }

    _init() {
        const s = window.SpaceHub?.core?.settings;
        const url = s?.get('immich.url', '');
        const key = s?.get('immich.apiKey', '');

        if (url && key) {
            this.api = new ImmichApi(url, key);
        }

        window.SpaceHub?.core?.eventBus?.on('settings:changed', (e) => {
            if (e.key.startsWith('immich.') || (e.key === '*' && (e.value['immich.url'] || e.value['immich.apiKey']))) {
                this._init();
            }
        });
    }

    /**
     * Récupère les photos récentes (Immich ou Jellyfin Photos).
     * @param {number} limit
     * @returns {Promise<Array<Object>>}
     */
    async getRecentPhotos(limit = 60) {
        if (this.api) {
            try {
                const assets = await this.api.getAssets({ limit, type: 'IMAGE' });
                return assets.map(a => ({
                    id: a.id,
                    url: this.api.getThumbnailUrl(a.id, 'thumbnail'),
                    previewUrl: this.api.getThumbnailUrl(a.id, 'preview'),
                    name: a.originalFileName || 'Photo',
                    date: a.fileCreatedAt || a.createdAt,
                    city: a.exifInfo?.city || null,
                    country: a.exifInfo?.country || null,
                    latitude: a.exifInfo?.latitude || null,
                    longitude: a.exifInfo?.longitude || null,
                    camera: a.exifInfo?.model || 'Appareil photo'
                }));
            } catch (err) {
                this._log.warn('Erreur Immich, tentative Jellyfin Photos:', err.message);
            }
        }

        // Fallback Jellyfin Photo Libraries
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');
        if (jellyfin) {
            try {
                const userId = window.SpaceHub?.auth?.getUserId();
                const serverUrl = window.SpaceHub?.auth?.getServerUrl();
                const token = window.SpaceHub?.auth?.getToken();

                const res = await fetch(`${serverUrl}/Items?UserId=${userId}&IncludeItemTypes=Photo&Recursive=true&Limit=${limit}&SortBy=DateCreated&SortOrder=Descending`, {
                    headers: window.SpaceHub?.auth?.getAuthHeaders()
                });

                if (res.ok) {
                    const data = await res.json();
                    return (data.Items || []).map(p => ({
                        id: p.Id,
                        url: `${serverUrl}/Items/${p.Id}/Images/Primary?tag=${p.ImageTags?.Primary || ''}&maxWidth=300&api_key=${token}`,
                        previewUrl: `${serverUrl}/Items/${p.Id}/Images/Primary?tag=${p.ImageTags?.Primary || ''}&maxWidth=1600&api_key=${token}`,
                        name: p.Name || 'Photo',
                        date: p.PremiereDate || p.DateCreated,
                        city: null,
                        country: null,
                        latitude: p.Altitude ? 48.8566 : null, // Indicatif
                        longitude: p.Altitude ? 2.3522 : null,
                        camera: 'Jellyfin Media'
                    }));
                }
            } catch (err) {
                this._log.warn('Erreur Jellyfin Photos:', err.message);
            }
        }

        return [];
    }

    /**
     * Recherche sémantique IA par texte.
     * @param {string} query
     */
    async searchSmart(query) {
        if (!this.api || !query) return [];
        try {
            const results = await this.api.searchSmart(query);
            return results.map(a => ({
                id: a.id,
                url: this.api.getThumbnailUrl(a.id, 'thumbnail'),
                previewUrl: this.api.getThumbnailUrl(a.id, 'preview'),
                name: a.originalFileName || 'Photo',
                date: a.fileCreatedAt
            }));
        } catch (err) {
            this._log.error('Erreur recherche IA:', err);
            return [];
        }
    }

    /**
     * Récupère la liste des personnes (reconnaissance faciale).
     */
    async getPeople() {
        if (!this.api) return [];
        try {
            const data = await this.api.getPeople();
            return data.people || data || [];
        } catch {
            return [];
        }
    }
}

export default ImmichService;
