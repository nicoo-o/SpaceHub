/**
 * SpaceHub — Decentralized Data & Preference Synchronization Service
 * Version: 1.0.0
 *
 * Permet d'exporter, importer et répliquer de manière décentralisée toutes
 * les données SpaceHub (réglages, watchlist, agencement des widgets, thèmes, serveurs)
 * entre différents appareils (PC, Mobile, TV).
 */

'use strict';

import Logger from '../Logger.js';

class DataSyncService {
    constructor(eventBus, settings) {
        this._log = new Logger('DataSyncService');
        this._eventBus = eventBus;
        this._settings = settings;
    }

    /**
     * Génère un payload complet de synchronisation.
     * @returns {Object}
     */
    generateSyncPayload() {
        const payload = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            deviceId: `device_${Math.random().toString(36).slice(2, 8)}`,
            settings: this._settings?.export() ? JSON.parse(this._settings.export()) : {},
            watchlist: this._getLocalStorageItem('SpaceHub_watchlist', []),
            servers: this._getLocalStorageItem('SpaceHub_servers_list', []),
            theme: localStorage.getItem('SpaceHub_theme') || 'spacehub-dark',
            analytics: this._getLocalStorageItem('SpaceHub_analytics', {})
        };

        this._log.info('Payload de synchronisation généré avec succès.');
        return payload;
    }

    /**
     * Exporte la configuration sous forme de fichier téléchargeable (.json).
     */
    exportToFile() {
        const payload = this.generateSyncPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `spacehub-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this._log.info('Fichier de sauvegarde exporté.');
    }

    /**
     * Importe et applique un payload de synchronisation.
     * @param {string|Object} payloadData
     * @returns {boolean}
     */
    importSyncPayload(payloadData) {
        try {
            const data = typeof payloadData === 'string' ? JSON.parse(payloadData) : payloadData;

            if (!data || typeof data !== 'object') {
                throw new Error('Données de sauvegarde invalides.');
            }

            // 1. Restaurer les réglages
            if (data.settings) {
                this._settings?.import(data.settings);
            }

            // 2. Restaurer la Watchlist
            if (Array.isArray(data.watchlist)) {
                localStorage.setItem('SpaceHub_watchlist', JSON.stringify(data.watchlist));
            }

            // 3. Restaurer les serveurs
            if (Array.isArray(data.servers)) {
                localStorage.setItem('SpaceHub_servers_list', JSON.stringify(data.servers));
            }

            // 4. Restaurer le thème
            if (data.theme) {
                window.SpaceHub?.ui?.themes?.apply(data.theme);
            }

            this._log.info('Synchronisation appliquée avec succès.');
            this._eventBus?.emit('sync:imported', data);
            window.SpaceHub?.ui?.components?.toaster?.success('Données synchronisées avec succès !');

            return true;
        } catch (err) {
            this._log.error('Erreur lors de l\'import de synchronisation:', err);
            window.SpaceHub?.ui?.components?.toaster?.error(`Erreur de synchronisation : ${err.message}`);
            return false;
        }
    }

    _getLocalStorageItem(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }
}

export default DataSyncService;
