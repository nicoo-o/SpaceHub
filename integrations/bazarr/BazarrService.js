/**
 * SpaceHub — Bazarr Service
 * Version: 0.9.0
 *
 * Couche de service métier pour l'intégration Bazarr.
 * Gère le suivi des sous-titres manquants, les fournisseurs, la mise en cache
 * et la synchronisation avec l'EventBus.
 */

'use strict';

import Logger from '../../core/Logger.js';
import BazarrApi from './BazarrApi.js';

import * as svc from '../../core/services.js';
class BazarrService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('BazarrService');
        this._cache = cache || svc.cache() || null;
        this._eventBus = eventBus || svc.eventBus() || null;
        this._settings = settings || svc.settings() || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'bazarr.url') this.api?.setBaseUrl?.(value);
                if (key === 'bazarr.apiKey') this.api?.setApiKey?.(value);
            });
        }
    }

    _createDefaultApi() {
        return new BazarrApi();
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('bazarr.url') || this.api?.baseUrl;
        const key = this._settings?.get('bazarr.apiKey') || this.api?.apiKey;

        const explicitlyConfigured = this._settings?.has?.('bazarr.url') || this._settings?.has?.('bazarr.apiKey');
        if (!url || (this._settings && !explicitlyConfigured)) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'bazarr', status: this.status });
            return this.status;
        }

        this.status = 'connecting';
        const start = Date.now();
        try {
            const result = await this.api.testConnection();
            if (!result.success) {
                const authFail = result.error?.includes('401') || result.error?.includes('403') || result.error?.includes('Unauthorized');
                this.status = authFail ? 'auth_failed' : 'offline';
            } else {
                this.status = 'connected';
            }
        } catch (err) {
            this.status = (err.status === 401 || err.status === 403) ? 'auth_failed' : 'offline';
        }
        this.lastLatency = Date.now() - start;

        this._eventBus?.emit('service:statusChanged', { id: 'bazarr', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère un résumé complet des sous-titres recherchés (films + épisodes).
     * @returns {Promise<{ movies: Array<Object>, episodes: Array<Object>, totalWanted: number }>}
     */
    async getWantedSummary() {
        const cacheKey = 'bazarr_wanted_summary';
        if (this._cache) {
            const cached = await this._cache.get('bazarr', cacheKey);
            if (cached) return cached;
        }

        // AUDIT — « zéro manquant » et « je n'ai pas pu demander » ne sont
        // PAS la même chose, et cette fonction les confondait.
        //
        // Les deux appels étaient suivis de `.catch(() => ({ data: [] }))`.
        // Serveur Bazarr éteint, clé API fausse, 401 : l'erreur disparaissait,
        // `totalWanted` valait 0, et TROIS écrans en tiraient une affirmation
        // positive — « Tous les sous-titres français sont synchronisés ! »,
        // « Tous vos films et séries ont leurs sous-titres au complet ! »,
        // « 🟢 Tous les sous-titres français sont à jour ! ». L'utilisateur
        // recevait une garantie produite par l'absence totale de mesure.
        //
        // On distingue désormais les deux, et on le dit à l'appelant.
        const [moviesRes, episodesRes] = await Promise.all([
            this.api.getWantedMovies(0, 200).catch(err => ({ __echec: err })),
            this.api.getWantedEpisodes(0, 200).catch(err => ({ __echec: err }))
        ]);

        const echecs = [];
        if (moviesRes?.__echec) echecs.push(`films (${moviesRes.__echec.message || 'erreur'})`);
        if (episodesRes?.__echec) echecs.push(`épisodes (${episodesRes.__echec.message || 'erreur'})`);

        const movies = moviesRes?.__echec ? [] : (moviesRes?.data || []);
        const episodes = episodesRes?.__echec ? [] : (episodesRes?.data || []);

        // `total` est le compte réel côté Bazarr ; `length` est plafonné par la
        // pagination demandée. Retomber sur `length` faisait passer « 500
        // manquants » pour « 30 manquants ». On préfère ne pas savoir.
        const compte = (res, liste) => {
            if (res?.__echec) return null;
            const t = Number(res?.total);
            return Number.isFinite(t) ? t : liste.length;
        };
        const nFilms = compte(moviesRes, movies);
        const nEpisodes = compte(episodesRes, episodes);
        const mesure = nFilms !== null && nEpisodes !== null;

        const summary = {
            movies,
            episodes,
            /** `null` si la mesure a échoué — surtout pas 0. */
            totalWanted: mesure ? nFilms + nEpisodes : null,
            /** Vrai seulement si les DEUX appels ont abouti. */
            mesure,
            erreur: echecs.length ? `Bazarr injoignable pour : ${echecs.join(', ')}.` : null,
        };

        if (this._cache && mesure) {
            // Un échec ne se met pas en cache : il faut réessayer au prochain
            // affichage, pas figer trois minutes d'ignorance.
            await this._cache.set('bazarr', cacheKey, summary, 180); // 3 min TTL
        }

        return summary;
    }

    /**
     * Récupère l'état de santé des fournisseurs de sous-titres.
     * @returns {Promise<Array<Object>>}
     */
    async getProvidersStatus() {
        const providers = await this.api.getProviders();
        return providers.map(p => ({
            name: p.name || p.id,
            enabled: p.enabled !== false,
            // `?? true` affirmait l'authentification quand Bazarr ne disait
            // rien. Sur une question de sécurité, l'absence de réponse n'est
            // pas un oui : `null` se lit « inconnu » et s'affiche comme tel.
            authenticated: typeof p.authenticated === 'boolean' ? p.authenticated : null
        }));
    }

    /**
     * Lance la recherche de sous-titres pour un film.
     * @param {number|string} radarrId
     * @returns {Promise<Object>}
     */
    async searchMovieSubtitles(radarrId) {
        this._log.info(`Recherche de sous-titres pour le film radarrId: ${radarrId}...`);
        const result = await this.api.searchMovieSubtitles(radarrId);

        if (this._cache) await this._cache.delete('bazarr', 'bazarr_wanted_summary');
        if (this._eventBus) this._eventBus.emit('bazarr:subtitlesDownloaded', { type: 'movie', id: radarrId });

        svc.toaster()?.success('Recherche de sous-titres lancée dans Bazarr !');
        return result;
    }

    /**
     * Lance la recherche de sous-titres pour un épisode.
     * @param {number|string} sonarrEpisodeId
     * @returns {Promise<Object>}
     */
    async searchEpisodeSubtitles(sonarrEpisodeId) {
        this._log.info(`Recherche de sous-titres pour l'épisode sonarrEpisodeId: ${sonarrEpisodeId}...`);
        const result = await this.api.searchEpisodeSubtitles(sonarrEpisodeId);

        if (this._cache) await this._cache.delete('bazarr', 'bazarr_wanted_summary');
        if (this._eventBus) this._eventBus.emit('bazarr:subtitlesDownloaded', { type: 'episode', id: sonarrEpisodeId });

        svc.toaster()?.success('Recherche de sous-titres d\'épisode lancée !');
        return result;
    }

    /**
     * Synchronise les bibliothèques Bazarr (alias officiel de triggerSync).
     * @returns {Promise<Object>}
     */
    async sync() {
        return await this.triggerSync();
    }

    /**
     * Déclenche une synchronisation des bibliothèques.
     * @returns {Promise<Object>}
     */
    async triggerSync() {
        this._log.info('Déclenchement de la synchronisation Bazarr...');
        try {
            const resultat = await this.api.syncLibraries();
            if (resultat?.success) {
                svc.toaster()?.success?.('Synchronisation Bazarr lancée.');
                return resultat;
            }
            // Chaque échec a maintenant un nom, et l'utilisateur voit lequel.
            const messages = {
                unreachable: 'Bazarr est injoignable — vérifiez l\'URL et la clé API.',
                unsupported: 'Cette version de Bazarr n\'expose pas de tâche de synchronisation.',
                failed: 'Bazarr a refusé de lancer la tâche de synchronisation.',
            };
            svc.toaster()?.warning?.(messages[resultat?.status] || 'Synchronisation Bazarr impossible.');
            this._log.warn('Synchronisation Bazarr refusée :', resultat);
            return resultat || { success: false, status: 'unknown' };
        } catch (err) {
            this._log.warn('Synchronisation Bazarr échouée:', err.message);
            svc.toaster()?.error?.('Échec de la synchronisation Bazarr.');
            return { success: false, error: err.message };
        }
    }
}

export default BazarrService;
