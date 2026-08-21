/**
 * SpaceHub — Network Quality Guardian & Adaptive Bitrate Scaler
 * Version: 1.0.0
 *
 * Surveille en direct la qualité de la connexion réseau (Network Information API) :
 * - Débit descendant (downlink en Mbps), latence RTT et mode Économie de données
 * - Ajuste dynamiquement la résolution des affiches (WebP basse vs haute résolution)
 * - Préconise le transcodage ou le Direct Play pour éviter toute mise en mémoire tampon (buffering)
 */

'use strict';

import Logger from '../Logger.js';

class NetworkQualityGuardian {
    constructor() {
        this._log = new Logger('NetworkQualityGuardian');
        this._connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        this._quality = 'high'; // 'low' | 'medium' | 'high'

        this._init();
    }

    _init() {
        if (this._connection) {
            this._updateQuality();
            this._connection.addEventListener('change', () => this._updateQuality());
        }
    }

    _updateQuality() {
        if (!this._connection) return;

        const downlink = this._connection.downlink || 10;
        const rtt = this._connection.rtt || 50;
        const saveData = this._connection.saveData || false;

        let newQuality = 'high';

        if (saveData || downlink < 2 || rtt > 300) {
            newQuality = 'low';
        } else if (downlink < 10 || rtt > 150) {
            newQuality = 'medium';
        } else {
            newQuality = 'high';
        }

        if (newQuality !== this._quality) {
            this._quality = newQuality;
            this._log.info(`Qualité réseau ajustée à "${newQuality}" (Débit: ${downlink} Mbps, RTT: ${rtt}ms).`);
            window.SpaceHub?.core?.eventBus?.emit('network:quality_changed', {
                quality: this._quality,
                downlink,
                rtt,
                saveData
            });
        }
    }

    getRecommendedImageWidth() {
        if (this._quality === 'low') return 180;
        if (this._quality === 'medium') return 300;
        return 600;
    }

    getQuality() {
        return this._quality;
    }
}

export default NetworkQualityGuardian;
