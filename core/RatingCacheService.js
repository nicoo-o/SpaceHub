/**
 * SpaceHub — RatingCacheService
 * Cache et déduplication des notes externes (OMDb) et des textes critiques (TMDB).
 *
 * - Cache mémoire par imdbId, TTL 24h
 * - Déduplication des requêtes simultanées (même imdbId → un seul appel)
 * - File d'attente max 3 requêtes parallèles
 * - Filtre par fournisseur (jellyfin / rt / imdb / metacritic / tmdb)
 * - Fallback épisode → série : un épisode sans ProviderIds.Imdb hérite des notes
 *   de sa série (mention « note de la série » dans les popovers)
 * - Le plugin spacehub.ratings enregistre ses fonctions via setProvider() /
 *   setSearchProvider() / setTextProvider()
 */
'use strict';

import Logger from './Logger.js';

import * as svc from './services.js';
import { fetchAvecDelai } from './utils/reseau.js';
const PROVIDER_IDS = ['jellyfin', 'rt', 'imdb', 'metacritic', 'tmdb'];

/** Préfixe des clés dans le magasin `general` du CacheManager. */
const PREFIXE_CACHE = 'notes:';

/**
 * Durée de vie d'une ABSENCE : sept jours.
 *
 * Plus longue que celle d'une note (24 h), et c'est délibéré. Une note peut
 * bouger d'un jour à l'autre ; un film absent d'OMDb n'y entre pas du jour au
 * lendemain. Réinterroger ces titres toutes les 24 h reviendrait à dépenser le
 * quota pour des réponses qu'on connaît déjà.
 */
const TTL_ABSENCE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ce qu'on dit à l'utilisateur pour chaque état.
 *
 * Chaque message doit répondre à « et maintenant ? ». « Erreur » ne répond
 * pas ; « quota épuisé, réinitialisation à minuit UTC » répond.
 */
const MESSAGES_ETAT = {
    'ok': 'Les notes externes fonctionnent.',
    'sans-fournisseur': 'Le greffon de notes est désactivé.',
    'sans-cle': 'Aucune clé OMDb : les notes externes sont indisponibles.',
    'cle-invalide': 'Clé OMDb refusée. Vérifiez-la sur omdbapi.com.',
    'quota-epuise': 'Quota OMDb épuisé (1 000 requêtes par jour). Réinitialisation à minuit UTC.',
    'injoignable': 'OMDb est injoignable pour le moment.',
    'inconnu': 'État des notes externes inconnu — aucune requête depuis le démarrage.',
};
const DEFAULT_PROVIDERS = ['jellyfin', 'rt', 'imdb', 'tmdb'];

