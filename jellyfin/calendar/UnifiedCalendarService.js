/**
 * SpaceHub — UnifiedCalendarService
 * Agrégateur universel de sorties médias croisant Sonarr, Radarr et Jellyseerr.
 */

'use strict';

import Logger from '../../core/Logger.js';

export class UnifiedCalendarService {
    constructor() {
        this._log = new Logger('UnifiedCalendarService');
    }

    /**
     * Récupère tous les événements médias prévus pour une période donnée.
     * @param {Date} [startDate] Date de début (par défaut: aujourd'hui - 1 jour)
     * @param {Date} [endDate] Date de fin (par défaut: aujourd'hui + 30 jours)
     * @returns {Promise<Array<Object>>}
     */
    async getEvents(startDate = null, endDate = null) {
        const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
        const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const events = [];

        // 1. Récupération Sonarr (Épisodes de séries)
        try {
            const sonarrApi = window.SpaceHub?.integrations?.sonarr?.api;
            if (sonarrApi?.getCalendar) {
                const episodes = await sonarrApi.getCalendar(start, end, true);
                if (Array.isArray(episodes)) {
                    episodes.forEach(ep => {
                        const airDate = ep.airDateUtc ? new Date(ep.airDateUtc) : (ep.airDate ? new Date(ep.airDate) : null);
                        if (!airDate) return;

                        const series = ep.series || {};
                        const sNum = String(ep.seasonNumber || 1).padStart(2, '0');
                        const eNum = String(ep.episodeNumber || 1).padStart(2, '0');
                        
                        let poster = '';
                        let fanart = '';

                        const posterImg = (series.images || []).find(i => (i.coverType || '').toLowerCase() === 'poster');
                        if (posterImg) {
                            if (posterImg.remoteUrl) {
                                poster = posterImg.remoteUrl;
                            } else if (posterImg.url) {
                                poster = posterImg.url.startsWith('http') ? posterImg.url : `${sonarrApi.baseUrl}${posterImg.url}${posterImg.url.includes('?') ? '&' : '?'}apikey=${sonarrApi.apiKey}`;
                            }
                        }

                        const fanartImg = (series.images || []).find(i => (i.coverType || '').toLowerCase() === 'fanart' || (i.coverType || '').toLowerCase() === 'background');
                        if (fanartImg) {
                            if (fanartImg.remoteUrl) {
                                fanart = fanartImg.remoteUrl;
                            } else if (fanartImg.url) {
                                fanart = fanartImg.url.startsWith('http') ? fanartImg.url : `${sonarrApi.baseUrl}${fanartImg.url}${fanartImg.url.includes('?') ? '&' : '?'}apikey=${sonarrApi.apiKey}`;
                            }
                        }

                        events.push({
                            id: `sonarr-${ep.id}`,
                            source: 'sonarr',
                            type: 'episode',
                            title: series.title || 'Série sans titre',
                            subTitle: `S${sNum}E${eNum} — ${ep.title || 'Épisode'}`,
                            releaseDate: airDate,
                            dateStr: airDate.toISOString().split('T')[0],
                            posterUrl: poster,
                            backdropUrl: fanart || poster,
                            overview: ep.overview || series.overview || '',
                            hasFile: ep.hasFile || false,
                            monitored: ep.monitored !== false,
                            network: series.network || '',
                            raw: ep
                        });
                    });
                }
            }
        } catch (err) {
            this._log.debug('Erreur récupération calendrier Sonarr:', err);
        }

        // 2. Récupération Radarr (Sorties de films)
        try {
            const radarrApi = window.SpaceHub?.integrations?.radarr?.api;
            if (radarrApi?.getCalendar) {
                const movies = await radarrApi.getCalendar(start, end);
                if (Array.isArray(movies)) {
                    movies.forEach(m => {
                        // Date de sortie physique / digitale / cinéma
                        const releaseDateStr = m.digitalRelease || m.physicalRelease || m.inCinemas;
                        const releaseDate = releaseDateStr ? new Date(releaseDateStr) : null;
                        if (!releaseDate) return;

                        let poster = '';
                        let fanart = '';

                        const posterImg = (m.images || []).find(i => (i.coverType || '').toLowerCase() === 'poster');
                        if (posterImg) {
                            if (posterImg.remoteUrl) {
                                poster = posterImg.remoteUrl;
                            } else if (posterImg.url) {
                                poster = posterImg.url.startsWith('http') ? posterImg.url : `${radarrApi.baseUrl}${posterImg.url}${posterImg.url.includes('?') ? '&' : '?'}apikey=${radarrApi.apiKey}`;
                            }
                        }

                        const fanartImg = (m.images || []).find(i => (i.coverType || '').toLowerCase() === 'fanart' || (i.coverType || '').toLowerCase() === 'background');
                        if (fanartImg) {
                            if (fanartImg.remoteUrl) {
                                fanart = fanartImg.remoteUrl;
                            } else if (fanartImg.url) {
                                fanart = fanartImg.url.startsWith('http') ? fanartImg.url : `${radarrApi.baseUrl}${fanartImg.url}${fanartImg.url.includes('?') ? '&' : '?'}apikey=${radarrApi.apiKey}`;
                            }
                        }

                        let releaseType = 'Sortie Digitale';
                        if (m.inCinemas && !m.digitalRelease) releaseType = 'Cinéma';
                        if (m.physicalRelease && !m.digitalRelease) releaseType = 'Blu-ray / DVD';

                        events.push({
                            id: `radarr-${m.id}`,
                            source: 'radarr',
                            type: 'movie',
                            title: m.title || 'Film sans titre',
                            subTitle: `${m.year || ''} • ${releaseType}`,
                            releaseDate: releaseDate,
                            dateStr: releaseDate.toISOString().split('T')[0],
                            posterUrl: poster,
                            backdropUrl: fanart || poster,
                            overview: m.overview || '',
                            hasFile: m.hasFile || false,
                            monitored: m.monitored !== false,
                            studio: m.studio || '',
                            raw: m
                        });
                    });
                }
            }
        } catch (err) {
            this._log.debug('Erreur récupération calendrier Radarr:', err);
        }

        // 3. Récupération Jellyseerr (Sorties populaires attendues)
        try {
            const jellyseerrApi = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (jellyseerrApi?.getUpcoming) {
                const upData = await jellyseerrApi.getUpcoming();
                const upcoming = upData?.results || (Array.isArray(upData) ? upData : []);
                upcoming.slice(0, 15).forEach(item => {
                    const dateStr = item.releaseDate || item.firstAirDate;
                    const rDate = dateStr ? new Date(dateStr) : null;
                    if (!rDate || rDate < start || rDate > end) return;

                    const title = item.title || item.name || 'Média Jellyseerr';
                    const isMovie = item.mediaType === 'movie';
                    const poster = item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : '';
                    const fanart = item.backdropPath ? `https://image.tmdb.org/t/p/w1280${item.backdropPath}` : poster;

                    // Éviter les doublons stricts avec Radarr/Sonarr
                    const exists = events.some(e => e.title.toLowerCase() === title.toLowerCase());
                    if (!exists) {
                        events.push({
                            id: `jellyseerr-${item.id}`,
                            source: 'jellyseerr',
                            type: isMovie ? 'movie' : 'series',
                            title: title,
                            subTitle: isMovie ? 'Film Attendu' : 'Série Attendue',
                            releaseDate: rDate,
                            dateStr: rDate.toISOString().split('T')[0],
                            posterUrl: poster,
                            backdropUrl: fanart || poster,
                            overview: item.overview || '',
                            hasFile: false,
                            monitored: true,
                            raw: item
                        });
                    }
                });
            }
        } catch (err) {
            this._log.debug('Erreur récupération calendrier Jellyseerr:', err);
        }

        // Tri chronologique rigoureux (du plus proche au plus lointain)
        events.sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime());

        return events;
    }

    /**
     * Regroupe les événements par jour pour l'affichage chronologique.
     * @param {Array<Object>} events
     * @returns {Map<string, Array<Object>>}
     */
    groupByDay(events) {
        const grouped = new Map();
        events.forEach(event => {
            const dayKey = event.dateStr;
            if (!grouped.has(dayKey)) {
                grouped.set(dayKey, []);
            }
            grouped.get(dayKey).push(event);
        });
        return grouped;
    }
}

export default UnifiedCalendarService;
