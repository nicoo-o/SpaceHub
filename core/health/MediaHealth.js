/**
 * SpaceHub — MediaHealth
 * Version: 1.0.0
 *
 * Détecte les problèmes potentiels dans la bibliothèque Jellyfin :
 * - Médias avec des codecs problématiques
 * - Débits (bitrate) excessifs ou trop faibles
 * - Fichiers manquants ou corrompus
 *
 * Permet de déclencher un re-téléchargement via Sonarr/Radarr en un clic.
 */

'use strict';

import Logger from '../Logger.js';

class MediaHealth {
    constructor() {
        this._log = new Logger('MediaHealth');
        this._log.info('Initialisé.');
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Analyse les derniers ajouts pour détecter des problèmes.
     * @returns {Promise<Array<Object>>}
     */
    async scanPotentialIssues(limit = 100) {
        try {
            const data = await this._apiClient.get(`/Items?Recursive=true&IncludeItemTypes=Movie,Episode&Fields=MediaStreams,Path&Limit=${limit}&SortBy=DateCreated&SortOrder=Descending`);
            const items = data?.Items || [];

            return items.filter(item => {
                const videoStream = item.MediaStreams?.find(s => s.Type === 'Video');
                // Exemple simple : on marque les fichiers sans flux vidéo ou avec des erreurs de bitrate
                if (!videoStream) return true;
                if (videoStream.Bitrate === 0) return true;
                return false;
            });
        } catch (err) {
            this._log.error('Erreur lors du scan MediaHealth:', err);
            return [];
        }
    }

    /**
     * Déclenche une recherche interactive dans Sonarr/Radarr pour un média.
     * @param {Object} item - Média Jellyfin
     */
    async triggerRedownload(item) {
        this._log.info(`Demande de re-téléchargement pour : ${item.Name}`);

        try {
            const isMovie = item.Type === 'Movie';
            const service = isMovie ? window.SpaceHub?.integrations?.radarr : window.SpaceHub?.integrations?.sonarr;

            if (!service || !service.api) {
                throw new Error('Service d\'intégration non disponible');
            }

            // Tentative de recherche par titre (simplifié pour la Phase 3)
            const searchResults = await service.api.get(isMovie ? '/api/v3/movie/lookup?term=' : '/api/v3/series/lookup?term=' + encodeURIComponent(item.Name));
            const match = searchResults?.[0];

            if (match) {
                // Déclencher une recherche automatique
                await service.api.post('/api/v3/command', {
                    name: isMovie ? 'MovieSearch' : 'SeriesSearch',
                    [isMovie ? 'movieIds' : 'seriesIds']: [match.id]
                });
                window.SpaceHub?.ui?.components?.toaster?.success(`Re-téléchargement lancé pour ${item.Name}`);
            } else {
                window.SpaceHub?.ui?.components?.toaster?.warn(`Média non trouvé dans ${isMovie ? 'Radarr' : 'Sonarr'}`);
            }

        } catch (err) {
            this._log.error('Erreur triggerRedownload:', err);
            window.SpaceHub?.ui?.components?.toaster?.error('Échec de la demande de re-téléchargement');
        }
    }
}

export default MediaHealth;