class RatingCacheService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.settings]
     * @param {() => Object|null} [options.cache] accès PARESSEUX au CacheManager.
     *   Paresseux parce que ce service est construit tôt : une référence prise
     *   maintenant serait nulle pour toute la session.
     */
    constructor({ settings = null, cache = null } = {}) {
        this._settings = settings || (typeof window !== 'undefined' ? svc.settings() : null);
        this._cache = cache || (() => (typeof window !== 'undefined' ? svc.cache() : null));
        this._ttlAbsence = TTL_ABSENCE_MS;
        this._log = new Logger('RatingCache');
        this._memory = new Map();
        this._inFlight = new Map();
        this._queue = [];
        this._active = 0;
        this._maxParallel = 3;
        this._ttl = 24 * 60 * 60 * 1000;
        this._provider = null;
        this._searchProvider = null;
        this._textProvider = null;
        this._textMemory = new Map();
        this._seriesIdMemory = new Map();
        /** @type {{etat: string, depuis: number}|null} */
        this._etat = null;
    }

    /** Plugin appelle ceci pour enregistrer sa fonction de fetch OMDb (imdbId, opts) → données. */
    setProvider(fn) {
        if (typeof fn !== 'function') throw new TypeError('Provider doit être une fonction.');
        this._provider = fn;
        this._log.info('Provider de notes externes enregistré.');
    }

    /** Plugin appelle ceci pour enregistrer la recherche OMDb par titre ({ title, year, type }) → imdbId ou null. */
    setSearchProvider(fn) {
        if (typeof fn === 'function') this._searchProvider = fn;
    }

    /** Plugin appelle ceci pour enregistrer le fournisseur de textes critiques (TMDB). */
    setTextProvider(fn) {
        if (typeof fn === 'function') this._textProvider = fn;
    }

    /**
     * Retire le fournisseur de notes.
     *
     * ATTENTION — cette méthode ne retire QUE celui-là. Elle est conservée pour
     * les appelants existants, mais un greffon qui se désactive doit appeler
     * `clearProviders()` : voir le commentaire de cette dernière.
     */
    clearProvider() {
        this._provider = null;
        this._log.info('Provider de notes externes retiré.');
    }

    /**
     * Retire les TROIS fournisseurs.
     *
     * LA FUITE QUE CECI FERME. `clearProvider()` ne remettait à zéro que
     * `_provider`. `_searchProvider` et `_textProvider` n'avaient AUCUNE
     * méthode de retrait, et les crochets `onDisable` / `onUnload` du greffon
     * de notes n'appelaient que `clearProvider()`.
     *
     * Désactiver le greffon laissait donc deux de ses trois fermetures
     * installées et vivantes : la recherche par titre et les textes critiques
     * continuaient d'interroger Internet avec la clé de l'utilisateur, pour un
     * greffon qu'il croyait éteint. Rien ne le signalait — les requêtes
     * partaient, les résultats arrivaient, personne ne les regardait.
     */
    clearProviders() {
        this._provider = null;
        this._searchProvider = null;
        this._textProvider = null;
        // L'état décrivait un fournisseur qui n'existe plus : le garder ferait
        // afficher « quota épuisé » pour un greffon désactivé.
        this._etat = null;
        this._log.info('Fournisseurs de notes retirés (notes, recherche, textes).');
    }

    /** Vrai si la recherche par titre est disponible. */
    hasSearchProvider() {
        return this._searchProvider !== null;
    }

    // ─── D8 : dire POURQUOI il n'y a pas de note ────────────────────────────
    //
    // Quatre situations produisaient le même écran vide : la clé est absente,
    // la clé est invalide, le quota est épuisé, ou OMDb ne connaît pas ce
    // titre. L'utilisateur ne pouvait pas les distinguer, et interprétait le
    // silence comme une panne de l'application.
    //
    // Le service distinguait pourtant déjà la clé invalide du quota épuisé —
    // OMDb renvoie un HTTP 401 dans les deux cas et ne les sépare que dans le
    // corps JSON — mais seulement dans le bouton « Tester ». Cette information
    // remonte maintenant de la lecture NORMALE, où elle sert vraiment.

    /**
     * Signale l'état du fournisseur externe. Appelé par le greffon.
     * @param {'ok'|'sans-cle'|'cle-invalide'|'quota-epuise'|'injoignable'} etat
     */
    signalerEtat(etat) {
        const connus = ['ok', 'sans-cle', 'cle-invalide', 'quota-epuise', 'injoignable'];
        if (!connus.includes(etat)) return;
        // On ne réécrit pas la date quand l'état ne change pas : « depuis »
        // doit dire depuis quand cet état dure, pas quand on l'a revu.
        if (this._etat?.etat === etat) return;
        this._etat = { etat, depuis: Date.now() };
        this._log.info(`État des notes externes : ${etat}.`);
    }

    /**
     * @returns {{etat: string, depuis: number|null, message: string}}
     */
    etat() {
        const courant = this._etat?.etat || (this._provider ? 'inconnu' : 'sans-fournisseur');
        return {
            etat: courant,
            depuis: this._etat?.depuis ?? null,
            message: MESSAGES_ETAT[courant] || MESSAGES_ETAT.inconnu,
        };
    }

    hasProvider() {
        return this._provider !== null;
    }

    hasTextProvider() {
        return this._textProvider !== null;
    }

    /**
     * Retourne la liste des fournisseurs à afficher.
     * Priorité : settings utilisateur > défaut.
     * @returns {string[]}
     */
    getProviderFilter() {
        const configured = this._settings?.get('ratings.display.providers', null);
        if (Array.isArray(configured) && configured.length > 0) {
            return configured.filter(p => PROVIDER_IDS.includes(p));
        }
        return [...DEFAULT_PROVIDERS];
    }

    _getJellyfinClient() {
        return svc.api()?.getClient?.('jellyfin') || null;
    }    /**
     * Résout l'IMDb ID d'un item, avec repli épisode → série.
     * @returns {Promise<{imdbId: string|null, opts: {isSeriesFallback: boolean}}>} 
     */
    async _resolveImdbId(item) {
        const ownId = item?.ProviderIds?.Imdb || item?.providerIds?.Imdb
            || (typeof item?.Id === 'string' && /^tt\d+$/.test(item.Id) ? item.Id : null);
        const isEpisode = item?.Type === 'Episode';

        if (ownId) {
            return { imdbId: ownId, opts: { isSeriesFallback: false } };
        }

        // Épisode sans IMDb ID : notes de la série (choix produit validé)
        if (isEpisode && item?.SeriesId) {
            const seriesImdb = await this._getSeriesImdbId(item.SeriesId);
            if (seriesImdb) {
                return { imdbId: seriesImdb, opts: { isSeriesFallback: true } };
            }
            return { imdbId: null, opts: { isSeriesFallback: true } };
        }

        // Recherche OMDb par titre + année (dernier recours, année exacte exigée)
        const title = item?.Name || item?.SeriesName;
        const year = Number(item?.ProductionYear) || undefined;
        const type = item?.Type === 'Series' ? 'series' : 'movie';
        if (title && this._searchProvider) {
            try {
                const searched = await this._searchProvider({ title: String(title), year, type });
                if (searched) return { imdbId: searched, opts: { isSeriesFallback: false } };
            } catch {
                // Silencieux : aucun badge inventé.
            }
        }
        return { imdbId: null, opts: { isSeriesFallback: false } };
    }

    /** IMDb ID d'une série (cache par SeriesId). */
    async _getSeriesImdbId(seriesId) {
        if (this._seriesIdMemory.has(seriesId)) return this._seriesIdMemory.get(seriesId);
        let imdbId = null;
        try {
            const client = this._getJellyfinClient();
            const headers = svc.auth()?.getAuthHeaders?.() || {};
            const base = client?.baseUrl || svc.auth()?.getServerUrl?.() || '';
            if (base && seriesId) {
                const res = await fetchAvecDelai(`${base.replace(/\/$/, '')}/Users/${svc.auth()?.getUserId?.()}/Items/${seriesId}`, { headers });
                if (res.ok) {
                    const series = await res.json();
                    imdbId = series?.ProviderIds?.Imdb || null;
                }
            }
        } catch {
            imdbId = null;
        }
        this._seriesIdMemory.set(seriesId, imdbId);
        return imdbId;
    }

    /**
     * Récupère les notes pour un item Jellyfin.
     * @param {Object} item
     * @returns {Promise<{jellyfin?: number, imdb?: number, rt?: number, metacritic?: number, isSeriesFallback?: boolean}>}
     */
    async get(item) {
        const result = {};

        // Note Jellyfin (gratuit, pas d'appel externe)
        const cr = Number(item?.CommunityRating);
        if (Number.isFinite(cr) && cr >= 0 && cr <= 10) {
            result.jellyfin = Math.round(cr * 10) / 10;
        }

        const filter = this.getProviderFilter();
        const externalWanted = filter.filter(p => p !== 'jellyfin');
        if (externalWanted.length === 0 || !this._provider) return result;

        const { imdbId, opts } = await this._resolveImdbId(item || {});
        if (!imdbId) return result;
        if (opts.isSeriesFallback) result.isSeriesFallback = true;

        try {
            let external = await this._resolve(imdbId, opts);
            // Épisode : si l'ID propre ne donne rien sur OMDb, repli sur la note de la série.
            if (item?.Type === 'Episode' && !(external?.imdb != null || external?.rt != null || external?.metacritic != null)
                && item?.SeriesId && !opts.isSeriesFallback) {
                const seriesImdb = await this._getSeriesImdbId(item.SeriesId);
                if (seriesImdb && seriesImdb !== imdbId) {
                    const seriesExternal = await this._resolve(seriesImdb, { isSeriesFallback: true });
                    if (seriesExternal?.imdb != null || seriesExternal?.rt != null || seriesExternal?.metacritic != null) {
                        external = seriesExternal;
                        result.isSeriesFallback = true;
                    }
                }
            }
            if (external) {
                if (filter.includes('imdb') && external.imdb != null) {
                    result.imdb = external.imdb;
                    if (external.imdbVotes != null) result.imdbVotes = external.imdbVotes;
                }
                if (filter.includes('rt') && external.rt != null) result.rt = external.rt;
                if (filter.includes('metacritic') && external.metacritic != null) result.metacritic = external.metacritic;
            }
        } catch {
            // Silencieux : badge masqué, jamais de fallback inventé.
        }

        return result;
    }

    /**
     * Texte critique (TMDB) pour un item — extrait réel, sourcé, jamais inventé.
     * @param {Object} item
     * @returns {Promise<{text: string, author: string, source: 'TMDB', url?: string}|null>}
     */
    async getText(item) {
        if (!this._textProvider) return null;
        const { imdbId } = await this._resolveImdbId(item || {});
        if (!imdbId) return null;

        const mem = this._textMemory.get(imdbId);
        if (mem && mem.expiresAt > Date.now()) return mem.data;

        try {
            const text = await this._textProvider(imdbId);
            if (text && text.text) {
                const entry = { data: text, expiresAt: Date.now() + this._ttl };
                this._textMemory.set(imdbId, entry);
                return text;
            }
        } catch {
            // Silencieux : pas de texte → carte masquée, rien d'inventé.
        }
        return null;
    }

    /**
     * Test de connexion OMDb (pour le panneau admin).
     * @param {string} apiKey
     * @param {string} [testImdbId]
     * @returns {Promise<{ok: boolean, error?: string, title?: string, imdb?: number, rt?: number, metacritic?: number}>}
     */
    async testConnection(apiKey, testImdbId = 'tt0111161') {
        if (!apiKey || typeof apiKey !== 'string') return { ok: false, error: 'Clé API requise.' };
        try {
            const res = await fetchAvecDelai(
                `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(testImdbId)}`,
                { credentials: 'omit', signal: AbortSignal.timeout(8000) }
            );
            if (!res.ok) {
                // OMDb distingue une clé invalide d'un quota épuisé dans le corps JSON (tous deux HTTP 401).
                let omdbError = null;
                try { const errBody = await res.json(); omdbError = errBody?.Error || null; } catch { /* corps illisible */ }
                if (omdbError === 'Request limit reached!') {
                    return { ok: false, error: 'Quota journalier OMDb atteint (1 000 requêtes/jour gratuites) — la clé est correcte, réessayez après la réinitialisation quotidienne (0h UTC).' };
                }
                if (omdbError === 'Invalid API key!') {
                    return { ok: false, error: 'Clé API OMDb invalide (401) — vérifiez la clé sur omdbapi.com/apikey.aspx.' };
                }
                return { ok: false, error: omdbError ? `HTTP ${res.status} — ${omdbError}` : `HTTP ${res.status}` };
            }
            const data = await res.json();
            if (data.Response === 'False') return { ok: false, error: data.Error || 'Réponse invalide.' };
            return {
                ok: true,
                title: data.Title || 'Inconnu',
                imdb: parseFloat(data.imdbRating) || null,
                rt: this._parseRtFromRatings(data.Ratings),
                metacritic: (data.Metascore && data.Metascore !== 'N/A') ? (parseInt(data.Metascore, 10) || null) : null
            };
        } catch (err) {
            return { ok: false, error: err.message || 'Erreur réseau.' };
        }
    }

    /**
     * Test de connexion TMDB (recherche par IMDb ID → tmdbId).
     * @param {string} apiKey
     * @returns {Promise<{ok: boolean, error?: string, title?: string}>}
     */
    async testTmdbConnection(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') return { ok: false, error: 'Clé API requise.' };
        try {
            const res = await fetchAvecDelai(
                `https://api.themoviedb.org/3/find/tt0111161?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id&language=fr-FR`,
                { credentials: 'omit', signal: AbortSignal.timeout(8000) }
            );
            if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
            const data = await res.json();
            const movie = data.movie_results?.[0];
            const tv = data.tv_results?.[0];
            const found = movie || tv;
            if (!found) return { ok: false, error: 'Clé valide mais aucun média trouvé pour le test.' };
            return { ok: true, title: found.title || found.name || 'Trouvé' };
        } catch (err) {
            return { ok: false, error: err.message || 'Erreur réseau.' };
        }
    }

    _parseRtFromRatings(ratings) {
        if (!Array.isArray(ratings)) return null;
        const entry = ratings.find(r => r.Source === 'Rotten Tomatoes');
        if (!entry) return null;
        const val = parseInt(entry.Value, 10);
        return Number.isFinite(val) ? val : null;
    }

    /**
     * Résout les notes d'un identifiant IMDb.
     *
     * TROIS NIVEAUX, ET LE QUOTA COMMANDE TOUT
     * ----------------------------------------
     * Le quota OMDb gratuit est de **1 000 requêtes par jour**. Une page de
     * médiathèque qui affiche soixante affiches déclenche soixante résolutions.
     * Le cache était une `Map` mémoire : tout était perdu au rechargement de la
     * page, donc trois ouvertures de l'application épuisaient la journée — sans
     * message, les notes cessaient simplement d'apparaître.
     *
     *   1. mémoire      — instantané, perdu au rechargement ;
     *   2. IndexedDB    — survit au rechargement, même durée de vie de 24 h ;
     *   3. réseau       — le seul niveau qui consomme du quota.
     *
     * ET LE CACHE DES ABSENCES. Un titre qu'OMDb ne connaît pas était
     * réinterrogé à chaque visite, indéfiniment. Dans une médiathèque qui
     * contient de l'animation japonaise ou du cinéma non anglophone, ces échecs
     * sont souvent la MAJORITÉ du trafic. Une absence se met donc en cache
     * aussi, plus longtemps — un film absent d'OMDb le reste.
     */
    async _resolve(imdbId, opts = {}) {
        const mem = this._memory.get(imdbId);
        if (mem && mem.expiresAt > Date.now()) return mem.data;

        // LA DÉDUPLICATION DOIT ÊTRE POSÉE AVANT LE PREMIER `await`.
        //
        // Ce détail a été cassé en introduisant le niveau disque : la lecture
        // IndexedDB était placée ICI, entre le test d'existence et
        // l'inscription. Or un `await` rend la main au navigateur — deux appels
        // simultanés franchissaient donc tous deux le test avant que l'un ait
        // pu s'inscrire, et la page envoyait deux requêtes OMDb pour la même
        // affiche. Sur une grille, cela double la consommation d'un quota
        // limité à mille requêtes par jour.
        //
        // Le travail asynchrone est donc entièrement déporté dans
        // `_resoudreVraiment`, et cette fonction-ci n'attend rien avant d'avoir
        // inscrit sa promesse.
        if (this._inFlight.has(imdbId)) return this._inFlight.get(imdbId);

        const promesse = this._resoudreVraiment(imdbId, opts)
            .finally(() => { this._inFlight.delete(imdbId); });
        this._inFlight.set(imdbId, promesse);
        return promesse;
    }

    /** Le travail réel : disque, puis réseau. Toujours appelé dédupliqué. */
    async _resoudreVraiment(imdbId, opts) {
        // Niveau 2 : le disque. Une lecture IndexedDB coûte une milliseconde,
        // une requête OMDb coûte un millième du quota quotidien.
        const surDisque = await this._lireDisque(imdbId);
        if (surDisque !== undefined) {
            this._memory.set(imdbId, { data: surDisque, expiresAt: Date.now() + this._ttl });
            return surDisque;
        }

        const data = await this._enqueue(imdbId, opts);
        // `data` vaut `null` quand OMDb ne connaît pas le titre. On mémorise
        // AUSSI ce cas : c'est là qu'est le gros du gaspillage.
        this._memory.set(imdbId, {
            data: data || null,
            expiresAt: Date.now() + (data ? this._ttl : this._ttlAbsence),
        });
        this._ecrireDisque(imdbId, data || null);
        return data;
    }

    // ─── Niveau 2 : le disque ───────────────────────────────────────────────

    /**
     * @returns {Promise<object|null|undefined>} la valeur en cache — `null` est
     *   une absence MÉMORISÉE, `undefined` signifie « rien en cache ». La
     *   distinction est tout l'intérêt du cache des absences : les confondre
     *   ferait réinterroger OMDb pour chaque titre qu'il ne connaît pas.
     */
    async _lireDisque(imdbId) {
        const cache = this._cache?.();
        if (!cache?.get) return undefined;
        try {
            const entree = await cache.get('general', `${PREFIXE_CACHE}${imdbId}`);
            if (!entree || typeof entree !== 'object') return undefined;
            if (!Number.isFinite(entree.expiresAt) || entree.expiresAt <= Date.now()) return undefined;
            return entree.data ?? null;
        } catch {
            // Navigation privée, IndexedDB refusé : ce n'est pas une panne, on
            // retombe simplement sur le réseau.
            return undefined;
        }
    }

    _ecrireDisque(imdbId, data) {
        const cache = this._cache?.();
        if (!cache?.set) return;
        const dureeMs = data ? this._ttl : this._ttlAbsence;
        try {
            cache.set('general', `${PREFIXE_CACHE}${imdbId}`,
                { data, expiresAt: Date.now() + dureeMs },
                Math.round(dureeMs / 1000))?.catch?.(() => {});
        } catch { /* écriture impossible : sans effet sur la lecture */ }
    }

    _enqueue(imdbId, opts) {
        return new Promise(resolve => {
            this._queue.push({ imdbId, opts, resolve });
            this._drain();
        });
    }

    _drain() {
        while (this._active < this._maxParallel && this._queue.length > 0) {
            const job = this._queue.shift();
            this._active++;
            this._fetch(job.imdbId, job.opts)
                .then(job.resolve)
                .catch(() => job.resolve(null))
                .finally(() => {
                    this._active--;
                    this._drain();
                });
        }
    }

    async _fetch(imdbId, opts) {
        if (!this._provider) return null;
        return await this._provider(imdbId, opts);
    }

    invalidate(imdbId) {
        this._memory.delete(imdbId);
        // Sans cette ligne, « invalider » ne vidait que le premier niveau : la
        // lecture suivante retrouvait la même valeur sur le disque.
        try { this._cache?.()?.delete?.('general', `${PREFIXE_CACHE}${imdbId}`)?.catch?.(() => {}); } catch { /* sans effet */ }
    }

    clear() { this._memory.clear(); this._textMemory.clear(); }
}

export default RatingCacheService;
