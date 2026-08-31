/**
 * SpaceHub — qBittorrent Service
 * Version: 0.11.0
 *
 * Couche de service métier pour l'intégration qBittorrent.
 * Gère la surveillance des téléchargements, la vitesse en direct,
 * et les commandes de contrôle (pause, reprise, suppression).
 */

'use strict';

import Logger from '../../core/Logger.js';
import QBittorrentApi from './QBittorrentApi.js';

class QBittorrentService {
    /**
     * @param {Object} [options]
     * @param {Object} [options.api]
     * @param {import('../../core/CacheManager.js').default} [options.cache]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     * @param {import('../../core/SettingsManager.js').default} [options.settings]
     */
    constructor({ api = null, cache = null, eventBus = null, settings = null } = {}) {
        this.api = api || this._createDefaultApi();
        this._log = new Logger('QBittorrentService');
        this._cache = cache || window.SpaceHub?.core?.cache || null;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus || null;
        this._settings = settings || window.SpaceHub?.core?.settings || null;
        this.status = 'unconfigured';
        this.lastLatency = null;

        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === 'qbittorrent.url') this.api?.setBaseUrl?.(value);
            });
        }
    }

    _createDefaultApi() {
        return new QBittorrentApi();
    }

    /**
     * Vérifie la santé et la connectivité réelle du service.
     * @returns {Promise<'unconfigured'|'connected'|'offline'|'auth_failed'|'error'>}
     */
    async checkHealth() {
        const url = this._settings?.get('qbittorrent.url') || this.api?.baseUrl;
        const key = this._settings?.get('qbittorrent.apiKey') || this.api?.apiKey;

        const explicitlyConfigured = this._settings?.has?.('qbittorrent.url') || this._settings?.has?.('qbittorrent.password');
        if (!url || (this._settings && !explicitlyConfigured)) {
            this.status = 'unconfigured';
            this._eventBus?.emit('service:statusChanged', { id: 'qbittorrent', status: this.status });
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

        this._eventBus?.emit('service:statusChanged', { id: 'qbittorrent', status: this.status, latency: this.lastLatency });
        return this.status;
    }

    /**
     * Récupère la liste des torrents actifs ou récents.
     * @param {'all'|'downloading'|'seeding'|'active'} [filter='all']
     * @returns {Promise<Array<Object>>}
     */
    async getTorrents(filter = 'all') {
        const cacheKey = `qbittorrent_torrents_${filter}`;
        if (this._cache) {
            const cached = await this._cache.get('general', cacheKey);
            if (cached) return cached;
        }

        const torrents = await this.api.getTorrents(filter);
        if (this._cache) {
            await this._cache.set('general', cacheKey, torrents, 10); // 10s TTL rapide
        }

        return torrents;
    }

    /**
     * Récupère les métriques de transfert en direct (vitesse, totaux).
     * @returns {Promise<Object>}
     */
    async getTransferStats() {
        return await this.api.getTransferInfo();
    }

    /**
     * Met en pause un torrent.
     * @param {string} hash
     */
    async pauseTorrent(hash) {
        await this.api.pauseTorrents(hash);
        if (this._cache) await this._cache.delete('general', 'qbittorrent_torrents_all');
        if (this._eventBus) this._eventBus.emit('qbittorrent:torrentsUpdated');
        window.SpaceHub?.ui?.components?.toaster?.info('Téléchargement mis en pause.');
    }

    /**
     * Reprend un torrent.
     * @param {string} hash
     */
    async resumeTorrent(hash) {
        await this.api.resumeTorrents(hash);
        if (this._cache) await this._cache.delete('general', 'qbittorrent_torrents_all');
        if (this._eventBus) this._eventBus.emit('qbittorrent:torrentsUpdated');
        window.SpaceHub?.ui?.components?.toaster?.success('Téléchargement repris.');
    }

    /**
     * Supprime un torrent.
     * @param {string} hash
     * @param {boolean} [deleteFiles=false]
     */
    async deleteTorrent(hash, deleteFiles = false) {
        await this.api.deleteTorrents(hash, deleteFiles);
        if (this._cache) await this._cache.delete('general', 'qbittorrent_torrents_all');
        if (this._eventBus) this._eventBus.emit('qbittorrent:torrentsUpdated');
        window.SpaceHub?.ui?.components?.toaster?.info('Torrent supprimé de qBittorrent.');
    }
}

export default QBittorrentService;
