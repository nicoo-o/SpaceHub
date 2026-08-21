/**
 * SpaceHub — Live Theme Studio (Theme Customizer & CSS Engine)
 * Version: 1.0.0
 *
 * Éditeur de thèmes interactif en temps réel.
 * Permet de modifier les palettes de couleurs, le flou glassmorphism,
 * les arrondis, les polices (dont OpenDyslexic), et d'exporter/importer des thèmes.
 */

'use strict';

import Logger from '../../core/Logger.js';

const STORAGE_KEY = 'SpaceHub_custom_theme_config';

const PRESETS = {
    'deep-space': {
        name: '🌌 Deep Space (Défaut)',
        primary: '#7c6aff',
        accent: '#5a46e0',
        bgSurface1: '#101014',
        bgSurface2: '#1a1a22',
        bgSurface3: '#242430',
        textPrimary: '#ffffff',
        textSecondary: '#a0a0b8',
        blur: 16,
        radius: 12,
        font: 'Inter, sans-serif'
    },
    'cyberpunk-neon': {
        name: '⚡ Cyberpunk Neon',
        primary: '#00ffcc',
        accent: '#ff007f',
        bgSurface1: '#0d0d15',
        bgSurface2: '#151525',
        bgSurface3: '#1f1f38',
        textPrimary: '#ffffff',
        textSecondary: '#00e5ff',
        blur: 20,
        radius: 6,
        font: 'Poppins, sans-serif'
    },
    'oled-black': {
        name: '🖤 OLED Pure Black',
        primary: '#e50914',
        accent: '#b81d24',
        bgSurface1: '#000000',
        bgSurface2: '#0d0d0d',
        bgSurface3: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#999999',
        blur: 0,
        radius: 8,
        font: 'Roboto, sans-serif'
    },
    'nord-frost': {
        name: '❄️ Nord Frost',
        primary: '#88c0d0',
        accent: '#81a1c1',
        bgSurface1: '#2e3440',
        bgSurface2: '#3b4252',
        bgSurface3: '#434c5e',
        textPrimary: '#eceff4',
        textSecondary: '#d8dee9',
        blur: 12,
        radius: 14,
        font: 'Inter, sans-serif'
    },
    'emerald-forest': {
        name: '🌲 Emerald Forest',
        primary: '#2ecc71',
        accent: '#27ae60',
        bgSurface1: '#0e1a14',
        bgSurface2: '#15261d',
        bgSurface3: '#1d3629',
        textPrimary: '#ffffff',
        textSecondary: '#a8d5ba',
        blur: 14,
        radius: 12,
        font: 'Inter, sans-serif'
    },
    'dyslexic-friendly': {
        name: '📖 Accessibilité Dyslexie',
        primary: '#3498db',
        accent: '#2980b9',
        bgSurface1: '#12161a',
        bgSurface2: '#1c2228',
        bgSurface3: '#262f38',
        textPrimary: '#ffffff',
        textSecondary: '#d1d8e0',
        blur: 8,
        radius: 12,
        font: 'OpenDyslexic, sans-serif'
    }
};

class LiveThemeStudio {
    constructor() {
        this._log = new Logger('LiveThemeStudio');
        this._currentConfig = this._loadSavedTheme() || { ...PRESETS['deep-space'] };
        this.applyConfig(this._currentConfig, false);
    }

