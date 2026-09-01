/**
 * SpaceHub — ApiClient
 * Version: 1.0.0
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
     */
    constructor(baseUrl, apiKey = null, extraHeaders = {}) {
        this.baseUrl = String(baseUrl || '').replace(/\/$/, ''); // retire le slash final
        this.apiKey  = apiKey;
        this._defaultHeaders = { 'Content-Type': 'application/json', ...extraHeaders };
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
        const retries = options.retries ?? 2;
        if (!this.baseUrl || !endpoint || typeof endpoint !== 'string' || !/^\//.test(endpoint)) {
            throw new TypeError('ApiClient : baseUrl et endpoint relatif valides requis.');
        }

        const isJellyfin = this instanceof JellyfinClient || !!this._defaultHeaders['X-Emby-Authorization'];
        const headers = {
            ...this._defaultHeaders,
            ...((this.apiKey && !isJellyfin) ? { 'X-Api-Key': this.apiKey } : {}),
            ...options.headers,
        };

        const timeoutMs = options.timeoutMs ?? 12000;

        if (['GET', 'HEAD'].includes(method.toUpperCase()) && !body) {
            delete headers['Content-Type'];
        }

        const requestBody = body && !['GET', 'HEAD'].includes(method.toUpperCase())
            ? JSON.stringify(body)
            : undefined;

        const url = `${this.baseUrl}${endpoint}`;
        const browserOrigin = typeof window !== 'undefined' ? window.location?.origin : '';
        let isCrossDomain = false;
        if (browserOrigin && /^https?:/i.test(this.baseUrl)) {
            try {
                isCrossDomain = new URL(this.baseUrl).origin !== browserOrigin;
            } catch {
                isCrossDomain = true;
            }
        }

        let useProxy = false;
        for (let attempt = 0; attempt <= retries; attempt++) {
            let timeoutController = null;
            let timeoutId = null;
            let removeCallerAbort = null;
            try {
                let requestUrl = url;
                // Le serveur Jellyfin autorise CORS dans la configuration de recette :
                // tenter l'URL officielle directement à chaque première tentative. Le proxy
                // reste le repli pour les erreurs réseau/CORS et n'est pas utilisé pour les retries
                // d'une réponse HTTP lente, afin de ne pas cumuler deux timeouts côté proxy.
                if (useProxy && typeof window !== 'undefined' && isCrossDomain) {
                    requestUrl = `/api-proxy?url=${encodeURIComponent(url)}`;
                }

                timeoutController = new AbortController();
                const abortRequest = () => timeoutController.abort();
                if (options.signal) {
                    if (options.signal.aborted) {
                        timeoutController.abort();
                    } else {
                        options.signal.addEventListener('abort', abortRequest, { once: true });
                        removeCallerAbort = () => options.signal.removeEventListener('abort', abortRequest);
                    }
                }
                timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

                const config = {
                    method: method.toUpperCase(),
                    headers,
                    signal: timeoutController.signal,
                };
                if (requestBody !== undefined) config.body = requestBody;

                const response = await fetch(requestUrl, config);

                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    throw new ApiError(response.status, response.statusText, text, requestUrl);
                }

                // Réponse vide (204 No Content)
                if (response.status === 204) return null;

                const contentType = response.headers.get('Content-Type') || '';
                return contentType.includes('application/json')
                    ? response.json()
                    : response.text();

            } catch (err) {
                const isLast = attempt === retries;

                // Ne pas retenter sur les erreurs clientes 4xx définitives (400, 401, 403, 404, 422) sauf 429
                if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
                    this._log.error(`[${method}] ${url} — Erreur client ${err.status} définitive : ${err.message}`);
                    throw err;
                }

                // Si échec réseau direct/CORS, tenter le proxy universel immédiatement sur la tentative suivante
                if (err.name === 'TypeError' && !isLast) {
                    useProxy = true;
                    this._log.warn(`[${method}] ${url} échec direct/CORS. Bascule sur proxy universel /api-proxy...`);
                    await sleep(100);
                    continue;
                }

                if (err instanceof ApiError && err.status >= 500 && !isLast) {
                    // Un 5xx provenant du serveur direct ou du proxy est retenté
                    // directement : ne pas transformer un endpoint Jellyfin lent en boucle
                    // de timeouts proxy.
                    useProxy = false;
                    this._log.warn(`[${method}] ${url} — serveur/proxy ${err.status}, nouvelle tentative directe...`);
                    await sleep(500 * (attempt + 1));
                    continue;
                }

                if (err instanceof ApiError || isLast) {
                    this._log.error(`[${method}] ${url} — ${err.message}`);
                    throw err;
                }
                this._log.warn(`[${method}] ${url} — tentative ${attempt + 1}/${retries} échouée, retry avec backoff...`);
                await sleep(500 * (attempt + 1));
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                removeCallerAbort?.();
            }
        }
    }

    get(endpoint, options)          { return this.request('GET',    endpoint, null,  options); }
    post(endpoint, body, options)   { return this.request('POST',   endpoint, body,  options); }
    put(endpoint, body, options)    { return this.request('PUT',    endpoint, body,  options); }
    patch(endpoint, body, options)  { return this.request('PATCH',  endpoint, body,  options); }
    delete(endpoint, options)       { return this.request('DELETE', endpoint, null,  options); }

    /** Met à jour la baseUrl (utile quand l'URL Sonarr/Radarr change dans les settings) */
    setBaseUrl(url) { this.baseUrl = (url || '').replace(/\/$/, ''); }
    setApiKey(key)  { this.apiKey = key; }

    /** Met à jour dynamiquement la configuration depuis SettingsManager */
    updateConfig(settingsKey = null) {
        const key = settingsKey || this._settingsKey;
        const settings = window.SpaceHub?.core?.settings;
        if (key && settings) {
            const newUrl = settings.get(`${key}.url`, this.baseUrl);
            const newKey = settings.get(`${key}.apiKey`, this.apiKey);
            if (newUrl !== undefined && newUrl !== null) this.setBaseUrl(newUrl);
            if (newKey !== undefined && newKey !== null) this.setApiKey(newKey);
        }
    }
}

