/**
 * SpaceHub — Offline Sync Reconnector
 * Version: 1.0.0
 *
 * Enregistre la progression des visionnages effectués hors-ligne
 * et les synchronise automatiquement sur le serveur Jellyfin lors du retour en ligne.
 */

'use strict';

import Logger from '../../core/Logger.js';

const STORAGE_KEY = 'SpaceHub_offline_watched_queue';

class OfflineSyncReconnector {
    constructor(eventBus) {
        this._log = new Logger('OfflineSyncReconnector');
        this._eventBus = eventBus;
        this._initListeners();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    _initListeners() {
        window.addEventListener('online', () => {
            this._log.info('Connexion Internet rétablie. Démarrage de la synchronisation de reprise...');
            this.syncQueue();
        });

        // Tenter une sync au démarrage de l'app si connecté
        if (navigator.onLine) {
            setTimeout(() => this.syncQueue(), 3000);
        }
    }

    /**
     * Enregistre un progrès de visionnage hors-ligne.
     * @param {string} itemId
     * @param {number} positionSeconds
     * @param {boolean} isPlayed
     */
    recordOfflineProgress(itemId, positionSeconds, isPlayed = false) {
        try {
            const queue = this._getQueue();
            const index = queue.findIndex(q => q.itemId === itemId);
            const entry = {
                itemId,
                positionTicks: Math.round(positionSeconds * 10000000),
                isPlayed,
                watchedAt: new Date().toISOString()
            };

            if (index >= 0) {
                queue[index] = entry;
            } else {
                queue.push(entry);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            this._log.info(`Progression hors-ligne enregistrée pour ${itemId} (${Math.round(positionSeconds)}s).`);
        } catch (err) {
            this._log.error('Erreur enregistrement progression hors-ligne:', err);
        }
    }

    _getQueue() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /**
     * Synchronise tous les visionnages en attente avec le serveur Jellyfin.
     */
    async syncQueue() {
        const queue = this._getQueue();
        if (queue.length === 0 || !this._auth?.isAuthenticated()) return;

        this._log.info(`Synchronisation de ${queue.length} visionnage(s) hors-ligne...`);
        const serverUrl = this._auth.getServerUrl();
        const userId = this._auth.getUserId();
        const remaining = [];

        for (const item of queue) {
            try {
                if (item.isPlayed) {
                    await fetch(`${serverUrl}/Users/${userId}/PlayedItems/${item.itemId}`, {
                        method: 'POST',
                        headers: this._auth.getAuthHeaders()
                    });
                } else {
                    await fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
                        method: 'POST',
                        headers: this._auth.getAuthHeaders(),
                        body: JSON.stringify({
                            ItemId: item.itemId,
                            PositionTicks: item.positionTicks
                        })
                    });
                }
            } catch (err) {
                this._log.warn(`Échec synchro pour ${item.itemId}:`, err.message);
                remaining.push(item);
            }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));

        if (remaining.length < queue.length) {
            const syncedCount = queue.length - remaining.length;
            this._log.info(`${syncedCount} visionnage(s) synchronisés avec Jellyfin.`);
            window.SpaceHub?.ui?.components?.toaster?.success(`${syncedCount} progression(s) hors-ligne synchronisées avec le serveur !`);
        }
    }
}

export default OfflineSyncReconnector;
