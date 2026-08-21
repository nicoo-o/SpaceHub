/**
 * SpaceHub — Accessibility & Inclusion Engine (SpaceHub For All)
 * Version: 1.0.0
 *
 * Moteur d'accessibilité universelle :
 * - Filtres pour le daltonisme (Protanopie, Deutéranopie, Tritanopie, Achromatopsie)
 * - Typographie adaptée (OpenDyslexic, interlignage, espacement des lettres)
 * - Mode contraste élevé (High Contrast)
 * - Réduction des animations (Reduced Motion)
 * - Personnalisation avancée des sous-titres vidéo (taille, couleur, fond, contour)
 */

'use strict';

import Logger from '../Logger.js';

class AccessibilityManager {
    constructor() {
        this._log = new Logger('AccessibilityManager');
        this._settings = {
            colorFilter: 'none', // 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia' | 'high-contrast'
            dyslexicFont: false,
            largeText: false,
            reducedMotion: false,
            subtitles: {
                size: '20px',
                color: '#ffffff',
                bgOpacity: 0.75,
                bgColor: '#000000',
                shadow: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.9))'
            }
        };

        this._loadSettings();
        this._injectSvgFilters();
        this._apply();
    }

    _loadSettings() {
        try {
            const saved = localStorage.getItem('spacehub_accessibility');
            if (saved) {
                this._settings = { ...this._settings, ...JSON.parse(saved) };
            }
        } catch {
            // ignore
        }
    }

    _saveSettings() {
        try {
            localStorage.setItem('spacehub_accessibility', JSON.stringify(this._settings));
        } catch {
            // ignore
        }
    }

    setColorFilter(filter) {
        this._settings.colorFilter = filter;
        this._saveSettings();
        this._apply();
    }

    setDyslexicFont(enabled) {
        this._settings.dyslexicFont = !!enabled;
        this._saveSettings();
        this._apply();
    }

    setLargeText(enabled) {
        this._settings.largeText = !!enabled;
        this._saveSettings();
        this._apply();
    }

    setReducedMotion(enabled) {
        this._settings.reducedMotion = !!enabled;
        this._saveSettings();
        this._apply();
    }

    setSubtitleStyle(styles) {
        this._settings.subtitles = { ...this._settings.subtitles, ...styles };
        this._saveSettings();
        this._applySubtitles();
    }

    getSettings() {
        return { ...this._settings };
    }

    _apply() {
        const root = document.documentElement;

        // 1. Filtres Daltonisme
        root.classList.remove(
            'sh-filter-protanopia',
            'sh-filter-deuteranopia',
            'sh-filter-tritanopia',
            'sh-filter-achromatopsia',
            'sh-filter-high-contrast'
        );
        if (this._settings.colorFilter && this._settings.colorFilter !== 'none') {
            root.classList.add(`sh-filter-${this._settings.colorFilter}`);
        }

        // 2. Police Dyslexie
        root.classList.toggle('sh-dyslexic-mode', this._settings.dyslexicFont);

        // 3. Texte Agrandie
        root.classList.toggle('sh-large-text-mode', this._settings.largeText);

        // 4. Mouvements Réduits
        root.classList.toggle('sh-reduced-motion-mode', this._settings.reducedMotion);

        this._applySubtitles();
    }

    _applySubtitles() {
        let styleEl = document.getElementById('sh-subtitles-custom-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'sh-subtitles-custom-style';
            document.head.appendChild(styleEl);
        }

        const sub = this._settings.subtitles;
        styleEl.textContent = `
            ::cue {
                font-size: ${sub.size} !important;
                color: ${sub.color} !important;
                background-color: rgba(0, 0, 0, ${sub.bgOpacity}) !important;
                text-shadow: ${sub.shadow} !important;
                font-family: ${this._settings.dyslexicFont ? 'OpenDyslexic, sans-serif' : 'inherit'} !important;
            }
        `;
    }

    _injectSvgFilters() {
        if (document.getElementById('sh-accessibility-svg-filters')) return;

        const svg = document.createElement('div');
        svg.id = 'sh-accessibility-svg-filters';
        svg.style.display = 'none';
        svg.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg">
                <filter id="protanopia">
                    <feColorMatrix type="matrix" values="0.567, 0.433, 0,     0, 0
                                                         0.558, 0.442, 0,     0, 0
                                                         0,     0.242, 0.758, 0, 0
                                                         0,     0,     0,     1, 0"/>
                </filter>
                <filter id="deuteranopia">
                    <feColorMatrix type="matrix" values="0.625, 0.375, 0,   0, 0
                                                         0.7,   0.3,   0,   0, 0
                                                         0,     0.3,   0.7, 0, 0
                                                         0,     0,     0,   1, 0"/>
                </filter>
                <filter id="tritanopia">
                    <feColorMatrix type="matrix" values="0.95, 0.05,  0,     0, 0
                                                         0,    0.433, 0.567, 0, 0
                                                         0,    0.475, 0.525, 0, 0
                                                         0,    0,     0,     1, 0"/>
                </filter>
                <filter id="achromatopsia">
                    <feColorMatrix type="matrix" values="0.299, 0.587, 0.114, 0, 0
                                                         0.299, 0.587, 0.114, 0, 0
                                                         0.299, 0.587, 0.114, 0, 0
                                                         0,     0,     0,     1, 0"/>
                </filter>
            </svg>
        `;
        document.body.appendChild(svg);

        // Injecter CSS de base
        const style = document.createElement('style');
        style.id = 'sh-accessibility-base-css';
        style.textContent = `
            .sh-filter-protanopia { filter: url(#protanopia); }
            .sh-filter-deuteranopia { filter: url(#deuteranopia); }
            .sh-filter-tritanopia { filter: url(#tritanopia); }
            .sh-filter-achromatopsia { filter: url(#achromatopsia); }
            .sh-filter-high-contrast {
                filter: contrast(150%) brightness(110%);
            }
            .sh-filter-high-contrast * {
                border-color: #ffd700 !important;
            }

            .sh-dyslexic-mode, .sh-dyslexic-mode * {
                font-family: 'OpenDyslexic', 'Comic Sans MS', sans-serif !important;
                letter-spacing: 0.05em !important;
                line-height: 1.6 !important;
            }

            .sh-large-text-mode {
                font-size: 115% !important;
            }

            .sh-reduced-motion-mode *, .sh-reduced-motion-mode *::before, .sh-reduced-motion-mode *::after {
                animation-duration: 0.001ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.001ms !important;
            }
        `;
        document.head.appendChild(style);
    }
}

export default AccessibilityManager;
