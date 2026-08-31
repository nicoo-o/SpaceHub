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

const PROVIDER_IDS = ['jellyfin', 'rt', 'imdb', 'metacritic', 'tmdb'];
const DEFAULT_PROVIDERS = ['jellyfin', 'rt', 'imdb', 'tmdb'];

class RatingCacheService {
    constructor({ settings = null } = {}) {
        this._settings = settings || (typeof window !== 'undefined' ? window.SpaceHub?.core?.settings : null);
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

    clearProvider() {
        this._provider = null;
        this._log.info('Provider de notes externes retiré.');
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
        return window.SpaceHub?.core?.api?.getClient?.('jellyfin') || null;
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
            const headers = window.SpaceHub?.auth?.getAuthHeaders?.() || {};
            const base = client?.baseUrl || window.SpaceHub?.auth?.getServerUrl?.() || '';
            if (base && seriesId) {
                const res = await fetch(`${base.replace(/\/$/, '')}/Users/${window.SpaceHub?.auth?.getUserId?.()}/Items/${seriesId}`, { headers });
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
            const res = await fetch(
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
            const res = await fetch(
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

    async _resolve(imdbId, opts = {}) {
        const mem = this._memory.get(imdbId);
        if (mem && mem.expiresAt > Date.now()) return mem.data;

        if (this._inFlight.has(imdbId)) return this._inFlight.get(imdbId);

        const promise = this._enqueue(imdbId, opts).finally(() => {
            this._inFlight.delete(imdbId);
        });
        this._inFlight.set(imdbId, promise);

        const data = await promise;
        if (data) {
            this._memory.set(imdbId, { data, expiresAt: Date.now() + this._ttl });
        }
        return data;
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

    invalidate(imdbId) { this._memory.delete(imdbId); }
    clear() { this._memory.clear(); this._textMemory.clear(); }
}

export default RatingCacheService;
