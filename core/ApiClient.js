/**
 * SpaceHub — ApiClient
 * Version: 0.2.0
 *
 * Client HTTP générique avec support de la gestion d'erreurs,
 * du retry automatique, et d'une factory pour créer des clients
 * spécialisés (Jellyfin, Sonarr, Radarr, etc.).
 *
 * Usage:
 *   // Ajouter un client nommé
 *   SpaceHub.core.api.addClient('jellyfin', new JellyfinClient());
 *   SpaceHub.core.api.addClient('sonarr', new BaseApiClient('http://sonarr:8989', 'API_KEY'));
 *
 *   // Faire des requêtes
 *   const items = await SpaceHub.core.api.get('jellyfin', '/Items/Latest');
 *   const series = await SpaceHub.core.api.get('sonarr', '/api/v3/series');
 */

'use strict';

import Logger from './Logger.js';

// ─── BaseApiClient ───────────────────────────────────────────────────────────

class BaseApiClient {
    /**
     * @param {string} baseUrl  - URL de base (ex: 'http://sonarr:8989')
     * @param {string|null} apiKey - Clé API (envoyée via X-Api-Key)
     * @param {Record<string,string>} [extraHeaders]
     * @param {{ devProxy?: boolean }} [options] - devProxy: route les requêtes
     *   via le proxy de dev Vite (/__sh-proxy) en environnement npm run dev,
     *   pour contourner les services *arr qui n'envoient pas d'en-têtes CORS.
     *   Sans effet en production (npm run build) — voir vite.config.js.
     */
    constructor(baseUrl, apiKey = null, extraHeaders = {}, options = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // retire le slash final
        this.apiKey  = apiKey;
        this._defaultHeaders = { 'Content-Type': 'application/json', ...extraHeaders };
        this._devProxy = !!options.devProxy;
        this._log = new Logger('ApiClient');
    }

    /**
     * Effectue une requête HTTP avec retry automatique.
     * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
     * @param {string} endpoint - Chemin relatif (ex: '/api/v3/series')
     * @param {*} [body]
     * @param {{ headers?: Record<string,string>, retries?: number, signal?: AbortSignal }} [options]
     * @returns {Promise<*>}
     */
    async request(method, endpoint, body = null, options = {}) {
        const realUrl = `${this.baseUrl}${endpoint}`;
        // En dev, si devProxy est activé, on passe par le proxy Vite local
        // (même origine → pas de CORS) qui relaie ensuite vers realUrl côté serveur.
        const useProxy = this._devProxy && typeof import.meta !== 'undefined' && import.meta.env?.DEV;
        const url = useProxy
            ? `/__sh-proxy?target=${encodeURIComponent(realUrl)}`
            : realUrl;
        const retries = options.retries ?? 2;

        const headers = {
            ...this._defaultHeaders,
            ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
            ...options.headers,
        };

        const config = {
            method: method.toUpperCase(),
            headers,
            signal: options.signal,
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            config.body = JSON.stringify(body);
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, config);

                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    throw new ApiError(response.status, response.statusText, text, url);
                }

                // Réponse vide (204 No Content)
                if (response.status === 204) return null;

                const contentType = response.headers.get('Content-Type') || '';
                return contentType.includes('application/json')
                    ? response.json()
                    : response.text();

            } catch (err) {
                const isLast = attempt === retries;
                if (err instanceof ApiError || isLast) {
                    this._log.error(`[${method}] ${realUrl} — ${err.message}`);
                    throw err;
                }
                this._log.warn(`[${method}] ${realUrl} — tentative ${attempt + 1}/${retries} échouée, retry...`);
                await sleep(500 * (attempt + 1));
            }
        }
    }

    get(endpoint, options)          { return this.request('GET',    endpoint, null,  options); }
    post(endpoint, body, options)   { return this.request('POST',   endpoint, body,  options); }
    put(endpoint, body, options)    { return this.request('PUT',    endpoint, body,  options); }
    patch(endpoint, body, options)  { return this.request('PATCH',  endpoint, body,  options); }
    delete(endpoint, options)       { return this.request('DELETE', endpoint, null,  options); }

    /** Met à jour la baseUrl (utile quand l'URL Sonarr/Radarr change dans les settings) */
    setBaseUrl(url) { this.baseUrl = url.replace(/\/$/, ''); }
    setApiKey(key)  { this.apiKey = key; }
}

// ─── JellyfinClient ──────────────────────────────────────────────────────────

class JellyfinClient extends BaseApiClient {
    constructor() {
        const serverAddress = window.ApiClient?.serverAddress?.() || '';
        const token         = window.ApiClient?.accessToken?.()   || '';

        super(serverAddress, null, {
            'X-Emby-Authorization': `MediaBrowser Token="${token}"`,
        });

        this._jfClient = window.ApiClient;
    }

