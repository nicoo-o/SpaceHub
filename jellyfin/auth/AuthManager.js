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

    /**
     * Génère les en-têtes d'autorisation Jellyfin officiels.
     * @returns {Record<string, string>}
     */
    getAuthHeaders() {
        const token = this.getToken();
        const authHeader = `MediaBrowser Client="SpaceHub Web", Device="Web Browser", DeviceId="spacehub-web-${navigator.userAgent.slice(0, 15)}", Version="1.0.0"${token ? `, Token="${token}"` : ''}`;

        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Emby-Authorization': authHeader,
            ...(token ? { 'Authorization': `MediaBrowser Token="${token}"` } : {})
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
        const cleanUrl = serverUrl.trim().replace(/\/$/, '');
        this._log.info(`Tentative de connexion à ${cleanUrl} pour "${username}"...`);

        try {
            const res = await fetch(`${cleanUrl}/Users/AuthenticateByName`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': `MediaBrowser Client="SpaceHub Web", Device="Web Browser", DeviceId="spacehub-web", Version="1.0.0"`
                },
                body: JSON.stringify({
                    Username: username,
                    Pw: password
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                return { success: false, error: res.status === 401 ? 'Identifiants invalides' : `Erreur serveur (${res.status})` };
            }

            const data = await res.json();
            const authPayload = {
                ServerUrl: cleanUrl,
                AccessToken: data.AccessToken,
                User: data.User,
                SessionInfo: data.SessionInfo
            };

            this._saveAuth(authPayload);

            // Mettre à jour l'ApiClient global de SpaceHub
            this._syncGlobalClient(cleanUrl, data.AccessToken);

            this._log.info(`✅ Connecté en tant que ${data.User.Name} !`);
            return { success: true, user: data.User };
        } catch (err) {
            this._log.error('Erreur réseau de connexion:', err);
            return { success: false, error: 'Impossible de joindre le serveur Jellyfin. Vérifiez l\'URL.' };
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
        const jellyfinClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
        if (jellyfinClient) {
            jellyfinClient.setBaseUrl(serverUrl);
            jellyfinClient.setApiKey(token);
        }

        // Mock minimal d'ApiClient pour les composants rétrocompatibles
        window.ApiClient = {
            serverAddress: () => serverUrl,
            accessToken: () => token,
            getCurrentUserId: () => this.getUserId(),
            getCurrentUser: async () => this.getUser(),
            deviceId: () => 'spacehub-web',
            getUrl: (endpoint) => `${serverUrl}${endpoint}`,
            getJSON: async (url) => {
                const r = await fetch(url, { headers: this.getAuthHeaders() });
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