// ─── JellyfinClient ──────────────────────────────────────────────────────────

class JellyfinClient extends BaseApiClient {
    constructor() {
        const serverAddress = window.SpaceHub?.auth?.getServerUrl() || window.ApiClient?.serverAddress?.() || '';
        const token         = window.SpaceHub?.auth?.getToken() || window.ApiClient?.accessToken?.()   || '';

        super(serverAddress, token);
        this.updateAuthHeaders(token);
        this._jfClient = window.ApiClient;
    }

    updateAuthHeaders(token) {
        this.apiKey = token;
        const deviceId = window.SpaceHub?.auth?.getDeviceId?.() || 'sh_web';
        const authHeader = `MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="${deviceId}", Version="10.8.13"${token ? `, Token="${token}"` : ''}`;
        this._defaultHeaders['Accept'] = 'application/json';
        this._defaultHeaders['Content-Type'] = 'application/json';
        this._defaultHeaders['X-Emby-Authorization'] = authHeader;
        this._defaultHeaders['Authorization'] = authHeader;
    }

    setApiKey(token) {
        this.updateAuthHeaders(token);
    }

    /** Rafraîchit le token Jellyfin (à appeler après reconnexion) */
    refreshAuth() {
        const token = window.SpaceHub?.auth?.getToken() || this._jfClient?.accessToken?.() || '';
        this.updateAuthHeaders(token);
    }

    /**
     * Retourne l'URL d'une image Jellyfin.
     * @param {string} itemId
     * @param {'Primary'|'Backdrop'|'Thumb'|'Banner'|'Logo'} [type]
     * @param {{ maxWidth?: number, maxHeight?: number, quality?: number }} [opts]
     */
    getImageUrl(itemId, type = 'Primary', opts = {}) {
        if (!itemId) return '';
        const params = new URLSearchParams({
            maxWidth:  opts.maxWidth  ?? 400,
            maxHeight: opts.maxHeight ?? 600,
            quality:   opts.quality   ?? 90,
        });
        // Les images Jellyfin de ce serveur sont publiques lorsqu'elles sont référencées
        // par leur tag ; ne jamais placer le token dans une URL générée par l'UI.
        // Pour une instance qui protège ses images, l'application doit utiliser un proxy
        // authentifié ou un chargeur Blob dédié, jamais réintroduire api_key ici.
        const base = this.baseUrl || window.SpaceHub?.auth?.getServerUrl() || '';
        return `${base}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?${params}`;
    }

    /** /Items/Latest */
    getLatestItems(limit = 20, fields = 'PrimaryImageAspectRatio,BasicSyncInfo') {
        return this.get(`/Items/Latest?Limit=${limit}&Fields=${fields}`);
    }

    /** /Items?SortBy=DateCreated&SortOrder=Descending */
    getRecentlyAdded(limit = 20) {
        return this.get(`/Items?SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=PrimaryImageAspectRatio`);
    }

    /** /Items ou /Users/{userId}/Items */
    getItems(userIdOrOptions = {}, maybeOptions = {}) {
        let userId = null;
        let opts = {};
        if (typeof userIdOrOptions === 'string') {
            userId = userIdOrOptions;
            opts = maybeOptions || {};
        } else {
            opts = userIdOrOptions || {};
            userId = opts.userId || window.SpaceHub?.auth?.getUserId() || '';
        }
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(opts)) {
            if (v !== undefined && v !== null && k !== 'userId') {
                params.set(k, String(v));
            }
        }
        const q = params.toString() ? `?${params.toString()}` : '';
        const endpoint = userId ? `/Users/${userId}/Items${q}` : `/Items${q}`;
        return this.get(endpoint);
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
