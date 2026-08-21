/**
 * SpaceHub — Immich Service
 * Version: 1.0.0
 *
 * Service pilotant l'intégration Immich.
 */

'use strict';

import ImmichApi from './ImmichApi.js';
import Logger from '../../core/Logger.js';

class ImmichService {
    constructor() {
        this._log = new Logger('ImmichService');
        this.api = null;

        this._init();
    }

    _init() {
        const s = window.SpaceHub?.core?.settings;
        const url = s.get('immich.url', '');
        const key = s.get('immich.apiKey', '');

        if (url && key) {
            this.api = new ImmichApi(url, key);
        }

        window.SpaceHub?.core?.eventBus?.on('settings:changed', (e) => {
            // Réagir aux changements individuels ou globaux (batch)
            if (e.key.startsWith('immich.') || (e.key === '*' && (e.value['immich.url'] || e.value['immich.apiKey']))) {
                this._init();
            }
        });
    }

    async getRecentPhotos(limit = 50) {
        if (!this.api) return [];
        return await this.api.getAssets({ limit, type: 'IMAGE' });
    }
}

export default ImmichService;
