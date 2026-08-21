/**
 * SpaceHub — Ambilight Software Engine
 * Version: 1.0.0
 *
 * Moteur d'éclairage ambiant (style Philips Ambilight) 100% logiciel.
 * Capture les couleurs dominantes des bords du cadre vidéo en temps réel
 * via Canvas API et les envoie aux lampes connectées (Home Assistant / Yeelight / Govee API).
 *
 * Algorithme :
 * 1. Capture d'une frame du lecteur vidéo sur un canvas 32x18 (rapide)
 * 2. Extraction des zones : bord gauche, droit, haut, bas
 * 3. Calcul de la couleur dominante par zone (médiane des pixels)
 * 4. Envoi RGB vers Home Assistant ou API locale
 */

'use strict';

import Logger from '../../core/Logger.js';

class AmbilightEngine {
    constructor() {
        this._log = new Logger('AmbilightEngine');
        this._isRunning = false;
        this._animFrame = null;
        this._canvas = document.createElement('canvas');
        this._canvas.width = 32;
        this._canvas.height = 18;
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
        this._fps = 12;
        this._lastCapture = 0;
        this._currentColors = { left: null, right: null, top: null, bottom: null };
        this._haService = null;
        this._lightEntities = { left: null, right: null, top: null, bottom: null };
    }

    /**
     * Attache le service Home Assistant pour le contrôle des lumières.
     * @param {HomeAssistantService} haService
     */
    attachHomeAssistant(haService) {
        this._haService = haService;
    }

    /**
     * Configure les entités lumières par zone.
     * @param {{ left?: string, right?: string, top?: string, bottom?: string }} entities
     */
    configureLights(entities) {
        this._lightEntities = { ...this._lightEntities, ...entities };
    }

    /**
     * Démarre le moteur Ambilight.
     * @param {HTMLVideoElement} videoEl
     */
    start(videoEl) {
        if (this._isRunning || !videoEl) return;

        this._videoEl = videoEl;
        this._isRunning = true;
        this._log.info('Moteur Ambilight démarré.');
        this._loop();

        window.SpaceHub?.core?.eventBus?.emit('ambilight:started');
    }

    /**
     * Arrête le moteur Ambilight et éteint les lumières.
     */
    stop() {
        this._isRunning = false;
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }

        // Éteindre les lumières Ambilight
        Object.values(this._lightEntities).forEach(entityId => {
            if (entityId && this._haService) {
                this._haService.turnOff(entityId);
            }
        });

        this._log.info('Moteur Ambilight arrêté.');
        window.SpaceHub?.core?.eventBus?.emit('ambilight:stopped');
    }

    _loop() {
        if (!this._isRunning) return;

        const now = performance.now();
        if (now - this._lastCapture > 1000 / this._fps) {
            this._lastCapture = now;
            this._capture();
        }

        this._animFrame = requestAnimationFrame(() => this._loop());
    }

    _capture() {
        const v = this._videoEl;
        if (!v || v.paused || v.readyState < 2) return;

        try {
            this._ctx.drawImage(v, 0, 0, 32, 18);
            const pixels = this._ctx.getImageData(0, 0, 32, 18).data;

            const zones = {
                left:   this._extractZone(pixels, 32, 18, 'left', 4),
                right:  this._extractZone(pixels, 32, 18, 'right', 4),
                top:    this._extractZone(pixels, 32, 18, 'top', 3),
                bottom: this._extractZone(pixels, 32, 18, 'bottom', 3),
            };

            // Appliquer les couleurs si elles ont changé significativement
            for (const [zone, rgb] of Object.entries(zones)) {
                if (this._hasColorChanged(this._currentColors[zone], rgb, 15)) {
                    this._currentColors[zone] = rgb;
                    this._applyColor(zone, rgb);
                }
            }

            window.SpaceHub?.core?.eventBus?.emit('ambilight:colors', this._currentColors);
        } catch {
            // SecurityError peut arriver si la vidéo est cross-origin
        }
    }

    /**
     * Extrait la couleur dominante d'une zone du canvas.
     * @param {Uint8ClampedArray} pixels
     * @param {number} w - Largeur canvas
     * @param {number} h - Hauteur canvas
     * @param {'left'|'right'|'top'|'bottom'} zone
     * @param {number} depth - Nombre de pixels de bordure à analyser
     */
    _extractZone(pixels, w, h, zone, depth) {
        const samples = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let inZone = false;
                if (zone === 'left'   && x < depth) inZone = true;
                if (zone === 'right'  && x >= w - depth) inZone = true;
                if (zone === 'top'    && y < depth) inZone = true;
                if (zone === 'bottom' && y >= h - depth) inZone = true;

                if (inZone) {
                    const i = (y * w + x) * 4;
                    samples.push([pixels[i], pixels[i+1], pixels[i+2]]);
                }
            }
        }

        if (samples.length === 0) return [255, 255, 255];

        const r = Math.round(samples.reduce((a, c) => a + c[0], 0) / samples.length);
        const g = Math.round(samples.reduce((a, c) => a + c[1], 0) / samples.length);
        const b = Math.round(samples.reduce((a, c) => a + c[2], 0) / samples.length);

        return [r, g, b];
    }

    _hasColorChanged(prev, next, threshold) {
        if (!prev) return true;
        return Math.abs(prev[0] - next[0]) > threshold ||
               Math.abs(prev[1] - next[1]) > threshold ||
               Math.abs(prev[2] - next[2]) > threshold;
    }

    async _applyColor(zone, rgb) {
        const entityId = this._lightEntities[zone];
        if (!entityId || !this._haService) return;

        await this._haService.turnOn(entityId, {
            rgb_color: rgb,
            brightness: 200,
            transition: 0.3
        });
    }

    /**
     * Génère une prévisualisation CSS de l'Ambilight sur un élément DOM.
     * @param {HTMLElement} wrapperEl - Conteneur du lecteur vidéo
     */
    attachVisualPreview(wrapperEl) {
        if (!wrapperEl) return;

        // Injecter le rendu CSS des zones colorées
        const updateGlow = (colors) => {
            if (!colors.left && !colors.right) return;
            const l = colors.left ? `rgb(${colors.left.join(',')})` : 'transparent';
            const r = colors.right ? `rgb(${colors.right.join(',')})` : 'transparent';
            const t = colors.top ? `rgb(${colors.top.join(',')})` : 'transparent';
            const b = colors.bottom ? `rgb(${colors.bottom.join(',')})` : 'transparent';

            wrapperEl.style.boxShadow = [
                `-60px 0 80px -20px ${l}`,
                `60px 0 80px -20px ${r}`,
                `0 -40px 60px -20px ${t}`,
                `0 40px 60px -20px ${b}`,
            ].join(', ');
        };

        window.SpaceHub?.core?.eventBus?.on('ambilight:colors', updateGlow);
    }

    /**
     * Retourne les couleurs actuelles.
     */
    getColors() {
        return { ...this._currentColors };
    }
}

export default AmbilightEngine;
