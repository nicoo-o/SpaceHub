/**
 * SpaceHub — Jellyfin Authentication Manager
 * Version: 1.0.0
 *
 * Gère la connexion autonome à n'importe quel serveur Jellyfin.
 * Authentifie les utilisateurs via l'API REST (/Users/AuthenticateByName),
 * stocke le token d'accès et gère les sessions actives.
 */

'use strict';

import Logger from '../../core/Logger.js';

const STORAGE_KEY = 'SpaceHub_jellyfin_auth';

class AuthManager {
    constructor() {
        this._log = new Logger('AuthManager');
        this._authData = this._loadAuth();
    }

    _loadAuth() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    _saveAuth(data) {
        this._authData = data;
        if (data) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    /**
     * Vérifie si l'utilisateur est authentifié.
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!(this._authData?.AccessToken && this._authData?.ServerUrl && this._authData?.User?.Id);
    }

    getServerUrl() {
        return this._authData?.ServerUrl || '';
    }

    getToken() {
        return this._authData?.AccessToken || '';
    }

    getUserId() {
        return this._authData?.User?.Id || '';
    }

    getUser() {
        return this._authData?.User || null;
    }

    getDeviceId() {
        let id = localStorage.getItem('sh_device_id');
        if (!id) {
            id = 'sh_web_' + Math.random().toString(36).substring(2, 11);
            localStorage.setItem('sh_device_id', id);
        }
        return id;
    }

    /**
     * Génère les en-têtes d'autorisation Jellyfin officiels.
     * @returns {Record<string, string>}
     */
    getAuthHeaders() {
        const token = this.getToken();
        const deviceId = this.getDeviceId();
        const authHeader = `MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="${deviceId}", Version="10.8.13"${token ? `, Token="${token}"` : ''}`;

        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Emby-Authorization': authHeader,
            'Authorization': authHeader
        };
    }

    /**
     * Authentifie un utilisateur sur un serveur Jellyfin.
     * @param {string} serverUrl - URL du serveur (ex: http://localhost:8096)
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
     */
    async login(serverUrl, username, password) {
        const cleanUrl = (serverUrl || '').trim().replace(/\/$/, '');
        const cleanUser = (username || '').trim();
        const cleanPass = password || '';
        const deviceId = this.getDeviceId();

        this._log.info(`Tentative de connexion à ${cleanUrl || '(local proxy)'} pour "${cleanUser}"...`);

        const authHeader = `MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="${deviceId}", Version="10.8.13"`;

        const doAuth = async (targetBase) => {
            const url = `${targetBase}/Users/AuthenticateByName`;
            return await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': authHeader,
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    Username: cleanUser,
                    Pw: cleanPass
                })
            });
        };

        try {
            let res = null;
            // 1. Essayer avec l'URL renseignée
            try {
                res = await doAuth(cleanUrl);
            } catch (networkErr) {
                this._log.warn('Tentative directe échouée, essai via proxy relatif...', networkErr);
                // 2. Si échec réseau direct, tenter via le proxy Vite relatif
                res = await doAuth('');
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                this._log.warn(`Échec de connexion (${res.status}):`, errText);
                if (res.status === 401) {
                    return { success: false, error: 'Identifiants invalides (nom d\'utilisateur ou mot de passe incorrect).' };
                }
                return { success: false, error: `Erreur serveur Jellyfin (${res.status}) : ${errText || 'Connexion refusée'}` };
            }

            const data = await res.json();
            const resolvedUrl = cleanUrl || (window.location.origin);
            const authPayload = {
                ServerUrl: resolvedUrl,
                AccessToken: data.AccessToken,
                User: data.User,
                SessionInfo: data.SessionInfo
            };

            this._saveAuth(authPayload);

            // Mettre à jour l'ApiClient global de SpaceHub
            this._syncGlobalClient(resolvedUrl, data.AccessToken);

            this._log.info(`✅ Connecté avec succès en tant que ${data.User.Name} !`);
            return { success: true, user: data.User };
        } catch (err) {
            this._log.error('Erreur réseau de connexion finale:', err);
            return { success: false, error: 'Impossible de joindre le serveur Jellyfin. Vérifiez que Jellyfin est bien démarré sur http://localhost:8096.' };
        }
    }

    /**
     * Déconnecte l'utilisateur et nettoie la session.
     */
    logout() {
        this._log.info('Déconnexion de l\'utilisateur...');
        this._saveAuth(null);
        window.location.reload();
    }

    _syncGlobalClient(serverUrl, token) {
        const cleanUrl = (serverUrl || '').replace(/\/$/, '');
        try {
            const jellyfinClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
            if (jellyfinClient) {
                jellyfinClient.setBaseUrl(cleanUrl);
                jellyfinClient.setApiKey(token);
                jellyfinClient.refreshAuth?.();
            }
        } catch {
            // Ignorer si pas encore enregistré
        }

        const self = this;
        window.ApiClient = {
            serverAddress: () => cleanUrl,
            accessToken: () => token,
            getCurrentUserId: () => self.getUserId(),
            getCurrentUser: async () => self.getUser(),
            deviceId: () => self.getDeviceId(),
                        getUrl: (endpoint, query) => {
                const ep = endpoint ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`) : '';
                const q = query ? '?' + new URLSearchParams(query).toString() : '';
                return `${cleanUrl}${ep}${q}`;
            },
            getImageUrl: (itemId, opts = {}) => {
                const params = new URLSearchParams({
                    maxWidth: opts.maxWidth ?? 400,
                    maxHeight: opts.maxHeight ?? 600,
                    quality: opts.quality ?? 90,
                    ...(token ? { api_key: token } : {})
                });
                return `${cleanUrl}/Items/${itemId}/Images/Primary?${params}`;
            },
            getItems: async (userId, options = {}) => {
                const params = new URLSearchParams(options).toString();
                const r = await fetch(`${cleanUrl}/Users/${userId || self.getUserId()}/Items?${params}`, {
                    headers: self.getAuthHeaders()
                });
                return await r.json();
            },
            getJSON: async (url) => {
                const fullUrl = url.startsWith('http') ? url : (url.startsWith('/') ? `${cleanUrl}${url}` : `${cleanUrl}/${url}`);
                const r = await fetch(fullUrl, { headers: self.getAuthHeaders() });
                return await r.json();
            }
        };
    }

    /**
     * Initialise l'état au démarrage de l'app.
     */
    async init() {
        if (this.isAuthenticated()) {
            this._syncGlobalClient(this.getServerUrl(), this.getToken());
            // Vérification de validité de session
            try {
                const res = await fetch(`${this.getServerUrl()}/System/Info`, {
                    headers: this.getAuthHeaders()
                });
                if (!res.ok) {
                    this._log.warn('Session expirée.');
                    this._saveAuth(null);
                    return false;
                }
                return true;
            } catch {
                return true; // En mode hors-ligne / erreur temporaire, préserver la session
            }
        }
        return false;
    }
}

export default AuthManager;
