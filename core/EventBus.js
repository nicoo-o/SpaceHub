/**
 * SpaceHub — EventBus
 * Version: 0.2.0
 *
 * Système de communication pub/sub entre modules.
 * Permet aux modules de s'écouter sans couplage direct.
 *
 * Usage:
 *   const off = SpaceHub.core.eventBus.on('sonarr:added', handler);
 *   SpaceHub.core.eventBus.emit('dashboard:refresh', { reason: 'newContent' });
 *   off(); // se désabonner
 */

'use strict';

import Logger from './Logger.js';

class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();
        /** @type {Map<string, Set<Function>>} */
        this.onceListeners = new Map();
        this._log = new Logger('EventBus', 'warn');
    }

    /**
     * S'abonne à un événement.
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} Fonction de désabonnement
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    /**
     * S'abonne à un événement une seule fois.
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} Fonction de désabonnement
     */
    once(event, callback) {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }
        this.onceListeners.get(event).add(callback);
        return () => {
            const set = this.onceListeners.get(event);
            if (set) set.delete(callback);
        };
    }

    /**
     * Émet un événement et notifie tous les abonnés.
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        this._log.debug(`emit: ${event}`, data);

        // Abonnés permanents
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try { cb(data); }
                catch (err) { this._log.error(`Erreur dans le handler de "${event}":`, err); }
            });
        }

        // Abonnés one-shot
        const onceListeners = this.onceListeners.get(event);
        if (onceListeners) {
            onceListeners.forEach(cb => {
                try { cb(data); }
                catch (err) { this._log.error(`Erreur dans le handler once de "${event}":`, err); }
            });
            this.onceListeners.delete(event);
        }
    }

    /**
     * Se désabonne d'un événement.
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) this.listeners.delete(event);
        }
    }

    /**
     * Retire tous les abonnés d'un événement.
     * @param {string} event
     */
    clear(event) {
        this.listeners.delete(event);
        this.onceListeners.delete(event);
    }

    /** Liste tous les événements actifs (utile pour le debug) */
    getActiveEvents() {
        return [...new Set([...this.listeners.keys(), ...this.onceListeners.keys()])];
    }
}

export default EventBus;
