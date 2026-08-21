/**
 * SpaceHub — Server Supervision
 * Version: 1.0.0
 *
 * Supervision de l'état du serveur Jellyfin et des ressources système.
 * Affiche CPU, RAM, espace disque, activité en direct et statistiques.
 */

'use strict';

import Logger from '../Logger.js';

class ServerSupervision {
    constructor(eventBus, settings) {
        this._log = new Logger('ServerSupervision');
        this._eventBus = eventBus;
        this._settings = settings;
        this._refreshInterval = null;
        this._currentData = null;

        this._registerDefaults();
        this._log.info('Server Supervision initialisé.');
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'supervision.refreshInterval': 30000, // 30 secondes
            'supervision.enabled': true
        });
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Démarre la supervision automatique.
     */
    start() {
        if (this._refreshInterval) return;

        this._refresh();
        const interval = this._settings.get('supervision.refreshInterval', 30000);
        this._refreshInterval = setInterval(() => this._refresh(), interval);
        this._log.info('Supervision démarrée');
    }

    /**
     * Arrête la supervision.
     */
    stop() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        this._log.info('Supervision arrêtée');
    }

    /**
     * Rafraîchit les données de supervision.
     * @private
     */
    async _refresh() {
        try {
            const data = await this._gatherData();
            this._currentData = data;
            this._eventBus.emit('supervision:updated', data);
        } catch (err) {
            this._log.error('Erreur rafraîchissement supervision:', err);
        }
    }

    /**
     * Récupère toutes les données de supervision.
     * @returns {Promise<Object>}
     */
    async _gatherData() {
        const api = this._apiClient;
        if (!api) return null;

        const [systemInfo, sessions, activityLog, libraries] = await Promise.allSettled([
            this._getSystemInfo(),
            this._getActiveSessions(),
            this._getRecentActivity(),
            this._getLibrariesStats()
        ]);

        return {
            system: systemInfo.status === 'fulfilled' ? systemInfo.value : null,
            sessions: sessions.status === 'fulfilled' ? sessions.value : [],
            activity: activityLog.status === 'fulfilled' ? activityLog.value : [],
            libraries: libraries.status === 'fulfilled' ? libraries.value : [],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Récupère les infos système via l'API Jellyfin.
     * @private
     */
    async _getSystemInfo() {
        const api = this._apiClient;
        
        // Jellyfin n'expose pas directement CPU/RAM via son API standard
        // On utilise les endpoints disponibles
        const [serverInfo, health] = await Promise.allSettled([
            api.get('/System/Info'),
            api.get('/Health')
        ]);

        const info = serverInfo.status === 'fulfilled' ? serverInfo.value : {};
        const healthData = health.status === 'fulfilled' ? health.value : {};

        return {
            version: info.Version || 'Inconnu',
            operatingSystem: info.OperatingSystem || 'Inconnu',
            architecture: info.Architecture || 'Inconnu',
            productName: info.ProductName || 'Jellyfin',
            status: healthData.Health || 'Unknown',
            localAddress: info.LocalAddress || null
        };
    }

    /**
     * Récupère les sessions actives.
     * @private
     */
    async _getActiveSessions() {
        const api = this._apiClient;
        const data = await api.get('/Sessions');
        
        return (data || []).map(session => ({
            id: session.Id,
            user: session.UserName,
            client: session.Client,
            device: session.DeviceName,
            nowPlayingItem: session.NowPlayingItem ? {
                name: session.NowPlayingItem.Name,
                type: session.NowPlayingItem.Type,
                seriesName: session.NowPlayingItem.SeriesName
            } : null,
            isPaused: session.PlayState?.IsPaused || false,
            playbackPosition: session.PlayState?.PositionTicks || 0
        }));
    }

    /**
     * Récupère l'activité récente.
     * @private
     */
    async _getRecentActivity() {
        const api = this._apiClient;
        // Jellyfin n'a pas d'endpoint d'activité direct, on simule avec les sessions
        const sessions = await api.get('/Sessions');
        
        return (sessions || []).filter(s => s.NowPlayingItem).map(session => ({
            user: session.UserName,
            action: session.PlayState?.IsPaused ? 'Paused' : 'Playing',
            item: session.NowPlayingItem.Name,
            timestamp: new Date().toISOString()
        }));
    }

    /**
     * Récupère les statistiques des bibliothèques.
     * @private
     */
    async _getLibrariesStats() {
        const api = this._apiClient;
        const data = await api.get('/Library/Options');
        
        if (!data?.LibraryOptions) return [];

        const stats = [];
        for (const lib of data.LibraryOptions) {
            try {
                const items = await api.get(`/Items?Recursive=true&ParentId=${lib.Id}&Limit=1`);
                const count = await api.get(`/Items?Recursive=true&ParentId=${lib.Id}&IncludeItemTypes=Movie,Series,AudioBook`);
                
                stats.push({
                    id: lib.Id,
                    name: lib.Name,
                    type: lib.CollectionType,
                    itemCount: count?.TotalRecordCount || 0,
                    lastUpdated: lib.LastRefreshed || null
                });
            } catch (err) {
                stats.push({
                    id: lib.Id,
                    name: lib.Name,
                    type: lib.CollectionType,
                    itemCount: 0,
                    lastUpdated: null
                });
            }
        }

        return stats;
    }

    /**
     * Récupère les données actuelles.
     * @returns {Object|null}
     */
    getCurrentData() {
        return this._currentData;
    }

    /**
     * Calcule l'espace disque par bibliothèque (estimation).
     * @returns {Promise<Array<Object>>}
     */
    async getDiskUsageByLibrary() {
        const api = this._apiClient;
        if (!api) return [];

        try {
            const libraries = await this._getLibrariesStats();
            const usage = [];

            for (const lib of libraries) {
                // Jellyfin n'expose pas la taille exacte, on estime via le nombre d'items
                // Une vraie implémentation nécessiterait un accès filesystem côté serveur
                const estimatedSize = lib.itemCount * 2 * 1024 * 1024 * 1024; // ~2GB par item (estimation)
                
                usage.push({
                    name: lib.name,
                    type: lib.type,
                    itemCount: lib.itemCount,
                    estimatedSizeGB: Math.round(estimatedSize / (1024 * 1024 * 1024))
                });
            }

            return usage;
        } catch (err) {
            this._log.error('Erreur calcul espace disque:', err);
            return [];
        }
    }

    /**
     * Récupère les statistiques de visionnage (style Tautulli basique).
     * @returns {Promise<Object>}
     */
    async getViewingStats() {
        const api = this._apiClient;
        if (!api) return null;

        try {
            const users = await api.get('/Users');
            const stats = {};

            for (const user of users) {
                const userData = await api.get(`/Users/${user.Id}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Limit=1`);
                const playedItems = await api.get(`/Users/${user.Id}/Items?Recursive=true&Filters=IsPlayed&IncludeItemTypes=Movie,Series`);
                
                stats[user.Name] = {
                    totalItems: userData?.TotalRecordCount || 0,
                    playedItems: playedItems?.TotalRecordCount || 0,
                    playCount: Math.round((playedItems?.TotalRecordCount || 0) / (userData?.TotalRecordCount || 1) * 100)
                };
            }

            return stats;
        } catch (err) {
            this._log.error('Erreur stats visionnage:', err);
            return null;
        }
    }
}

export default ServerSupervision;