    /**
     * Surcharge : contrairement à BaseApiClient, le token Jellyfin ne se
     * transmet pas via "X-Api-Key" mais via l'en-tête "X-Emby-Authorization".
     * Sans cette surcharge, un appel à setApiKey() après connexion (voir
     * AuthManager._syncGlobalClient) ne rafraîchissait jamais l'en-tête
     * réellement utilisé par request(), et toutes les requêtes Jellyfin
     * échouaient silencieusement (401) après un login standalone.
     */
    setApiKey(token) {
        super.setApiKey(token);
        this._defaultHeaders['X-Emby-Authorization'] = `MediaBrowser Token="${token || ''}"`;
    }

    /** Met à jour l'URL du serveur (après connexion à un nouveau serveur). */
    setBaseUrl(url) {
        super.setBaseUrl(url);
    }

    /** Rafraîchit le token Jellyfin (à appeler après reconnexion). */
    refreshAuth() {
        const token = this._jfClient?.accessToken?.() || '';
        this.setApiKey(token);
    }

    /**
     * Retourne l'URL d'une image Jellyfin.
     * @param {string} itemId
     * @param {'Primary'|'Backdrop'|'Thumb'|'Banner'|'Logo'} [type]
     * @param {{ maxWidth?: number, maxHeight?: number, quality?: number }} [opts]
     */
    getImageUrl(itemId, type = 'Primary', opts = {}) {
        const params = new URLSearchParams({
            maxWidth:  opts.maxWidth  ?? 400,
            maxHeight: opts.maxHeight ?? 600,
            quality:   opts.quality   ?? 90,
        });
        return `${this.baseUrl}/Items/${itemId}/Images/${type}?${params}`;
    }

    /** /Items/Latest */
    getLatestItems(limit = 20, fields = 'PrimaryImageAspectRatio,BasicSyncInfo') {
        return this.get(`/Items/Latest?Limit=${limit}&Fields=${fields}`);
    }

    /** /Items?SortBy=DateCreated&SortOrder=Descending */
    getRecentlyAdded(limit = 20) {
        return this.get(`/Items?SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=PrimaryImageAspectRatio`);
    }

    /** /Users/{userId}/Items/Resume */
    getContinueWatching(userId, limit = 10) {
        return this.get(`/Users/${userId}/Items/Resume?Limit=${limit}&MediaTypes=Video`);
    }
}

// ─── ApiClient (factory / registry) ─────────────────────────────────────────

class ApiClient {
    constructor() {
        /** @type {Map<string, BaseApiClient>} */
        this._clients = new Map();
        this._log = new Logger('ApiClient');
    }

    /**
     * Enregistre un client nommé.
     * @param {string} name
     * @param {BaseApiClient} client
     */
    addClient(name, client) {
        this._clients.set(name, client);
        this._log.info(`Client "${name}" enregistré (${client.baseUrl || 'URL non définie'})`);
    }

    /**
     * Retourne un client enregistré.
     * @param {string} name
     * @returns {BaseApiClient}
     */
    getClient(name) {
        const client = this._clients.get(name);
        if (!client) throw new Error(`ApiClient : client "${name}" non trouvé.`);
        return client;
    }

    /** Raccourci : GET via un client nommé */
    get(clientName, endpoint, options)         { return this.getClient(clientName).get(endpoint, options); }
    /** Raccourci : POST via un client nommé */
    post(clientName, endpoint, body, options)  { return this.getClient(clientName).post(endpoint, body, options); }
    /** Raccourci : PUT via un client nommé */
    put(clientName, endpoint, body, options)   { return this.getClient(clientName).put(endpoint, body, options); }
    /** Raccourci : DELETE via un client nommé */
    delete(clientName, endpoint, options)      { return this.getClient(clientName).delete(endpoint, options); }

    /** Vérifie qu'un client est enregistré */
    has(name) { return this._clients.has(name); }
    /** Liste des clients enregistrés */
    list()    { return [...this._clients.keys()]; }
}

// ─── ApiError ────────────────────────────────────────────────────────────────

class ApiError extends Error {
    constructor(status, statusText, body, url) {
        super(`HTTP ${status} ${statusText} — ${url}`);
        this.name       = 'ApiError';
        this.status     = status;
        this.statusText = statusText;
        this.body       = body;
        this.url        = url;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Exports ─────────────────────────────────────────────────────────────────

export { ApiClient, BaseApiClient, JellyfinClient, ApiError };
export default ApiClient;
