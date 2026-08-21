/**
 * SpaceHub — Federated Search across Multiple Jellyfin Servers
 * Version: 1.0.0
 *
 * Moteur de recherche fédérée capable d'interroger plusieurs serveurs Jellyfin
 * en parallèle et de consolider les résultats en indiquant leur serveur source.
 */

'use strict';

import Logger from '../../core/Logger.js';

class FederatedSearch {
    constructor(serverManager) {
        this._log = new Logger('FederatedSearch');
        this._serverManager = serverManager;
    }

    /**
     * Recherche un terme sur tous les serveurs Jellyfin enregistrés.
     * @param {string} searchTerm
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>} Liste des items trouvés avec étiquette de serveur
     */
    async searchAll(searchTerm, options = {}) {
        const term = (searchTerm || '').trim();
        if (!term || term.length < 2) return [];

        const servers = this._serverManager?.getServers() || [];
        if (servers.length === 0) return [];

        this._log.info(`Recherche fédérée de "${term}" sur ${servers.length} serveur(s)...`);

        const promises = servers.map(async (server) => {
            try {
                const limit = options.limit || 12;
                const endpoint = `${server.url}/Items?SearchTerm=${encodeURIComponent(term)}&Recursive=true&IncludeItemTypes=Movie,Series,Episode,MusicAlbum,Audio,Book&Limit=${limit}&Fields=Overview,MediaStreams`;
                
                const res = await fetch(endpoint, {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `MediaBrowser Token="${server.token}"`
                    },
                    timeout: 8000
                });

                if (!res.ok) return [];

                const data = await res.json();
                const items = data?.Items || [];

                return items.map(item => ({
                    ...item,
                    _serverId: server.id,
                    _serverName: server.name,
                    _serverUrl: server.url,
                    _serverToken: server.token
                }));
            } catch (err) {
                this._log.warn(`Échec recherche sur ${server.name}:`, err.message);
                return [];
            }
        });

        const resultsArrays = await Promise.all(promises);
        const consolidated = resultsArrays.flat();

        this._log.info(`Recherche fédérée terminée : ${consolidated.length} résultat(s) trouvés au total.`);
        return consolidated;
    }
}

export default FederatedSearch;
