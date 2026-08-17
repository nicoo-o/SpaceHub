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

class QBittorrentApi {
    constructor() {
        this._log = new Logger('QBittorrentApi');
        this.updateConfig();
    }

    updateConfig() {
        const settings = window.SpaceHub?.core?.settings;
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
        const url = `${this.baseUrl}/api/v2/auth/login`;

        const body = new URLSearchParams({
            username: this.username,
            password: this.password
        });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
                credentials: 'include'
            });

            if (!response.ok) {
                this._log.error(`Échec authentification qBittorrent (${response.status})`);
                return false;
            }

            const text = await response.text();
            if (text.includes('Ok.') || response.ok) {
                this._log.info('Authentification qBittorrent réussie.');
                return true;
            }

            this._log.warn('Identifiants qBittorrent invalides.');
            return false;
        } catch (err) {
            this._log.error('Erreur réseau lors du login qBittorrent:', err);
            return false;
        }
    }

    /**
     * Effectue une requête authentifiée vers l'API qBittorrent.
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            credentials: 'include'
        };

        let response = await fetch(url, config);

        // Si non autorisé (403), retenter un login puis refaire la requête
        if (response.status === 403) {
            this._log.info('Session expirée, ré-authentification...');
            const loggedIn = await this.login();
            if (loggedIn) {
                response = await fetch(url, config);
            } else {
                throw new Error('Impossible de s\'authentifier sur qBittorrent.');
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
        try {
            const loggedIn = await this.login();
            if (!loggedIn) return { success: false, error: 'Identifiants invalides' };

            const version = await this.request('/api/v2/app/version');
            this._log.info(`Connexion qBittorrent réussie (version: ${version})`);
            return { success: true, version: String(version) };
        } catch (err) {
            this._log.error('Échec du test de connexion qBittorrent:', err);
            return { success: false, error: err.message };
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
