/**
 * SpaceHub — spacehub.ratings plugin
 *
 * Plugin SDK de notes : alimente les badges Rotten Tomatoes / IMDb / Metacritic
 * via OMDb API, la recherche OMDb par titre (médias sans IMDb ID) et les textes
 * de critiques réels via TMDB (clé TMDB optionnelle).
 * La note étoile (CommunityRating) vient de Jellyfin nativement.
 *
 * Permissions requises : network.external.read, jellyfin.metadata.read
 * Contributions SDK : aucune (les fournisseurs sont posés sur RatingCacheService).
 *
 * Configuration : clés API OMDb et TMDB via PluginManager.getPluginStorage().
 * Accessible à tout compte — ces permissions n'agissent pas sur le serveur.
 */
'use strict';

const PLUGIN_ID = 'spacehub.ratings';

/**
 * Écart d'année toléré lors d'une recherche par titre.
 *
 * Un an, et pas davantage : c'est l'écart réel entre une année de festival et
 * une année de sortie, ou entre deux bases qui ne datent pas au même moment.
 * À deux ans, on commencerait à confondre des films différents portant le même
 * titre — un remake sort rarement l'année suivante, souvent la décennie
 * d'après, mais la marge doit rester une marge.
 */
const TOLERANCE_ANNEE = 1;

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
    // `contributions: ['metadataProvider']` figurait ici et n'était JAMAIS
    // enregistré : ce plugin n'est pas un fournisseur de métadonnées au sens
    // du SDK, il alimente `RatingCacheService` par ses trois `setProvider`.
    // Déclarer une contribution qu'on ne fournit pas trompe la console des
    // plugins et tout code qui s'y fierait. Ajouter un enregistrement factice
    // pour « faire coller » le manifeste aurait été pire — on retire la
    // déclaration, le nettoyage réel se fait dans `onDisable`/`onUnload`.
    contributions: [],

    // A6 — La configuration de ce greffon était écrite EN DUR dans
    // SettingsPanel.js : deux champs, deux identifiants, quatre gestionnaires.
    // Tout nouveau greffon ayant besoin d'un réglage exigeait donc de modifier
    // l'application hôte, ce qui annule une bonne part de l'intérêt d'avoir
    // des greffons. Le manifeste le déclare maintenant, et l'hôte le rend.
    settingsSchema: [
        {
            cle: 'omdbApiKey',
            type: 'secret',
            titre: 'Clé API OMDb',
            invite: 'Clé API OMDb',
            aide: 'Gratuite, 1 000 requêtes par jour. Sans elle, aucune note externe.',
        },
        {
            cle: 'tmdbApiKey',
            type: 'secret',
            titre: 'Clé API TMDB',
            invite: 'Clé API TMDB (optionnelle)',
            aide: 'Facultative : elle sert aux textes de critiques.',
        },
        {
            cle: 'tmdbLanguage',
            type: 'select',
            titre: 'Langue des critiques',
            defaut: 'fr-FR',
            options: [
                { valeur: 'fr-FR', libelle: 'Français' },
                { valeur: 'en-US', libelle: 'Anglais' },
                { valeur: 'es-ES', libelle: 'Espagnol' },
                { valeur: 'de-DE', libelle: 'Allemand' },
            ],
        },
    ],

    healthCheck: async (ctx) => {
        const key = ctx.settings.get('omdbApiKey', null);
        if (!key) throw new Error('Clé API OMDb non configurée.');
    },

    onLoad: async (ctx) => {
        // Ce crochet allait chercher `window.SpaceHub.core.ratingCache`. C'était
        // le contournement même que le contrôle statique des sources doit
        // interdire — et il était donné en exemple par le greffon livré avec
        // l'application. Le service arrive désormais par le contexte, derrière
        // la permission `jellyfin.metadata.read` que ce greffon demande déjà.
        const ratingCache = ctx.ratings;
        if (!ratingCache || typeof ratingCache.setProvider !== 'function') {
            throw new Error('Service de notes indisponible dans ce contexte.');
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
        //
        // D5 — L'EXIGENCE D'ANNÉE EXACTE FAISAIT DISPARAÎTRE DES FILMS ENTIERS.
        //
        // La rigueur était louable, la conséquence l'était moins. L'année d'un
        // film diffère couramment d'une source à l'autre : présenté en festival
        // une année, sorti en salle la suivante, Jellyfin retient l'une et OMDb
        // l'autre. Ces titres n'obtenaient JAMAIS de note, en silence.
        //
        // On tolère donc un an d'écart. Ce n'est pas un relâchement : la
        // recherche par TITRE reste exacte, seule l'année admet le décalage
        // qu'elle a réellement dans la nature. Au-delà d'un an, on refuse —
        // deux films de même titre à cinq ans d'intervalle sont deux films.
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
            if (year) {
                // `data.Year` peut valoir « 2019 » ou « 2019–2023 » pour une
                // série : on lit la première année, pas la chaîne entière.
                const annonceeMatch = String(data.Year).match(/\d{4}/);
                const annoncee = annonceeMatch ? Number(annonceeMatch[0]) : NaN;
                if (!Number.isFinite(annoncee)) return null;
                if (Math.abs(annoncee - Number(year)) > TOLERANCE_ANNEE) return null;
            }
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

    // `clearProvider()` ne retirait QUE le fournisseur de notes. La recherche
    // par titre et les textes critiques n'avaient aucune méthode de retrait :
    // désactiver ce greffon laissait deux de ses trois fermetures vivantes, qui
    // continuaient d'interroger OMDb et TMDB avec la clé de l'utilisateur —
    // pour un greffon qu'il croyait éteint.
    onDisable: async (ctx) => {
        ctx.ratings?.clearProviders?.();
    },

    onUnload: async (ctx) => {
        ctx.ratings?.clearProviders?.();
    }
};

export default manifest;
