/**
 * SpaceHub — Direct Play & Stream Optimizer
 * Version: 1.0.0
 *
 * Optimiseur de lecture directe et de codecs.
 * Détecte les capacités matérielles et logicielles de l'appareil
 * pour forcer le Direct Play/Stream et éliminer le transcodage CPU/GPU inutile.
 */

'use strict';

import Logger from '../../core/Logger.js';

class DirectPlayOptimizer {
    constructor() {
        this._log = new Logger('DirectPlayOptimizer');
        this._capabilities = this._detectCapabilities();
        this._audioCtx = null;
        this._compressor = null;
        this._log.info('Capacités de lecture directe détectées:', this._capabilities);
    }

    _detectCapabilities() {
        const video = document.createElement('video');

        const canPlay = (type) => {
            const res = video.canPlayType(type);
            return res === 'probably' || res === 'maybe';
        };

        return {
            h264: canPlay('video/mp4; codecs="avc1.640028"'),
            hevc: canPlay('video/mp4; codecs="hev1.1.6.L93.B0"') || canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"'),
            vp9: canPlay('video/webm; codecs="vp9"'),
            av1: canPlay('video/mp4; codecs="av01.0.08M.08"'),
            aac: canPlay('audio/mp4; codecs="mp4a.40.2"'),
            opus: canPlay('audio/ogg; codecs="opus"'),
            flac: canPlay('audio/flac'),
            ac3: canPlay('audio/mp4; codecs="ac-3"'),
            eac3: canPlay('audio/mp4; codecs="ec-3"')
        };
    }

    /**
     * Génère les paramètres d'URL de flux optimaux pour un média Jellyfin.
     * @param {Object} item - Média Jellyfin
     * @param {number} startPositionSeconds
     * @returns {string} URL complète du flux vidéo
     */
    getOptimizedStreamParams(item, startPositionSeconds = 0) {
        const videoCodecs = [];
        if (this._capabilities.h264) videoCodecs.push('h264');
        if (this._capabilities.hevc) videoCodecs.push('hevc');
        if (this._capabilities.vp9) videoCodecs.push('vp9');
        if (this._capabilities.av1) videoCodecs.push('av1');

        const audioCodecs = [];
        if (this._capabilities.aac) audioCodecs.push('aac');
        if (this._capabilities.mp3 !== false) audioCodecs.push('mp3');
        if (this._capabilities.opus) audioCodecs.push('opus');
        if (this._capabilities.flac) audioCodecs.push('flac');
        if (this._capabilities.eac3) audioCodecs.push('eac3');
        if (this._capabilities.ac3) audioCodecs.push('ac3');

        return new URLSearchParams({
            DeviceId: 'spacehub-web',
            MediaSourceId: item.Id,
            VideoCodec: videoCodecs.join(','),
            AudioCodec: audioCodecs.join(','),
            AudioBitrate: '384000',
            MaxStreamingBitrate: '140000000', // 140 Mbps pour 4K Direct Play
            TranscodingMaxAudioChannels: '6',
            RequireAvc: 'false',
            EnableDirectPlay: 'true',
            EnableDirectStream: 'true',
            StartTimeTicks: Math.round(startPositionSeconds * 10000000).toString()
        }).toString();
    }

    /**
     * Active la normalisation audio (Mode Nuit / Dialogue Boost) via Web Audio API.
     * @param {HTMLVideoElement} videoElement
     * @param {boolean} enabled
     */
    setAudioNormalization(videoElement, enabled = true) {
        if (!videoElement) return;

        try {
            if (!this._audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this._audioCtx = new AudioContext();
                const source = this._audioCtx.createMediaElementSource(videoElement);

                // Compresseur de dynamique pour atténuer les bruits forts et booster les dialogues
                this._compressor = this._audioCtx.createDynamicsCompressor();
                this._compressor.threshold.setValueAtTime(-24, this._audioCtx.currentTime);
                this._compressor.knee.setValueAtTime(30, this._audioCtx.currentTime);
                this._compressor.ratio.setValueAtTime(12, this._audioCtx.currentTime);
                this._compressor.attack.setValueAtTime(0.003, this._audioCtx.currentTime);
                this._compressor.release.setValueAtTime(0.25, this._audioCtx.currentTime);

                source.connect(this._compressor);
                this._compressor.connect(this._audioCtx.destination);
                this._log.info('Normalisation audio activée (Web Audio Compressor).');
            }
        } catch (err) {
            this._log.warn('Normalisation audio non disponible:', err.message);
        }
    }
}

export default DirectPlayOptimizer;
