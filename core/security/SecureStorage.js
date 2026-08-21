/**
 * SpaceHub — Secure Storage
 * Version: 1.0.0
 *
 * Service de stockage sécurisé pour les clés API et données sensibles.
 * Utilise le coffre-fort du système d'exploitation (Keychain, Credential Manager, libsecret).
 * Fallback vers localStorage chiffré en environnement web.
 */

'use strict';

import Logger from '../Logger.js';

class SecureStorage {
    constructor() {
        this._log = new Logger('SecureStorage');
        this._isNative = this._checkNativeSupport();
        this._encryptionKey = null;
        
        this._log.info(`SecureStorage initialisé (Native: ${this._isNative})`);
    }

    /**
     * Vérifie si le support natif est disponible.
     * @private
     */
    _checkNativeSupport() {
        return window.electronAPI !== undefined;
    }

    /**
     * Stocke une valeur de manière sécurisée.
     * @param {string} key
     * @param {string} value
     * @returns {Promise<boolean>}
     */
    async set(key, value) {
        try {
            if (this._isNative) {
                // Utiliser keytar via Electron
                await window.electronAPI.secureStorage.set(key, value);
                this._log.debug(`Stocké nativement: ${key}`);
            } else {
                // Fallback web : chiffrement + localStorage
                const encrypted = await this._encrypt(value);
                localStorage.setItem(`secure_${key}`, encrypted);
                this._log.debug(`Stocké chiffré: ${key}`);
            }
            return true;
        } catch (err) {
            this._log.error(`Erreur stockage ${key}:`, err);
            return false;
        }
    }

    /**
     * Récupère une valeur stockée de manière sécurisée.
     * @param {string} key
     * @returns {Promise<string|null>}
     */
    async get(key) {
        try {
            if (this._isNative) {
                // Utiliser keytar via Electron
                const value = await window.electronAPI.secureStorage.get(key);
                return value;
            } else {
                // Fallback web : déchiffrement depuis localStorage
                const encrypted = localStorage.getItem(`secure_${key}`);
                if (!encrypted) return null;
                return await this._decrypt(encrypted);
            }
        } catch (err) {
            this._log.error(`Erreur récupération ${key}:`, err);
            return null;
        }
    }

    /**
     * Supprime une valeur stockée.
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async delete(key) {
        try {
            if (this._isNative) {
                await window.electronAPI.secureStorage.delete(key);
            } else {
                localStorage.removeItem(`secure_${key}`);
            }
            this._log.debug(`Supprimé: ${key}`);
            return true;
        } catch (err) {
            this._log.error(`Erreur suppression ${key}:`, err);
            return false;
        }
    }

    /**
     * Vide tout le stockage sécurisé.
     * @returns {Promise<boolean>}
     */
    async clear() {
        try {
            if (this._isNative) {
                await window.electronAPI.secureStorage.clear();
            } else {
                // Supprimer toutes les clés sécurisées
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('secure_')) {
                        localStorage.removeItem(key);
                    }
                }
            }
            this._log.info('Stockage sécurisé vidé');
            return true;
        } catch (err) {
            this._log.error('Erreur vidage stockage:', err);
            return false;
        }
    }

    /**
     * Chiffre une valeur (fallback web).
     * @private
     */
    async _encrypt(value) {
        if (!this._encryptionKey) {
            this._encryptionKey = await this._getOrCreateEncryptionKey();
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(value);
        
        const key = await crypto.subtle.importKey(
            'raw',
            this._encryptionKey,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        // Combiner IV + données chiffrées
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    /**
     * Déchiffre une valeur (fallback web).
     * @private
     */
    async _decrypt(encrypted) {
        if (!this._encryptionKey) {
            this._encryptionKey = await this._getOrCreateEncryptionKey();
        }

        const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const key = await crypto.subtle.importKey(
            'raw',
            this._encryptionKey,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    /**
     * Récupère ou crée la clé de chiffrement.
     * @private
     */
    async _getOrCreateEncryptionKey() {
        let key = localStorage.getItem('spacehub_encryption_key');
        
        if (!key) {
            // Générer une nouvelle clé
            key = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            localStorage.setItem('spacehub_encryption_key', key);
        }

        return Uint8Array.from(key.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    }

    /**
     * Migre les clés API depuis localStorage vers le stockage sécurisé.
     * @returns {Promise<number>} Nombre de clés migrées
     */
    async migrateFromLocalStorage() {
        const keysToMigrate = [
            'sonarr.apiKey',
            'radarr.apiKey',
            'prowlarr.apiKey',
            'bazarr.apiKey',
            'jellyseerr.apiKey',
            'qbittorrent.username',
            'qbittorrent.password',
            'lidarr.apiKey',
            'immich.apiKey'
        ];

        let migrated = 0;

        for (const key of keysToMigrate) {
            const value = localStorage.getItem(key);
            if (value) {
                const success = await this.set(key, value);
                if (success) {
                    localStorage.removeItem(key);
                    migrated++;
                    this._log.info(`Migré: ${key}`);
                }
            }
        }

        if (migrated > 0) {
            this._log.info(`${migrated} clés migrées vers le stockage sécurisé`);
        }

        return migrated;
    }

    /**
     * Vérifie si une clé existe.
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async has(key) {
        const value = await this.get(key);
        return value !== null;
    }
}

export default SecureStorage;
