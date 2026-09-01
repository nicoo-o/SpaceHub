/**
 * SpaceHub — spacehub.ratings plugin
 *
 * Plugin SDK de notes : alimente les badges Rotten Tomatoes / IMDb / Metacritic
 * via OMDb API, la recherche OMDb par titre (médias sans IMDb ID) et les textes
 * de critiques réels via TMDB (clé TMDB optionnelle).
 * La note étoile (CommunityRating) vient de Jellyfin nativement.
 *
 * Permissions requises : network.external.read, jellyfin.metadata.read
 * Contributions : metadataProvider
 *
 * Configuration admin : clés API OMDb et TMDB via PluginManager.getPluginStorage()
 */
'use strict';

const PLUGIN_ID = 'spacehub.ratings';

const manifest = {
    id: PLUGIN_ID,
    name: 'Ratings (Rotten Tomatoes / IMDb / Metacritic / TMDB)',
    version: '1.1.0',
    apiVersion: '2.0.0',
    author: 'SpaceHub',
    description: 'Fournit les notes critiques externes (RT / IMDb / Metacritic) via OMDb API et les textes de critiques réels via TMDB. Clés API configurées par l\'administrateur.',
    icon: '🍅',
    isDefault: true,
    permissions: ['network.external.read', 'jellyfin.metadata.read'],
    contributions: ['metadataProvider'],

    healthCheck: async (ctx) => {
        const key = ctx.settings.get('omdbApiKey', null);
        if (!key) throw new Error('Clé API OMDb non configurée.');
    },

    onLoad: async (ctx) => {
        const ratingCache = window.SpaceHub?.core?.ratingCache;
        if (!ratingCache || typeof ratingCache.setProvider !== 'function') {
            throw new Error('RatingCacheService indisponible.');
        }

        // ── 1. Notes OMDb (scores RT / IMDb / Metacritic) ──
        // NOTE : OMDb résout directement un ID d'épisode (ttXXXXXXX) via `i=` —
        // la combinaison `i=<série>&Season=&Episode=` renvoie `Response: False` sur
        // la majorité des séries, elle est donc volontairement abandonnée.
        const fetchOmdb = async (imdbId) => {
            const apiKey = ctx.settings.get('omdbApiKey', null);
            if (!apiKey) return null;

            const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}`;

            const res = await ctx.api.fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.Response === 'False') return null;

            const rtEntry = Array.isArray(data.Ratings)
                ? data.Ratings.find(r => r.Source === 'Rotten Tomatoes')
                : null;
            return {
                imdb: parseFloat(data.imdbRating) || null,
                rt: rtEntry ? (parseInt(rtEntry.Value, 10) || null) : null,
                metacritic: (data.Metascore && data.Metascore !== 'N/A') ? (parseInt(data.Metascore, 10) || null) : null,
                imdbVotes: data.imdbVotes ? (parseInt(String(data.imdbVotes).replace(/,/g, ''), 10) || null) : null
            };
        };

        // ── 2. Recherche OMDb par titre (médias sans ProviderIds.Imdb) ──
        // Année exacte exigée : aucun match approximatif.
        const searchByTitle = async ({ title, year, type }) => {
            const apiKey = ctx.settings.get('omdbApiKey', null);
            if (!apiKey || !title) return null;
            const omdbType = type === 'series' ? 'series' : 'movie';
            const params = [
                `apikey=${encodeURIComponent(apiKey)}`,
                `t=${encodeURIComponent(title)}`,
                `type=${omdbType}`
            ];
            if (year) params.push(`y=${year}`);
            const res = await ctx.api.fetch(`https://www.omdbapi.com/?${params.join('&')}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.Response === 'False' || !data.imdbID) return null;
            if (year && Number(data.Year) !== Number(year)) return null; // exigence d'exactitude
            return data.imdbID;
        };

        // ── 3. Texte critique réel via TMDB (clé optionnelle) ──
        const fetchTmdbText = async (imdbId) => {
            const tmdbKey = ctx.settings.get('tmdbApiKey', null);
            if (!tmdbKey) return null;
            const lang = ctx.settings.get('tmdbLanguage', 'fr-FR');

            // IMDb ID → tmdbId + media_type
            const findRes = await ctx.api.fetch(
                `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?api_key=${encodeURIComponent(tmdbKey)}&external_source=imdb_id&language=${encodeURIComponent(lang)}`
            );
            if (!findRes.ok) return null;
            const found = await findRes.json();
            const movie = found.movie_results?.[0];
            const tv = found.tv_results?.[0];
            const tmdbId = movie?.id || tv?.id;
            const mediaType = movie ? 'movie' : (tv ? 'tv' : null);
            if (!tmdbId || !mediaType) return null;

            // Extraits d'avis réels (texte sourcé, auteur réel)
            const revRes = await ctx.api.fetch(
                `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/reviews?api_key=${encodeURIComponent(tmdbKey)}&language=${encodeURIComponent(lang)}`
            );
            let review = null;
            if (revRes.ok) {
                const revData = await revRes.json();
                const best = Array.isArray(revData.results)
                    ? revData.results.find(r => r.content && r.content.length > 80) || revData.results[0]
                    : null;
                if (best?.content) {
                    review = {
                        text: String(best.content).slice(0, 600),
                        author: best.author ? String(best.author) : 'TMDB',
                        source: 'TMDB',
                        url: best.url || null
                    };
                }
            }

            // Résumé officiel TMDB si aucun avis disponible
            if (!review) {
                const detRes = await ctx.api.fetch(
                    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(tmdbKey)}&language=${encodeURIComponent(lang)}`
                );
                if (detRes.ok) {
                    const det = await detRes.json();
                    if (det.overview) {
                        review = { text: String(det.overview).slice(0, 600), author: 'TMDB', source: 'TMDB', url: null };
                    }
                }
            }
            return review;
        };

        ratingCache.setProvider(fetchOmdb);
        ratingCache.setSearchProvider(searchByTitle);
        ratingCache.setTextProvider(fetchTmdbText);
        ctx.log.info('Providers OMDb + recherche + TMDB enregistrés.');
    },

    onDisable: async () => {
        const ratingCache = window.SpaceHub?.core?.ratingCache;
        if (ratingCache) ratingCache.clearProvider();
    },

    onUnload: async () => {
        const ratingCache = window.SpaceHub?.core?.ratingCache;
        if (ratingCache) ratingCache.clearProvider();
    }
};

export default manifest;
