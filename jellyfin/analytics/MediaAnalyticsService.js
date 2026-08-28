/**
 * SpaceHub — MediaAnalyticsService
 * Moteur de calcul statistique et d'analyse de visionnage (Tautulli / Wrapped like).
 */

'use strict';

import Logger from '../../core/Logger.js';

export class MediaAnalyticsService {
    constructor() {
        this._log = new Logger('MediaAnalyticsService');
        this._cachedStats = null;
        this._lastCalculated = 0;
    }

    /**
     * Calcule l'ensemble des métriques de visionnage de l'utilisateur.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<Object>}
     */
    async getStats(forceRefresh = false) {
        if (!forceRefresh && this._cachedStats && (Date.now() - this._lastCalculated < 60000)) {
            return this._cachedStats;
        }

        const jfApi = window.SpaceHub?.jellyfin?.api;
        const userId = jfApi?.getUserId?.();

        const stats = {
            totalWatchTimeHours: 0,
            totalWatchTimeDays: '0.0',
            playedMoviesCount: 0,
            playedEpisodesCount: 0,
            totalItemsCount: 0,
            topGenres: [],
            qualityDistribution: { uhd4k: 0, fhd1080p: 0, sd720p: 0, hdr: 0 },
            resolutionPercentages: { uhd4k: 0, fhd1080p: 0, other: 0 }
        };

        if (!jfApi) return stats;

        try {
            // Récupérer tous les éléments de la médiathèque pour calculer les métriques
            const { items } = await jfApi.getItemsWithTotal('', {
                recursive: true,
                includeItemTypes: 'Movie,Episode',
                fields: 'RunTimeTicks,UserData,Genres,MediaStreams,MediaSources,ProductionYear'
            });

            if (Array.isArray(items) && items.length > 0) {
                let totalTicks = 0;
                let moviesCount = 0;
                let episodesCount = 0;
                const genreCounts = {};
                let count4k = 0;
                let count1080 = 0;
                let countOther = 0;
                let countHdr = 0;

                items.forEach(item => {
                    const isPlayed = item.UserData?.Played === true || (item.UserData?.PlayCount || 0) > 0;
                    const runTicks = item.RunTimeTicks || 0;

                    if (isPlayed) {
                        const playCount = Math.max(1, item.UserData?.PlayCount || 1);
                        totalTicks += (runTicks * playCount);

                        if (item.Type === 'Movie') moviesCount++;
                        if (item.Type === 'Episode') episodesCount++;
                    }

                    // Comptage des genres
                    (item.Genres || []).forEach(genre => {
                        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                    });

                    // Détection de la résolution et HDR
                    const stream = (item.MediaStreams || []).find(s => s.Type === 'Video') || {};
                    const width = stream.Width || 0;
                    const videoRange = stream.VideoRange || stream.ColorRange || '';
                    const isHdr = videoRange.toLowerCase().includes('hdr') || videoRange.toLowerCase().includes('dovi') || (stream.VideoDoViTitle);

                    if (isHdr) countHdr++;

                    if (width >= 3800 || stream.DisplayTitle?.includes('4K')) {
                        count4k++;
                    } else if (width >= 1900 || stream.DisplayTitle?.includes('1080')) {
                        count1080++;
                    } else {
                        countOther++;
                    }
                });

                // Calcul du temps en heures et jours
                // 1 tick = 100 nanosecondes = 10^-7 secondes
                const totalSeconds = totalTicks / 10000000;
                const hours = Math.round(totalSeconds / 3600);
                const days = (hours / 24).toFixed(1);

                stats.totalWatchTimeHours = hours;
                stats.totalWatchTimeDays = days;
                stats.playedMoviesCount = moviesCount;
                stats.playedEpisodesCount = episodesCount;
                stats.totalItemsCount = items.length;

                // Tri des top 5 genres
                const sortedGenres = Object.entries(genreCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                const totalGenreOccurrences = sortedGenres.reduce((acc, g) => acc + g.count, 0) || 1;
                stats.topGenres = sortedGenres.map(g => ({
                    name: g.name,
                    count: g.count,
                    percentage: Math.round((g.count / totalGenreOccurrences) * 100)
                }));

                // Répartition des résolutions
                const totalItems = Math.max(1, items.length);
                stats.qualityDistribution = {
                    uhd4k: count4k,
                    fhd1080p: count1080,
                    sd720p: countOther,
                    hdr: countHdr
                };

                stats.resolutionPercentages = {
                    uhd4k: Math.round((count4k / totalItems) * 100),
                    fhd1080p: Math.round((count1080 / totalItems) * 100),
                    other: Math.round((countOther / totalItems) * 100)
                };
            }

            this._cachedStats = stats;
            this._lastCalculated = Date.now();
            return stats;
        } catch (err) {
            this._log.warn('Erreur calcul statistiques:', err);
            return stats;
        }
    }
}

export default MediaAnalyticsService;
