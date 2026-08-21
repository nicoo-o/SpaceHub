/**
 * SpaceHub — Accessibility & Universal Inclusion View (Horizon 15)
 * Version: 1.0.0
 *
 * Centre de contrôle d'accessibilité :
 * - Simulation et filtres de daltonisme (Protanopie, Deutéranopie, Tritanopie, Achromatopsie)
 * - Typographie et confort de lecture (OpenDyslexic, agrandissement)
 * - Réduction des animations (Reduced Motion)
 * - Studio de personnalisation des sous-titres avec prévisualisation en direct
 */

'use strict';

import Logger from '../../../core/Logger.js';

class AccessibilityView {
    constructor() {
        this._log = new Logger('AccessibilityView');
        this._container = null;
    }

    get _mgr() {
        return window.SpaceHub?.accessibility;
    }

    async render(container) {
        this._container = container;
        const current = this._mgr?.getSettings() || {};

        container.innerHTML = `
            <div class="sh-access-page">
                <div class="sh-access-header">
                    <div>
                        <h2>♿ Accessibilité & Inclusion Universelle</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Adaptez SpaceHub à votre vision, vos besoins de lecture et vos préférences de sous-titrage.
                        </p>
                    </div>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-reset-access">🔄 Réinitialiser les réglages</button>
                </div>

                <div class="sh-access-grid">
                    <!-- Section 1 : Filtres de Daltonisme -->
                    <section class="sh-access-card">
                        <h3>👁️ Filtres de Vision & Daltonisme</h3>
                        <p style="font-size:13px; color:var(--sh-text-secondary); margin:4px 0 16px 0;">
                            Ajuste les matrices de couleurs globales de l'application en temps réel.
                        </p>

                        <div class="sh-color-filter-grid">
                            ${[
                                { id: 'none', label: 'Vision Standard', desc: 'Couleurs d\'origine', icon: '🌈' },
                                { id: 'protanopia', label: 'Protanopie', desc: 'Déficience du Rouge', icon: '🔴' },
                                { id: 'deuteranopia', label: 'Deutéranopie', desc: 'Déficience du Vert', icon: '🟢' },
                                { id: 'tritanopia', label: 'Tritanopie', desc: 'Déficience du Bleu', icon: '🔵' },
                                { id: 'achromatopsia', label: 'Achromatopsie', desc: 'Nuances de gris', icon: '⚫' },
                                { id: 'high-contrast', label: 'Contraste Élevé', desc: 'Lisibilité maximale', icon: '⚡' },
                            ].map(f => `
                                <div class="sh-filter-choice ${current.colorFilter === f.id ? 'active' : ''}" data-filter="${f.id}">
                                    <div style="font-size:24px; margin-bottom:4px;">${f.icon}</div>
                                    <strong>${f.label}</strong>
                                    <small style="color:var(--sh-text-muted); display:block; margin-top:2px;">${f.desc}</small>
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <!-- Section 2 : Confort de Lecture & Mouvement -->
                    <section class="sh-access-card">
                        <h3>📖 Confort de Lecture & Mouvement</h3>
                        <p style="font-size:13px; color:var(--sh-text-secondary); margin:4px 0 16px 0;">
                            Options typographiques et réduction de la fatigue visuelle.
                        </p>

                        <div style="display:flex; flex-direction:column; gap:16px;">
                            <div class="sh-toggle-row">
                                <div>
                                    <strong>Police OpenDyslexic</strong>
                                    <div style="font-size:12px; color:var(--sh-text-muted);">Police de caractères adaptée aux personnes dyslexiques avec gravité inférieure renforcée.</div>
                                </div>
                                <input type="checkbox" id="chk-dyslexic" ${current.dyslexicFont ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;" />
                            </div>

                            <div class="sh-toggle-row">
                                <div>
                                    <strong>Texte Agrandie (+15%)</strong>
                                    <div style="font-size:12px; color:var(--sh-text-muted);">Augmente la taille générale des titres, paragraphes et boutons.</div>
                                </div>
                                <input type="checkbox" id="chk-large-text" ${current.largeText ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;" />
                            </div>

                            <div class="sh-toggle-row">
                                <div>
                                    <strong>Mouvements Réduits (Reduced Motion)</strong>
                                    <div style="font-size:12px; color:var(--sh-text-muted);">Désactive les animations, transitions et effets de zoom pour éviter les vertiges.</div>
                                </div>
                                <input type="checkbox" id="chk-reduced-motion" ${current.reducedMotion ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;" />
                            </div>
                        </div>
                    </section>

                    <!-- Section 3 : Studio de Personnalisation des Sous-titres -->
                    <section class="sh-access-card" style="grid-column: 1 / -1;">
                        <h3>💬 Personnalisation Avancée des Sous-titres Vidéo</h3>
                        <p style="font-size:13px; color:var(--sh-text-secondary); margin:4px 0 16px 0;">
                            Configurez la lisibilité des sous-titres dans le lecteur vidéo avec prévisualisation en temps réel.
                        </p>

                        <div class="sh-subtitles-studio">
                            <!-- Prévisualisation vidéo -->
                            <div class="sh-sub-preview-box">
                                <div class="sh-sub-preview-bg">
                                    <div class="sh-sub-preview-text" id="sub-preview-text">
                                        "L'espace est infini, tout comme l'aventure."
                                    </div>
                                </div>
                            </div>

                            <!-- Contrôles -->
                            <div class="sh-sub-controls">
                                <div>
                                    <label style="font-size:12px; font-weight:700; color:var(--sh-text-secondary);">Taille de Police</label>
                                    <select class="sh-select" id="sub-size-select" style="margin-top:6px;">
                                        <option value="16px" ${current.subtitles?.size === '16px' ? 'selected' : ''}>Petite (16px)</option>
                                        <option value="20px" ${current.subtitles?.size === '20px' || !current.subtitles?.size ? 'selected' : ''}>Normale (20px)</option>
                                        <option value="26px" ${current.subtitles?.size === '26px' ? 'selected' : ''}>Grande (26px)</option>
                                        <option value="34px" ${current.subtitles?.size === '34px' ? 'selected' : ''}>Très Grande (34px)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style="font-size:12px; font-weight:700; color:var(--sh-text-secondary);">Couleur du Texte</label>
                                    <select class="sh-select" id="sub-color-select" style="margin-top:6px;">
                                        <option value="#ffffff" ${current.subtitles?.color === '#ffffff' ? 'selected' : ''}>⚪ Blanc Pur</option>
                                        <option value="#ffd700" ${current.subtitles?.color === '#ffd700' ? 'selected' : ''}>🟡 Jaune Cinéma</option>
                                        <option value="#00ffff" ${current.subtitles?.color === '#00ffff' ? 'selected' : ''}>🔵 Cyan</option>
                                        <option value="#2ecc71" ${current.subtitles?.color === '#2ecc71' ? 'selected' : ''}>🟢 Vert Menthe</option>
                                    </select>
                                </div>

                                <div>
                                    <label style="font-size:12px; font-weight:700; color:var(--sh-text-secondary);">Opacité de l'Arrière-Plan</label>
                                    <select class="sh-select" id="sub-bg-select" style="margin-top:6px;">
                                        <option value="0" ${current.subtitles?.bgOpacity === 0 ? 'selected' : ''}>Translucide (0%)</option>
                                        <option value="0.5" ${current.subtitles?.bgOpacity === 0.5 ? 'selected' : ''}>Semi-transparent (50%)</option>
                                        <option value="0.75" ${current.subtitles?.bgOpacity === 0.75 || !current.subtitles?.bgOpacity ? 'selected' : ''}>Standard (75%)</option>
                                        <option value="1" ${current.subtitles?.bgOpacity === 1 ? 'selected' : ''}>Opaque (100%)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindEvents();
        this._updateSubPreview();
    }

    _bindEvents() {
        // Filtres daltonisme
        this._container.querySelectorAll('.sh-filter-choice').forEach(card => {
            card.addEventListener('click', () => {
                this._container.querySelectorAll('.sh-filter-choice').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const filter = card.dataset.filter;
                this._mgr?.setColorFilter(filter);
                window.SpaceHub?.ui?.components?.toaster?.info(`Filtre "${card.querySelector('strong').textContent}" appliqué.`);
            });
        });

        // Toggles lecture
        this._container.querySelector('#chk-dyslexic')?.addEventListener('change', (e) => {
            this._mgr?.setDyslexicFont(e.target.checked);
            this._updateSubPreview();
        });

        this._container.querySelector('#chk-large-text')?.addEventListener('change', (e) => {
            this._mgr?.setLargeText(e.target.checked);
        });

        this._container.querySelector('#chk-reduced-motion')?.addEventListener('change', (e) => {
            this._mgr?.setReducedMotion(e.target.checked);
        });

        // Sous-titres
        const updateSubs = () => {
            const size = this._container.querySelector('#sub-size-select').value;
            const color = this._container.querySelector('#sub-color-select').value;
            const bgOpacity = parseFloat(this._container.querySelector('#sub-bg-select').value);

            this._mgr?.setSubtitleStyle({ size, color, bgOpacity });
            this._updateSubPreview();
        };

        this._container.querySelector('#sub-size-select')?.addEventListener('change', updateSubs);
        this._container.querySelector('#sub-color-select')?.addEventListener('change', updateSubs);
        this._container.querySelector('#sub-bg-select')?.addEventListener('change', updateSubs);

        // Reset
        this._container.querySelector('#btn-reset-access')?.addEventListener('click', () => {
            this._mgr?.setColorFilter('none');
            this._mgr?.setDyslexicFont(false);
            this._mgr?.setLargeText(false);
            this._mgr?.setReducedMotion(false);
            this._mgr?.setSubtitleStyle({ size: '20px', color: '#ffffff', bgOpacity: 0.75 });
            this.render(this._container);
            window.SpaceHub?.ui?.components?.toaster?.info('Réglages d\'accessibilité réinitialisés.');
        });
    }

    _updateSubPreview() {
        const previewText = this._container?.querySelector('#sub-preview-text');
        if (!previewText) return;

        const sub = this._mgr?.getSettings()?.subtitles || {};
        const isDys = this._mgr?.getSettings()?.dyslexicFont;

        previewText.style.fontSize = sub.size || '20px';
        previewText.style.color = sub.color || '#ffffff';
        previewText.style.backgroundColor = `rgba(0, 0, 0, ${sub.bgOpacity ?? 0.75})`;
        previewText.style.fontFamily = isDys ? 'OpenDyslexic, sans-serif' : 'inherit';
    }

    _injectStyles() {
        if (document.getElementById('sh-access-view-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-access-view-styles';
        style.textContent = `
.sh-access-page { max-width: 1400px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-access-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }
.sh-access-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; }
.sh-access-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 16px; padding: 24px; }

.sh-color-filter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.sh-filter-choice { background: var(--sh-bg-surface-3); border: 1px solid var(--sh-border-color); border-radius: 12px; padding: 14px; text-align: center; cursor: pointer; transition: all 0.2s ease; }
.sh-filter-choice:hover { border-color: var(--sh-color-primary); transform: translateY(-2px); }
.sh-filter-choice.active { border-color: var(--sh-color-primary, #7c6aff); background: rgba(124, 106, 255, 0.15); box-shadow: 0 0 16px rgba(124, 106, 255, 0.3); }

.sh-toggle-row { display: flex; justify-content: space-between; align-items: center; background: var(--sh-bg-surface-3); padding: 14px 18px; border-radius: 12px; border: 1px solid var(--sh-border-color); }

/* Subtitles studio */
.sh-subtitles-studio { display: flex; gap: 24px; flex-wrap: wrap; }
.sh-sub-preview-box { flex: 1; min-width: 320px; height: 200px; background: linear-gradient(135deg, #1e130c, #9a8478); border-radius: 12px; overflow: hidden; position: relative; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 24px; border: 1px solid var(--sh-border-color); }
.sh-sub-preview-bg { position: relative; z-index: 2; }
.sh-sub-preview-text { padding: 6px 16px; border-radius: 6px; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
.sh-sub-controls { width: 280px; display: flex; flex-direction: column; gap: 14px; }
        `;
        document.head.appendChild(style);
    }
}

export default AccessibilityView;
