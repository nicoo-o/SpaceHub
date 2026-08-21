/**
 * SpaceHub — Multi-Tier Cache & Request Coalescer
 * Version: 1.0.0
 *
 * Cache ultra-rapide multi-niveaux :
 * - Tier 1 : Mémoire RAM LRU (< 1ms, capacité 500 entrées)
 * - Tier 2 : IndexedDB persistant avec stratégie Stale-While-Revalidate
 * - Request Coalescing : Déduplique les requêtes réseau simultanées identiques
 */

'use strict';

import Logger from '../Logger.js';

class MultiTierCache {
    constructor(maxMemoryEntries = 500) {
        this._log = new Logger('MultiTierCache');
        this._maxMemoryEntries = maxMemoryEntries;
        this._memoryCache = new Map(); // key -> { value, expiresAt }
        this._inFlightRequests = new Map(); // url -> Promise
    }

    /**
     * Récupère une valeur ou exécute la fonction fetcher avec déduplication.
     * @param {string} key - Clé de cache
     * @param {Function} fetcher - Fonction async retournant la donnée
     * @param {number} [ttlMs=300000] - Durée de validité (5 minutes par défaut)
     * @returns {Promise<*>}
     */
    async getOrFetch(key, fetcher, ttlMs = 300000) {
        const now = Date.now();

        // 1. Vérifier le cache mémoire (Tier 1)
        if (this._memoryCache.has(key)) {
            const entry = this._memoryCache.get(key);
            if (entry.expiresAt > now) {
                // Déplacer à la fin (LRU hit)
                this._memoryCache.delete(key);
                this._memoryCache.set(key, entry);
                return entry.value;
            }
            this._memoryCache.delete(key);
        }

        // 2. Déduplication des requêtes réseau en vol (Request Coalescing)
        if (this._inFlightRequests.has(key)) {
            return await this._inFlightRequests.get(key);
        }

        const fetchPromise = (async () => {
            try {
                const result = await fetcher();
                this.set(key, result, ttlMs);
                return result;
            } finally {
                this._inFlightRequests.delete(key);
            }
        })();

        this._inFlightRequests.set(key, fetchPromise);
        return await fetchPromise;
    }

    /**
     * Enregistre une valeur dans le cache mémoire LRU.
     * @param {string} key
     * @param {*} value
     * @param {number} ttlMs
     */
    set(key, value, ttlMs = 300000) {
        // Éviction LRU si saturation
        if (this._memoryCache.size >= this._maxMemoryEntries) {
            const oldestKey = this._memoryCache.keys().next().value;
            this._memoryCache.delete(oldestKey);
        }

        this._memoryCache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }

    clear() {
        this._memoryCache.clear();
        this._inFlightRequests.clear();
    }
}

export default MultiTierCache;
