/**
 * SpaceHub — Lidarr Service
 * Version: 1.0.0
 *
 * Service pilotant l'intégration Lidarr.
 */

'use strict';

import LidarrApi from './LidarrApi.js';
import Logger from '../../core/Logger.js';

class LidarrService {
    constructor() {
        this._log = new Logger('LidarrService');
        this.api = null;

        this._reconfigure();

        // Enregistre le listener UNE SEULE FOIS dans le constructeur
        window.SpaceHub?.core?.eventBus?.on('settings:changed', (e) => {
            if (e.key.startsWith('lidarr.') || (e.key === '*' && (e.value?.['lidarr.url'] || e.value?.['lidarr.apiKey']))) {
                this._reconfigure();
            }
        });
    }

    _reconfigure() {
        const s = window.SpaceHub?.core?.settings;
        const url = s?.get('lidarr.url', 'http://localhost:8686');
        const key = s?.get('lidarr.apiKey', '');

        if (url && key) {
            this.api = new LidarrApi(url, key);
        } else {
            this.api = null;
        }
    }

    async getUpcomingAlbums(days = 14) {
        if (!this.api) return [];
        const start = new Date().toISOString();
        const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        return await this.api.getCalendar(start, end);
    }
}

export default LidarrService;
