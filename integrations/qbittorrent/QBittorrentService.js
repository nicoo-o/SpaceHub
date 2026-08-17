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
    constructor() {
        this.api = new QBittorrentApi();
        this._log = new Logger('QBittorrentService');
        this._cache = window.SpaceHub?.core?.cache || null;
        this._eventBus = window.SpaceHub?.core?.eventBus || null;

        // Mise à jour de l'API client si les paramètres changent
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key }) => {
                if (key?.startsWith('qbittorrent.')) this.api.updateConfig();
            });
        }
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
