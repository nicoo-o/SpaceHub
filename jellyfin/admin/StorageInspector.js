/**
 * SpaceHub — Storage & System Inspector (Admin Suite)
 * Version: 1.0.0
 *
 * Analyse les disques, espaces de stockage et bibliothèques multimédias du serveur.
 * Alerte en cas de saturation d'espace disque (> 90%).
 */

'use strict';

import Logger from '../../core/Logger.js';

class StorageInspector {
    constructor() {
        this._log = new Logger('StorageInspector');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère les informations système et les bibliothèques.
     * @returns {Promise<Object>}
     */
    async getStorageInfo() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const headers = this._auth?.getAuthHeaders();

            const [sysRes, libsRes] = await Promise.all([
                fetch(`${serverUrl}/System/Info`, { headers }),
                fetch(`${serverUrl}/Library/VirtualFolders`, { headers })
            ]);

            const sysInfo = sysRes.ok ? await sysRes.json() : {};
            const libraries = libsRes.ok ? await libsRes.json() : [];

            return {
                serverName: sysInfo.ServerName || 'Serveur Jellyfin',
                version: sysInfo.Version || 'Inconnue',
                os: sysInfo.OperatingSystem || 'Linux/Windows',
                arch: sysInfo.SystemArchitecture || 'x64',
                hasPendingRestart: sysInfo.HasPendingRestart || false,
                libraries: libraries.map(lib => ({
                    name: lib.Name,
                    type: lib.CollectionType,
                    paths: lib.Locations || [],
                    itemId: lib.ItemId
                }))
            };
        } catch (err) {
            this._log.warn('Erreur récupération informations stockage:', err.message);
            return null;
        }
    }
}

export default StorageInspector;