    _loadSavedTheme() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    _saveTheme(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            this._log.info('Thème personnalisé sauvegardé.');
        } catch (err) {
            this._log.error('Erreur sauvegarde thème:', err);
        }
    }

    /**
     * Applique une configuration de thème en modifiant dynamiquement les variables CSS globales.
     * @param {Object} config
     * @param {boolean} [save=true]
     */
    applyConfig(config, save = true) {
        this._currentConfig = { ...this._currentConfig, ...config };
        const root = document.documentElement;

        if (config.primary) root.style.setProperty('--sh-color-primary', config.primary);
        if (config.accent) root.style.setProperty('--sh-color-primary-hover', config.accent);
        if (config.bgSurface1) root.style.setProperty('--sh-bg-surface-1', config.bgSurface1);
        if (config.bgSurface2) root.style.setProperty('--sh-bg-surface-2', config.bgSurface2);
        if (config.bgSurface3) root.style.setProperty('--sh-bg-surface-3', config.bgSurface3);
        if (config.textPrimary) root.style.setProperty('--sh-text-primary', config.textPrimary);
        if (config.textSecondary) root.style.setProperty('--sh-text-secondary', config.textSecondary);
        if (config.radius !== undefined) root.style.setProperty('--sh-radius-md', `${config.radius}px`);
        if (config.font) root.style.setProperty('--sh-font-family', config.font);

        if (save) {
            this._saveTheme(this._currentConfig);
            window.SpaceHub?.core?.eventBus?.emit('theme:customApplied', this._currentConfig);
        }
    }

    /**
     * Charge un préréglage prédéfini.
     * @param {string} presetId
     */
    loadPreset(presetId) {
        const preset = PRESETS[presetId];
        if (preset) {
            this.applyConfig(preset, true);
        }
    }

    /**
     * Exporte le thème actif dans un fichier téléchargeable (.spacehub-theme.json).
     */
    exportThemeFile() {
        const jsonStr = JSON.stringify(this._currentConfig, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `spacehub-theme-${(this._currentConfig.name || 'custom').toLowerCase().replace(/\s+/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Importe un thème depuis un fichier JSON.
     * @param {string} jsonText
     */
    importThemeFile(jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            this.applyConfig(parsed, true);
            window.SpaceHub?.ui?.components?.toaster?.success('Thème importé avec succès !');
            return true;
        } catch (err) {
            window.SpaceHub?.ui?.components?.toaster?.error(`Fichier de thème invalide : ${err.message}`);
            return false;
        }
    }

    /**
     * Rendu HTML du studio de personnalisation pour l'interface.
     * @param {HTMLElement} container
     */
    renderStudio(container) {
        const c = this._currentConfig;

        container.innerHTML = `
            <div class="sh-theme-studio">
                <div class="sh-theme-studio-header">
                    <div>
                        <h3>🎨 Live Theme Studio</h3>
                        <p style="color:var(--sh-text-secondary); font-size:13px; margin-top:2px;">
                            Personnalisez les couleurs, arrondis, flous et polices avec aperçu instantané.
                        </p>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-export-theme">💾 Exporter thème</button>
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-import-theme">📂 Importer</button>
                        <input type="file" id="theme-file-input" accept=".json" style="display:none;" />
                    </div>
                </div>

                <!-- Presets rapides -->
                <div style="margin-bottom:20px;">
                    <label style="font-size:12px; font-weight:700; color:var(--sh-text-secondary); text-transform:uppercase;">Préréglages d'Ambiance</label>
                    <div class="sh-theme-presets-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-top:8px;">
                        ${Object.entries(PRESETS).map(([id, p]) => `
                            <button class="sh-preset-card" data-preset="${id}" style="border:1px solid var(--sh-border-color); background:var(--sh-bg-surface-2); padding:10px; border-radius:8px; text-align:left; cursor:pointer;">
                                <div style="display:flex; gap:4px; margin-bottom:6px;">
                                    <div style="width:14px; height:14px; border-radius:50%; background:${p.primary};"></div>
                                    <div style="width:14px; height:14px; border-radius:50%; background:${p.bgSurface1}; border:1px solid rgba(255,255,255,0.2);"></div>
                                    <div style="width:14px; height:14px; border-radius:50%; background:${p.bgSurface2};"></div>
                                </div>
                                <strong style="font-size:12px; color:var(--sh-text-primary);">${p.name}</strong>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Sélecteurs personnalisés -->
                <div class="sh-theme-custom-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
                    <div class="sh-theme-control-box">
                        <label>Couleur Principale (Accent)</label>
                        <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
                            <input type="color" id="picker-primary" value="${c.primary || '#7c6aff'}" style="width:40px; height:40px; border:none; border-radius:6px; cursor:pointer; background:transparent;">
                            <input type="text" class="sh-input" id="text-primary" value="${c.primary || '#7c6aff'}" style="flex:1;">
                        </div>
                    </div>

                    <div class="sh-theme-control-box">
                        <label>Fond d'écran (Surface Principale)</label>
                        <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
                            <input type="color" id="picker-bg1" value="${c.bgSurface1 || '#101014'}" style="width:40px; height:40px; border:none; border-radius:6px; cursor:pointer; background:transparent;">
                            <input type="text" class="sh-input" id="text-bg1" value="${c.bgSurface1 || '#101014'}" style="flex:1;">
                        </div>
                    </div>

                    <div class="sh-theme-control-box">
                        <label>Cartes & Panneaux (Surface 2)</label>
                        <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
                            <input type="color" id="picker-bg2" value="${c.bgSurface2 || '#1a1a22'}" style="width:40px; height:40px; border:none; border-radius:6px; cursor:pointer; background:transparent;">
                            <input type="text" class="sh-input" id="text-bg2" value="${c.bgSurface2 || '#1a1a22'}" style="flex:1;">
                        </div>
                    </div>

                    <div class="sh-theme-control-box">
                        <label>Rayon des coins (Arrondis des cartes : <span id="radius-val">${c.radius || 12}px</span>)</label>
                        <input type="range" id="slider-radius" min="0" max="24" value="${c.radius || 12}" style="width:100%; margin-top:12px;">
                    </div>

                    <div class="sh-theme-control-box">
                        <label>Typographie & Police</label>
                        <select class="sh-select" id="select-font" style="width:100%; margin-top:6px;">
                            <option value="Inter, sans-serif" ${c.font?.includes('Inter') ? 'selected' : ''}>Inter (Équilibrée)</option>
                            <option value="Poppins, sans-serif" ${c.font?.includes('Poppins') ? 'selected' : ''}>Poppins (Moderne)</option>
                            <option value="Roboto, sans-serif" ${c.font?.includes('Roboto') ? 'selected' : ''}>Roboto (Classique)</option>
                            <option value="'JetBrains Mono', monospace" ${c.font?.includes('Mono') ? 'selected' : ''}>JetBrains Mono (Code / Geek)</option>
                            <option value="OpenDyslexic, sans-serif" ${c.font?.includes('OpenDyslexic') ? 'selected' : ''}>OpenDyslexic (Accessible)</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        this._bindStudioEvents(container);
    }

    _bindStudioEvents(container) {
        container.querySelectorAll('.sh-preset-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const presetId = btn.dataset.preset;
                this.loadPreset(presetId);
                this.renderStudio(container);
                window.SpaceHub?.ui?.components?.toaster?.success(`Préréglage appliqué !`);
            });
        });

        const pPicker = container.querySelector('#picker-primary');
        const pText = container.querySelector('#text-primary');
        pPicker?.addEventListener('input', (e) => {
            pText.value = e.target.value;
            this.applyConfig({ primary: e.target.value });
        });

        const bg1Picker = container.querySelector('#picker-bg1');
        const bg1Text = container.querySelector('#text-bg1');
        bg1Picker?.addEventListener('input', (e) => {
            bg1Text.value = e.target.value;
            this.applyConfig({ bgSurface1: e.target.value });
        });

        const bg2Picker = container.querySelector('#picker-bg2');
        const bg2Text = container.querySelector('#text-bg2');
        bg2Picker?.addEventListener('input', (e) => {
            bg2Text.value = e.target.value;
            this.applyConfig({ bgSurface2: e.target.value });
        });

        const sliderRadius = container.querySelector('#slider-radius');
        const radiusVal = container.querySelector('#radius-val');
        sliderRadius?.addEventListener('input', (e) => {
            radiusVal.textContent = `${e.target.value}px`;
            this.applyConfig({ radius: parseInt(e.target.value) });
        });

        const selectFont = container.querySelector('#select-font');
        selectFont?.addEventListener('change', (e) => {
            this.applyConfig({ font: e.target.value });
        });

        container.querySelector('#btn-export-theme')?.addEventListener('click', () => {
            this.exportThemeFile();
            window.SpaceHub?.ui?.components?.toaster?.success('Fichier thème exporté !');
        });

        const fileInput = container.querySelector('#theme-file-input');
        container.querySelector('#btn-import-theme')?.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    this.importThemeFile(evt.target.result);
                    this.renderStudio(container);
                };
                reader.readAsText(file);
            }
        });
    }
}

export default LiveThemeStudio;
