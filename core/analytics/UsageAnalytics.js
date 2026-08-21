/**
 * SpaceHub — UsageAnalytics
 * Version: 1.0.0
 *
 * Collecte des statistiques d'utilisation anonymisées en local :
 * - Temps passé par vue
 * - Nombre de lectures lancées
 * - Interactions avec les widgets
 */

'use strict';

import Logger from '../Logger.js';

class UsageAnalytics {
    constructor(eventBus) {
        this._log = new Logger('UsageAnalytics');
        this._eventBus = eventBus;
        this._stats = this._load();

        this._initListeners();
    }

    _load() {
        const raw = localStorage.getItem('SpaceHub_analytics');
        return raw ? JSON.parse(raw) : { views: {}, plays: 0, clicks: 0 };
    }

    _save() {
        localStorage.setItem('SpaceHub_analytics', JSON.stringify(this._stats));
    }

    _initListeners() {
        this._eventBus.on('router:navigated', (path) => {
            this._stats.views[path] = (this._stats.views[path] || 0) + 1;
            this._save();
        });

        this._eventBus.on('player:played', () => {
            this._stats.plays++;
            this._save();
        });
    }

    getStats() {
        return this._stats;
    }
}

export default UsageAnalytics;
