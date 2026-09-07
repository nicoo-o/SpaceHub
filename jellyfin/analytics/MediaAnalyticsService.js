/**
 * SpaceHub — MediaAnalyticsService
 * Moteur de calcul statistique et d'analyse de visionnage (Tautulli / Wrapped like).
 */

'use strict';

import Logger from '../../core/Logger.js';

import * as svc from '../../core/services.js';
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

        const jfApi = svc.jellyfinApi();
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

        // AUDIT — un échec ne doit pas ressembler à un résultat.
        //
        // `stats` est un objet plein de zéros. Le renvoyer quand l'API est
        // absente ou qu'un appel échoue faisait afficher « 0 h · 0 films ·
        // 0 épisodes · 0 % 4K » comme s'il s'agissait de mesures. L'écran de
        // statistiques ne pouvait pas distinguer « médiathèque vide » de
        // « je n'ai rien pu lire », et le `catch` de l'appelant n'était jamais
        // atteint puisque le service ne relançait rien.
        //
        // `mesure` porte cette distinction jusqu'à l'affichage.
        stats.mesure = false;
        stats.erreur = null;

        if (!jfApi) {
            stats.erreur = 'API Jellyfin indisponible.';
            return stats;
        }

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
                let totalOccurrencesGenres = 0;
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

                        // Le comptage des genres était HORS de ce bloc : il
                        // portait sur toute la médiathèque, vue ou non. Ce
                        // n'était donc pas « vos genres favoris » mais la
                        // composition du catalogue de l'administrateur — et
                        // l'état vide invoquait pourtant des « données de
                        // visionnage » qui n'entraient pour rien dans le
                        // calcul. Un genre se compte parmi ce qu'on a REGARDÉ.
                        (item.Genres || []).forEach(genre => {
                            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                            totalOccurrencesGenres += 1;
                        });
                    }

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

                // Le dénominateur était la somme des CINQ PREMIERS genres :
                // les cinq barres totalisaient donc toujours ~100 %, et un
                // genre représentant 8 % des visionnages pouvait s'afficher
                // « 34 % ». Le chiffre avait l'allure d'une part, il n'en
                // était pas une. On divise par le total réel des occurrences.
                const denominateur = totalOccurrencesGenres || 1;
                stats.topGenres = sortedGenres.map(g => ({
                    name: g.name,
                    count: g.count,
                    percentage: Math.round((g.count / denominateur) * 100)
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

            // La mesure a abouti : c'est la seule branche qui l'affirme.
            stats.mesure = true;
            this._cachedStats = stats;
            this._lastCalculated = Date.now();
            return stats;
        } catch (err) {
            this._log.warn('Erreur calcul statistiques:', err);
            stats.mesure = false;
            stats.erreur = err?.message || 'Le serveur n\'a pas répondu.';
            // Un échec ne se met PAS en cache : il faut réessayer au prochain
            // affichage, pas figer l'ignorance pour la durée du cache.
            return stats;
        }
    }
}

export default MediaAnalyticsService;
