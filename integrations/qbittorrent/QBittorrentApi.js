/**
 * SpaceHub — qBittorrent API Client
 * Version: 0.11.0
 *
 * Client HTTP spécialisé pour l'API WebUI qBittorrent (v2).
 * Gère l'authentification basée sur session (SID cookie), la récupération
 * des torrents, des vitesses de transfert, et le contrôle des téléchargements.
 */

'use strict';

import Logger from '../../core/Logger.js';

import * as svc from '../../core/services.js';
class QBittorrentApi {
    constructor() {
        this._log = new Logger('QBittorrentApi');
        this.updateConfig();
    }

    updateConfig() {
        const settings = svc.settings();
        this.baseUrl = (settings?.get('qbittorrent.url', 'http://localhost:8080') || 'http://localhost:8080').replace(/\/$/, '');
        this.username = settings?.get('qbittorrent.username', 'admin') || 'admin';
        this.password = settings?.get('qbittorrent.password', '') || '';
        this._sid = null;
    }

    /**
     * Authentification auprès de l'API WebUI qBittorrent.
     * @returns {Promise<boolean>}
     */
    async login() {
        this.updateConfig();
        const isCrossDomain = typeof window !== 'undefined' && this.baseUrl.startsWith('http') && !this.baseUrl.startsWith(window.location.origin);
        const directUrl = `${this.baseUrl}/api/v2/auth/login`;
        let url = isCrossDomain ? `/api-proxy?url=${encodeURIComponent(directUrl)}` : directUrl;

        const body = new URLSearchParams({
            username: this.username,
            password: this.password
        });

        try {
            let response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString(),
                    credentials: 'include'
                });
            } catch (netErr) {
                // Si échec direct, fallback sur le proxy universel
                const proxyUrl = `/api-proxy?url=${encodeURIComponent(directUrl)}`;
                response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString(),
                    credentials: 'include'
                });
            }

            if (!response.ok) {
                this._log.error(`Échec authentification qBittorrent (${response.status})`);
                return false;
            }

            const text = (await response.text()).trim();
            if (text === 'Ok.' || text.includes('Ok.')) {
                this._log.info('Authentification qBittorrent réussie.');
                return true;
            }

            this._log.warn(`Identifiants qBittorrent invalides (réponse: ${text}).`);
            return false;
        } catch (err) {
            this._log.error('Erreur réseau lors du login qBittorrent:', err);
            return false;
        }
    }

    /**
     * Effectue une requête authentifiée vers l'API qBittorrent avec fallback proxy.
     */
    async request(endpoint, options = {}) {
        const isCrossDomain = typeof window !== 'undefined' && this.baseUrl.startsWith('http') && !this.baseUrl.startsWith(window.location.origin);
        const directUrl = `${this.baseUrl}${endpoint}`;
        let url = isCrossDomain ? `/api-proxy?url=${encodeURIComponent(directUrl)}` : directUrl;
        const config = {
            ...options,
            credentials: 'include'
        };

        let response;
        try {
            response = await fetch(url, config);
        } catch (netErr) {
            // Fallback automatique sur le proxy universel
            const proxyUrl = `/api-proxy?url=${encodeURIComponent(directUrl)}`;
            response = await fetch(proxyUrl, config);
        }

        // Si non autorisé (403), retenter un login puis refaire la requête
        if (response.status === 403) {
            this._log.info('Session expirée ou non authentifiée, tentative de login...');
            const loggedIn = await this.login();
            if (loggedIn) {
                try {
                    response = await fetch(url, config);
                } catch (retryErr) {
                    const proxyUrl = `/api-proxy?url=${encodeURIComponent(url)}`;
                    response = await fetch(proxyUrl, config);
                }
            } else {
                throw new Error('Impossible de s\'authentifier sur qBittorrent (Vérifiez nom d\'utilisateur et mot de passe).');
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} sur ${endpoint}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    }

    /**
     * Teste la connexion avec le serveur qBittorrent.
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async testConnection() {
        this.updateConfig();
        try {
            // 1. Tenter d'abord un accès direct (cas où localhost bypass est activé)
            try {
                const directVer = await this.request('/api/v2/app/version');
                if (directVer && typeof directVer === 'string' && !directVer.includes('<!DOCTYPE')) {
                    this._log.info(`Connexion qBittorrent directe réussie (version: ${directVer.trim()})`);
                    return { success: true, version: directVer.trim() };
                }
            } catch (noAuthErr) {
                // Besoin d'authentification
            }

            // 2. Tenter le login
            const loggedIn = await this.login();
            if (!loggedIn) {
                return { success: false, error: 'Identifiants invalides ou CSRF WebUI activé' };
            }

            const version = await this.request('/api/v2/app/version');
            this._log.info(`Connexion qBittorrent réussie (version: ${version})`);
            return { success: true, version: String(version).trim() };
        } catch (err) {
            this._log.error('Échec du test de connexion qBittorrent:', err);
            return { success: false, error: err.message || 'Serveur qBittorrent injoignable' };
        }
    }

    // ─── Transferts & Statistiques ────────────────────────────────────────────

    /**
     * Récupère les informations de transfert globales (vitesse DL/UP, totaux).
     * @returns {Promise<{ dl_info_speed: number, up_info_speed: number, dl_info_data: number, up_info_data: number }>}
     */
    async getTransferInfo() {
        return await this.request('/api/v2/transfer/info');
    }

    // ─── Gestion des Torrents ─────────────────────────────────────────────────

    /**
     * Récupère la liste des torrents.
     * @param {'all'|'downloading'|'seeding'|'completed'|'paused'|'active'} [filter='all']
     * @param {string} [category]
     * @returns {Promise<Array<Object>>}
     */
    async getTorrents(filter = 'all', category = '') {
        const params = new URLSearchParams({ filter });
        if (category) params.append('category', category);
        return await this.request(`/api/v2/torrents/info?${params.toString()}`);
    }

    /**
     * Met en pause un ou plusieurs torrents.
     * @param {string|Array<string>} hashes - Hash unique ou tableau de hashes
     */
    async pauseTorrents(hashes) {
        const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;
        const body = new URLSearchParams({ hashes: hashList });
        return await this.request('/api/v2/torrents/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
    }

    /**
     * Reprend un ou plusieurs torrents.
     * @param {string|Array<string>} hashes
     */
    async resumeTorrents(hashes) {
        const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;
        const body = new URLSearchParams({ hashes: hashList });
        return await this.request('/api/v2/torrents/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
    }

    /**
     * Supprime un ou plusieurs torrents.
     * @param {string|Array<string>} hashes
     * @param {boolean} [deleteFiles=false]
     */
    async deleteTorrents(hashes, deleteFiles = false) {
        const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;
        const body = new URLSearchParams({
            hashes: hashList,
            deleteFiles: String(deleteFiles)
        });
        return await this.request('/api/v2/torrents/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
    }

    /**
     * Ajoute un torrent par URL (magnet ou .torrent).
     * @param {string} urls
     * @param {string} [category]
     */
    async addTorrentUrl(urls, category = '') {
        const body = new URLSearchParams({ urls });
        if (category) body.append('category', category);
        return await this.request('/api/v2/torrents/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
    }
}

export default QBittorrentApi;
