/**
 * SpaceHub — Home Assistant API Client & Service
 * Version: 1.0.0
 *
 * Intégration native avec Home Assistant via l'API REST long-lived token.
 * - Lecture et contrôle d'entités (lumières, stores, prises, scènes, scripts)
 * - Événements temps réel via Server-Sent Events (SSE) WebSocket
 * - Gestion des automatisations et scènes (Cinema Mode, etc.)
 */

'use strict';

import Logger from '../../core/Logger.js';

class HomeAssistantService {
    constructor() {
        this._log = new Logger('HomeAssistantService');
        this._baseUrl = null;
        this._token = null;
        this._eventSource = null;
        this._entityCache = new Map();
        this._listeners = new Map();

        this._init();
    }

    _init() {
        const s = window.SpaceHub?.core?.settings;
        this._baseUrl = s?.get('homeassistant.url', '');
        this._token = s?.get('homeassistant.token', '');

        window.SpaceHub?.core?.eventBus?.on('settings:changed', (e) => {
            if (e.key.startsWith('homeassistant.') || e.key === '*') {
                this._baseUrl = s?.get('homeassistant.url', '');
                this._token = s?.get('homeassistant.token', '');
            }
        });
    }

    get _headers() {
        return {
            'Authorization': `Bearer ${this._token}`,
            'Content-Type': 'application/json'
        };
    }

    get isConfigured() {
        return !!(this._baseUrl && this._token);
    }

    /**
     * Teste la connexion à Home Assistant.
     */
    async testConnection() {
        try {
            const res = await fetch(`${this._baseUrl}/api/`, { headers: this._headers });
            if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
            const data = await res.json();
            return { success: true, message: data.message };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Récupère tous les états des entités.
     * @returns {Promise<Array<Object>>}
     */
    async getStates() {
        try {
            const res = await fetch(`${this._baseUrl}/api/states`, { headers: this._headers });
            if (!res.ok) return [];
            const states = await res.json();
            states.forEach(s => this._entityCache.set(s.entity_id, s));
            return states;
        } catch (err) {
            this._log.error('Erreur getStates:', err);
            return [];
        }
    }

    /**
     * Récupère l'état d'une entité spécifique.
     * @param {string} entityId
     */
    async getState(entityId) {
        try {
            const res = await fetch(`${this._baseUrl}/api/states/${entityId}`, { headers: this._headers });
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    /**
     * Appelle un service Home Assistant.
     * @param {string} domain - ex: 'light', 'scene', 'script'
     * @param {string} service - ex: 'turn_on', 'turn_off', 'activate'
     * @param {Object} data - Payload (entity_id, brightness, etc.)
     */
    async callService(domain, service, data = {}) {
        try {
            const res = await fetch(`${this._baseUrl}/api/services/${domain}/${service}`, {
                method: 'POST',
                headers: this._headers,
                body: JSON.stringify(data)
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur service ${domain}.${service}:`, err);
            return false;
        }
    }

    /**
     * Allume une entité (lumière, prise, etc.)
     * @param {string} entityId
     * @param {Object} opts - { brightness_pct, color_name, rgb_color, transition }
     */
    async turnOn(entityId, opts = {}) {
        const domain = entityId.split('.')[0];
        return this.callService(domain, 'turn_on', { entity_id: entityId, ...opts });
    }

    /**
     * Éteint une entité.
     */
    async turnOff(entityId) {
        const domain = entityId.split('.')[0];
        return this.callService(domain, 'turn_off', { entity_id: entityId });
    }

    /**
     * Active une scène Home Assistant.
     * @param {string} sceneEntityId
     */
    async activateScene(sceneEntityId) {
        return this.callService('scene', 'turn_on', { entity_id: sceneEntityId });
    }

    /**
     * Récupère toutes les scènes configurées.
     */
    async getScenes() {
        const states = await this.getStates();
        return states.filter(s => s.entity_id.startsWith('scene.'));
    }

    /**
     * Récupère les lumières.
     */
    async getLights() {
        const states = await this.getStates();
        return states.filter(s => s.entity_id.startsWith('light.'));
    }

    /**
     * Récupère les interrupteurs / prises.
     */
    async getSwitches() {
        const states = await this.getStates();
        return states.filter(s => s.entity_id.startsWith('switch.') || s.entity_id.startsWith('input_boolean.'));
    }

    /**
     * Récupère les capteurs (température, humidité, etc.)
     */
    async getSensors() {
        const states = await this.getStates();
        return states.filter(s =>
            s.entity_id.startsWith('sensor.') ||
            s.entity_id.startsWith('binary_sensor.')
        );
    }
}

export default HomeAssistantService;
