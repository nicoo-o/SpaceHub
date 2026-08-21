/**
 * SpaceHub — Offline Download Manager (IndexedDB Storage)
 * Version: 1.0.0
 *
 * Gère le téléchargement et le stockage local sécurisé des médias Jellyfin
 * (Films, Épisodes, Musique) via IndexedDB pour la lecture sans connexion Internet.
 */

'use strict';

import Logger from '../../core/Logger.js';

const DB_NAME = 'SpaceHub_Offline_DB';
const STORE_NAME = 'downloads';
const DB_VERSION = 1;

class OfflineDownloadManager {
    constructor(eventBus) {
        this._log = new Logger('OfflineDownloadManager');
        this._eventBus = eventBus;
        this._db = null;
        this._activeDownloads = new Map(); // itemId -> { progress, controller }
        this._initDB();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                this._log.info('IndexedDB initialisée pour le stockage hors-ligne.');
                resolve(this._db);
            };
            req.onerror = (e) => {
                this._log.error('Erreur ouverture IndexedDB:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    async _getDB() {
        if (this._db) return this._db;
        return await this._initDB();
    }

    /**
     * Télécharge un média Jellyfin et l'enregistre en local dans IndexedDB.
     * @param {Object} item - Média Jellyfin
     * @param {string} [profile='original']
     */
    async downloadItem(item, profile = 'original') {
        if (this._activeDownloads.has(item.Id)) {
            window.SpaceHub?.ui?.components?.toaster?.info('Téléchargement déjà en cours.');
            return;
        }

        const serverUrl = this._auth?.getServerUrl();
        const token = this._auth?.getToken();
        const controller = new AbortController();

        this._activeDownloads.set(item.Id, {
            item,
            progress: 0,
            controller
        });

        this._eventBus?.emit('download:started', item);
        window.SpaceHub?.ui?.components?.toaster?.info(`Téléchargement de "${item.Name}" démarré...`);

        try {
            // URL de téléchargement direct
            const streamUrl = `${serverUrl}/Videos/${item.Id}/stream?static=true&api_key=${token}`;

            const response = await fetch(streamUrl, {
                signal: controller.signal,
                headers: this._auth?.getAuthHeaders()
            });

            if (!response.ok) throw new Error(`Échec réseau : HTTP ${response.status}`);

            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
            let loadedBytes = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loadedBytes += value.length;

                if (totalBytes > 0) {
                    const pct = Math.round((loadedBytes / totalBytes) * 100);
                    const currentDl = this._activeDownloads.get(item.Id);
                    if (currentDl) currentDl.progress = pct;
                    this._eventBus?.emit('download:progress', { itemId: item.Id, progress: pct });
                }
            }

            const blob = new Blob(chunks, { type: 'video/mp4' });
            const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);

            // Enregistrer dans IndexedDB
            const record = {
                id: item.Id,
                name: item.Name,
                seriesName: item.SeriesName || null,
                seasonNumber: item.ParentIndexNumber || null,
                episodeNumber: item.IndexNumber || null,
                type: item.Type,
                year: item.ProductionYear || null,
                overview: item.Overview || '',
                durationSeconds: (item.RunTimeTicks || 0) / 10000000,
                sizeMb: parseFloat(sizeMb),
                downloadedAt: new Date().toISOString(),
                blob: blob
            };

            await this._saveRecord(record);

            this._activeDownloads.delete(item.Id);
            this._eventBus?.emit('download:completed', record);
            this._log.info(`Téléchargement terminé pour "${item.Name}" (${sizeMb} Mo).`);
            window.SpaceHub?.ui?.components?.toaster?.success(`"${item.Name}" est prêt pour le visionnage hors-ligne !`);

            return record;
        } catch (err) {
            this._activeDownloads.delete(item.Id);
            if (err.name === 'AbortError') {
                this._log.info(`Téléchargement annulé pour "${item.Name}".`);
                window.SpaceHub?.ui?.components?.toaster?.info('Téléchargement annulé.');
            } else {
                this._log.error('Erreur téléchargement média:', err);
                window.SpaceHub?.ui?.components?.toaster?.error(`Erreur de téléchargement : ${err.message}`);
            }
            return null;
        }
    }

    async _saveRecord(record) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(record);
            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Récupère la liste de tous les médias stockés en local.
     * @returns {Promise<Array<Object>>}
     */
    async getOfflineItems() {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Récupère un média hors-ligne par son ID.
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getOfflineItem(id) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Supprime un média du stockage hors-ligne.
     * @param {string} id
     */
    async deleteOfflineItem(id) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => {
                this._eventBus?.emit('download:deleted', id);
                this._log.info(`Média hors-ligne supprimé : ${id}`);
                resolve(true);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Annule un téléchargement en cours.
     * @param {string} id
     */
    cancelDownload(id) {
        const dl = this._activeDownloads.get(id);
        if (dl) {
            dl.controller.abort();
            this._activeDownloads.delete(id);
        }
    }

    /**
     * Lance la lecture hors-ligne directe d'un média stocké.
     * @param {Object} itemRecord
     */
    playOffline(itemRecord) {
        if (!itemRecord || !itemRecord.blob) return;

        const blobUrl = URL.createObjectURL(itemRecord.blob);
        const player = window.SpaceHub?.player;

        if (player) {
            // Lecture directe du blob
            player.play({
                ...itemRecord,
                _isOffline: true,
                _blobUrl: blobUrl
            });
        }
    }
}

export default OfflineDownloadManager;
