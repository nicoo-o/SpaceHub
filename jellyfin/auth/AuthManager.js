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

import * as svc from '../../core/services.js';
const STORAGE_KEY = 'SpaceHub_jellyfin_auth';

class AuthManager {
    constructor() {
        this._log = new Logger('AuthManager');
        this._authData = this._loadAuth();
    }

    _loadAuth() {
        try {
            // Session persistante (standard client Jellyfin Web) : la session survit
            // au rechargement et à la fermeture de l'onglet. L'ancienne copie
            // sessionStorage (hardening v1) est migrée automatiquement vers localStorage.
            const persistentRaw = localStorage.getItem(STORAGE_KEY);
            if (persistentRaw) return JSON.parse(persistentRaw);
            const sessionRaw = sessionStorage.getItem(STORAGE_KEY);
            if (sessionRaw) {
                const data = JSON.parse(sessionRaw);
                sessionStorage.removeItem(STORAGE_KEY);
                if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                return data;
            }
            return null;
        } catch {
            return null;
        }
    }

    _saveAuth(data) {
        this._authData = data;
        if (data) {
            // Session persistante (comportement du client Jellyfin Web officiel) :
            // le token survit au rechargement et à la fermeture de l'onglet ; il est
            // effacé uniquement à la déconnexion ou si le serveur renvoie 401/403.
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } else {
            localStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_KEY);
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
            const directUrl = `${targetBase}/Users/AuthenticateByName`;
            const url = targetBase
                ? directUrl
                : `/api-proxy?url=${encodeURIComponent(`${cleanUrl}/Users/AuthenticateByName`)}`;
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
     * Liste les comptes affichables sur l'écran de connexion.
     *
     * Jellyfin expose `/Users/Public` sans authentification : ce sont les
     * comptes que l'administrateur a choisi de rendre visibles. C'est ce qui
     * permet de proposer un choix de profil au lieu d'un champ texte vide —
     * l'audit relevait que l'application était mono-utilisateur en pratique.
     *
     * Un serveur qui masque ses utilisateurs renvoie une liste vide : l'écran
     * de connexion retombe alors sur la saisie du nom, sans erreur.
     *
     * @param {string} serverUrl
     * @returns {Promise<Array<{Id: string, Name: string, PrimaryImageTag?: string, HasPassword?: boolean}>>}
     */
    async getPublicUsers(serverUrl) {
        const base = (serverUrl || '').trim().replace(/\/$/, '');
        if (!base) return [];
        const tenter = async (url) => {
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        };
        try {
            return await tenter(`${base}/Users/Public`);
        } catch (direct) {
            try {
                // Même repli que la connexion : le proxy relatif du serveur de
                // développement, quand l'appel direct est bloqué par CORS.
                return await tenter(`/api-proxy?url=${encodeURIComponent(`${base}/Users/Public`)}`);
            } catch (viaProxy) {
                this._log.warn('Liste des comptes publics indisponible :', viaProxy?.message || direct?.message);
                return [];
            }
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
            const jellyfinClient = svc.api()?.getClient('jellyfin');
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
                    quality: opts.quality ?? 90
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
            // Vérification de validité : seule une réponse 401/403 (token réellement
            // révoqué) invalide la session persistante. Un timeout proxy, un 502/504
            // ou un serveur temporairement injoignable préserve la session.
            try {
                const res = await fetch(`${this.getServerUrl()}/System/Info`, {
                    headers: this.getAuthHeaders()
                });
                if (res.status === 401 || res.status === 403) {
                    this._log.warn('Token Jellyfin révoqué par le serveur — session effacée.');
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
