/**
 * SpaceHub — CacheManager
 * Version: 0.2.0
 *
 * Cache unifié : IndexedDB (persistant, grandes données) + localStorage (rapide, petites données).
 * Supporte le TTL (Time To Live) pour l'expiration automatique des entrées.
 *
 * Usage:
 *   await SpaceHub.core.cache.set('jellyfin', 'latestItems', data, 300); // TTL 5min
 *   const data = await SpaceHub.core.cache.get('jellyfin', 'latestItems');
 *
 *   SpaceHub.core.cache.setLocal('theme', 'cyberpunk');
 *   const theme = SpaceHub.core.cache.getLocal('theme');
 */

'use strict';

import Logger from './Logger.js';

const DB_NAME    = 'SpaceHubCache';
const DB_VERSION = 1;
const STORES     = ['jellyfin', 'sonarr', 'radarr', 'prowlarr', 'bazarr', 'general'];
const LS_PREFIX  = 'SpaceHub_cache_';

class CacheManager {
    constructor() {
        this._log = new Logger('CacheManager');
        /** @type {IDBDatabase|null} */
        this._db = null;
        this._ready = this._initIndexedDB();
    }

    // ─── IndexedDB ───────────────────────────────────────────────────────────────

    _initIndexedDB() {
        return new Promise((resolve) => {
            if (!window.indexedDB) {
                this._log.warn('IndexedDB non disponible. Le cache persistant est désactivé.');
                return resolve(false);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (e) => {
                this._log.error('Échec d\'ouverture IndexedDB.', e.target.error);
                resolve(false);
            };

            request.onsuccess = (e) => {
                this._db = e.target.result;
                this._log.info('IndexedDB initialisé.');
                resolve(true);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                STORES.forEach(store => {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store);
                        this._log.debug(`Store IndexedDB créé : "${store}"`);
                    }
                });
            };
        });
    }

    /**
     * Lit une valeur depuis IndexedDB.
     * Retourne null si la clé n'existe pas ou si le TTL est expiré.
     * @param {string} storeName
     * @param {string} key
     * @returns {Promise<*>}
     */
    async get(storeName, key) {
        await this._ready;
        if (!this._db) return null;

        return new Promise((resolve, reject) => {
            try {
                const tx  = this._db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).get(key);

                req.onsuccess = () => {
                    const entry = req.result;
                    if (!entry) return resolve(null);
                    // Vérification TTL
                    if (entry.expires && Date.now() > entry.expires) {
                        this.delete(storeName, key); // Nettoyage silencieux
                        return resolve(null);
                    }
                    resolve(entry.value);
                };
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Écrit une valeur dans IndexedDB.
     * @param {string} storeName
     * @param {string} key
     * @param {*} value
     * @param {number|null} ttlSeconds - Durée de vie en secondes (null = permanent)
     * @returns {Promise<void>}
     */
    async set(storeName, key, value, ttlSeconds = null) {
        await this._ready;
        if (!this._db) return;

        return new Promise((resolve, reject) => {
            try {
                const tx    = this._db.transaction(storeName, 'readwrite');
                const entry = { value };
                if (ttlSeconds) entry.expires = Date.now() + ttlSeconds * 1000;

                const req = tx.objectStore(storeName).put(entry, key);
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Supprime une entrée d'IndexedDB.
     * @param {string} storeName
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        await this._ready;
        if (!this._db) return;

        return new Promise((resolve, reject) => {
            try {
                const tx  = this._db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).delete(key);
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Vide entièrement un store IndexedDB.
     * @param {string} storeName
     * @returns {Promise<void>}
     */
    async clearStore(storeName) {
        await this._ready;
        if (!this._db) return;

        return new Promise((resolve, reject) => {
            try {
                const tx  = this._db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).clear();
                req.onsuccess = () => {
                    this._log.info(`Store "${storeName}" vidé.`);
                    resolve();
                };
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // ─── localStorage ────────────────────────────────────────────────────────────

    /**
     * Lit une valeur depuis localStorage.
     * @param {string} key
     * @param {*} [fallback]
     * @returns {*}
     */
    getLocal(key, fallback = null) {
        try {
            const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
            if (raw === null) return fallback;
            const entry = JSON.parse(raw);
            if (entry.expires && Date.now() > entry.expires) {
                localStorage.removeItem(`${LS_PREFIX}${key}`);
                return fallback;
            }
            return entry.value;
        } catch {
            return fallback;
        }
    }

    /**
     * Écrit une valeur dans localStorage.
     * @param {string} key
     * @param {*} value
     * @param {number|null} ttlSeconds
     */
    setLocal(key, value, ttlSeconds = null) {
        try {
            const entry = { value };
            if (ttlSeconds) entry.expires = Date.now() + ttlSeconds * 1000;
            localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(entry));
        } catch (err) {
            this._log.warn(`Impossible d'écrire "${key}" dans localStorage.`, err);
        }
    }

    /**
     * Supprime une entrée de localStorage.
     * @param {string} key
     */
    deleteLocal(key) {
        localStorage.removeItem(`${LS_PREFIX}${key}`);
    }

    /** Vide toutes les entrées SpaceHub dans localStorage. */
    clearLocal() {
        Object.keys(localStorage)
            .filter(k => k.startsWith(LS_PREFIX))
            .forEach(k => localStorage.removeItem(k));
        this._log.info('Cache localStorage vidé.');
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    /**
     * Lit depuis IndexedDB, ou exécute fetchFn si absent, puis met en cache.
     * @param {string} storeName
     * @param {string} key
     * @param {Function} fetchFn  - Fonction async retournant la donnée fraîche
     * @param {number} ttlSeconds
     * @returns {Promise<*>}
     */
    async getOrFetch(storeName, key, fetchFn, ttlSeconds = 60) {
        const cached = await this.get(storeName, key);
        if (cached !== null) return cached;
        const fresh = await fetchFn();
        await this.set(storeName, key, fresh, ttlSeconds);
        return fresh;
    }
}

export default CacheManager;
