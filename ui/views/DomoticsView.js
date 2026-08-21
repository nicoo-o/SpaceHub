/**
 * SpaceHub — Domotics, Home Assistant & Ambilight View
 * Version: 1.0.0
 *
 * Tableau de bord domotique complet pour SpaceHub :
 * - Contrôle direct des lumières, scènes et prises Home Assistant
 * - Configuration et déclenchement du Mode Cinéma automatique
 * - Studio d'éclairage immersif Ambilight logiciel
 */

'use strict';

import Logger from '../../core/Logger.js';

class DomoticsView {
    constructor() {
        this._log = new Logger('DomoticsView');
        this._container = null;
        this._currentTab = 'scenes';
    }

    get _ha() {
        return window.SpaceHub?.domotics?.ha;
    }

    get _ambilight() {
        return window.SpaceHub?.domotics?.ambilight;
    }

    get _cinema() {
        return window.SpaceHub?.domotics?.cinema;
    }

    async render(container) {
        this._container = container;

        const isConfigured = this._ha?.isConfigured;

        container.innerHTML = `
            <div class="sh-domotics-page">
                <div class="sh-domotics-header">
                    <div>
                        <h2>💡 Domotique Cinéma & Ambilight</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Contrôle de vos lumières connectées, scènes Home Assistant et éclairage immersif.
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span class="sh-badge ${isConfigured ? 'sh-badge--success' : 'sh-badge--warning'}">
                            ${isConfigured ? '● Home Assistant Connecté' : '○ Home Assistant Non configuré'}
                        </span>
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-domotics-refresh">🔄 Actualiser</button>
                    </div>
                </div>

                <div class="sh-domotics-tabs">
                    <button class="sh-dom-tab ${this._currentTab === 'scenes' ? 'active' : ''}" data-tab="scenes">
                        🎬 Scènes & Mode Cinéma
                    </button>
                    <button class="sh-dom-tab ${this._currentTab === 'lights' ? 'active' : ''}" data-tab="lights">
                        💡 Lumières & Éclairage
                    </button>
                    <button class="sh-dom-tab ${this._currentTab === 'ambilight' ? 'active' : ''}" data-tab="ambilight">
                        🌈 Ambilight Logiciel
                    </button>
                    <button class="sh-dom-tab ${this._currentTab === 'settings' ? 'active' : ''}" data-tab="settings">
                        ⚙️ Connexion & Réglages
                    </button>
                </div>

                <div class="sh-domotics-content" id="sh-domotics-tab-content"></div>
            </div>
        `;

        this._injectStyles();
        this._bindEvents();
        await this._renderCurrentTab();
    }

    _bindEvents() {
        const tabs = this._container.querySelectorAll('.sh-dom-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._renderCurrentTab();
            });
        });

        this._container.querySelector('#btn-domotics-refresh')?.addEventListener('click', () => {
            this._renderCurrentTab();
        });
    }

    async _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-domotics-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'scenes') {
            await this._renderScenesTab(contentEl);
        } else if (this._currentTab === 'lights') {
            await this._renderLightsTab(contentEl);
        } else if (this._currentTab === 'ambilight') {
            await this._renderAmbilightTab(contentEl);
        } else if (this._currentTab === 'settings') {
            await this._renderSettingsTab(contentEl);
        }
    }

    async _renderScenesTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-scenes-container">
                <section style="margin-bottom:28px;">
                    <h3>⚡ Déclencheurs Rapides</h3>
                    <div class="sh-quick-scenes-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px; margin-top:12px;">
                        <div class="sh-scene-card" data-action="cinema" style="border-left:4px solid #7c6aff;">
                            <div style="font-size:28px; margin-bottom:8px;">🎬</div>
                            <strong>Mode Cinéma</strong>
                            <p style="font-size:12px; color:var(--sh-text-muted); margin:4px 0 12px 0;">Tamise les lumières à 10% et ferme les stores.</p>
                            <button class="sh-btn sh-btn--primary sh-btn--sm btn-trigger-scene" data-scene="scene.cinema" style="width:100%;">Activer</button>
                        </div>

                        <div class="sh-scene-card" data-action="entracte" style="border-left:4px solid #f39c12;">
                            <div style="font-size:28px; margin-bottom:8px;">🍿</div>
                            <strong>Mode Entracte</strong>
                            <p style="font-size:12px; color:var(--sh-text-muted); margin:4px 0 12px 0;">Éclairage doux à 40% pour faire une pause.</p>
                            <button class="sh-btn sh-btn--primary sh-btn--sm btn-trigger-scene" data-scene="scene.entracte" style="width:100%;">Activer</button>
                        </div>

                        <div class="sh-scene-card" data-action="normal" style="border-left:4px solid #2ecc71;">
                            <div style="font-size:28px; margin-bottom:8px;">💡</div>
                            <strong>Éclairage Normal</strong>
                            <p style="font-size:12px; color:var(--sh-text-muted); margin:4px 0 12px 0;">Restaure la lumière à 100%.</p>
                            <button class="sh-btn sh-btn--primary sh-btn--sm btn-trigger-scene" data-scene="scene.salon_normal" style="width:100%;">Activer</button>
                        </div>

                        <div class="sh-scene-card" data-action="off" style="border-left:4px solid #e74c3c;">
                            <div style="font-size:28px; margin-bottom:8px;">🌙</div>
                            <strong>Éteindre Tout</strong>
                            <p style="font-size:12px; color:var(--sh-text-muted); margin:4px 0 12px 0;">Éteint l'ensemble des lumières du salon.</p>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm btn-trigger-all-off" style="width:100%; color:#e74c3c;">Éteindre</button>
                        </div>
                    </div>
                </section>

                <section>
                    <h3>⚙️ Automatisation de Lecture</h3>
                    <div style="background:var(--sh-bg-surface-2); padding:16px 20px; border-radius:12px; border:1px solid var(--sh-border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>Mode Cinéma Automatique</strong>
                            <div style="font-size:12px; color:var(--sh-text-muted); margin-top:2px;">
                                Déclenche automatiquement le tamisage au Play, le mode Entracte à la Pause, et l'éclairage normal au Stop.
                            </div>
                        </div>
                        <input type="checkbox" id="chk-auto-cinema" checked style="width:20px; height:20px; cursor:pointer;" />
                    </div>
                </section>
            </div>
        `;

        contentEl.querySelectorAll('.btn-trigger-scene').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sc = btn.dataset.scene;
                if (this._ha?.isConfigured) {
                    await this._ha.activateScene(sc);
                    window.SpaceHub?.ui?.components?.toaster?.success(`Scène "${sc}" activée !`);
                } else {
                    window.SpaceHub?.ui?.components?.toaster?.info('Action simulée (configurez Home Assistant dans l\'onglet Réglages).');
                }
            });
        });

        contentEl.querySelector('.btn-trigger-all-off')?.addEventListener('click', async () => {
            if (this._ha?.isConfigured) {
                await this._ha.callService('light', 'turn_off', { entity_id: 'all' });
            }
            window.SpaceHub?.ui?.components?.toaster?.info('Lumières éteintes.');
        });

        contentEl.querySelector('#chk-auto-cinema')?.addEventListener('change', (e) => {
            this._cinema?.setEnabled(e.target.checked);
            window.SpaceHub?.ui?.components?.toaster?.info(`Mode Cinéma Auto ${e.target.checked ? 'activé' : 'désactivé'}.`);
        });
    }

    async _renderLightsTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Récupération des lumières Home Assistant...</div>';

        const lights = (await this._ha?.getLights()) || [];

        if (lights.length === 0) {
            contentEl.innerHTML = `
                <div style="text-align:center; padding:48px 0;">
                    <div style="font-size:40px; margin-bottom:12px;">💡</div>
                    <p style="color:var(--sh-text-muted);">Aucune lumière détectée via Home Assistant.</p>
                    <p style="font-size:13px; color:var(--sh-text-muted);">Vérifiez vos identifiants dans l'onglet Réglages.</p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
                ${lights.map(l => {
                    const isOn = l.state === 'on';
                    const brightness = l.attributes?.brightness ? Math.round((l.attributes.brightness / 255) * 100) : (isOn ? 100 : 0);
                    const name = l.attributes?.friendly_name || l.entity_id;

                    return `
                        <div class="sh-light-card" data-entity="${l.entity_id}">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <strong class="sh-truncate" style="max-width:180px;">${name}</strong>
                                <button class="sh-btn ${isOn ? 'sh-btn--primary' : 'sh-btn--ghost'} sh-btn--xs btn-toggle-light" data-entity="${l.entity_id}">
                                    ${isOn ? 'Allumée' : 'Éteinte'}
                                </button>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:11px; color:var(--sh-text-muted);">☀️</span>
                                <input type="range" class="sh-slider light-brightness-slider" data-entity="${l.entity_id}" min="1" max="100" value="${brightness}" style="flex:1;" />
                                <span style="font-size:11px; color:var(--sh-text-muted); width:32px; text-align:right;" id="bright-val-${l.entity_id}">${brightness}%</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        contentEl.querySelectorAll('.btn-toggle-light').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ent = btn.dataset.entity;
                const isCurrentlyOn = btn.textContent.trim() === 'Allumée';
                if (isCurrentlyOn) {
                    await this._ha.turnOff(ent);
                } else {
                    await this._ha.turnOn(ent);
                }
                await this._renderLightsTab(contentEl);
            });
        });

        contentEl.querySelectorAll('.light-brightness-slider').forEach(slider => {
            slider.addEventListener('change', async (e) => {
                const ent = slider.dataset.entity;
                const val = parseInt(e.target.value);
                contentEl.querySelector(`#bright-val-${ent}`).textContent = `${val}%`;
                await this._ha.turnOn(ent, { brightness_pct: val });
            });
        });
    }

    async _renderAmbilightTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-ambilight-studio">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <div>
                        <h3>🌈 Studio Ambilight Logiciel</h3>
                        <p style="font-size:13px; color:var(--sh-text-secondary); margin:4px 0 0 0;">
                            Capture les couleurs des bords de la vidéo en temps réel et les projette sur vos lampes LED.
                        </p>
                    </div>
                    <button class="sh-btn sh-btn--primary sh-btn--sm" id="btn-test-ambilight">💡 Tester les Couleurs</button>
                </div>

                <!-- Simulation d'écran avec halo Ambilight -->
                <div class="sh-ambilight-preview-box" id="sh-ambilight-preview">
                    <div class="sh-screen-mockup">
                        <div style="font-size:32px; margin-bottom:8px;">📺</div>
                        <span>Zone de lecture vidéo SpaceHub</span>
                        <div style="font-size:11px; color:var(--sh-text-muted); margin-top:4px;">Halo dynamique 360° actif</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px; margin-top:24px;">
                    <div class="sh-ambilight-zone-card">
                        <strong>⬅️ Bord Gauche</strong>
                        <input type="text" class="sh-input" id="amb-left-entity" placeholder="light.ruban_led_gauche" style="margin-top:8px; font-size:12px;" />
                    </div>
                    <div class="sh-ambilight-zone-card">
                        <strong>⬆️ Bord Supérieur</strong>
                        <input type="text" class="sh-input" id="amb-top-entity" placeholder="light.ruban_led_haut" style="margin-top:8px; font-size:12px;" />
                    </div>
                    <div class="sh-ambilight-zone-card">
                        <strong>➡️ Bord Droit</strong>
                        <input type="text" class="sh-input" id="amb-right-entity" placeholder="light.ruban_led_droit" style="margin-top:8px; font-size:12px;" />
                    </div>
                    <div class="sh-ambilight-zone-card">
                        <strong>⬇️ Bord Inférieur</strong>
                        <input type="text" class="sh-input" id="amb-bottom-entity" placeholder="light.ruban_led_bas" style="margin-top:8px; font-size:12px;" />
                    </div>
                </div>

                <button class="sh-btn sh-btn--primary" id="btn-save-ambilight-config" style="margin-top:20px;">
                    💾 Sauvegarder la configuration des lampes
                </button>
            </div>
        `;

        const previewEl = contentEl.querySelector('#sh-ambilight-preview');
        contentEl.querySelector('#btn-test-ambilight')?.addEventListener('click', () => {
            const colors = [
                'rgb(124, 106, 255)',
                'rgb(231, 76, 60)',
                'rgb(46, 204, 113)',
                'rgb(243, 156, 18)'
            ];
            const rand = () => colors[Math.floor(Math.random() * colors.length)];
            previewEl.style.boxShadow = `-60px 0 80px ${rand()}, 60px 0 80px ${rand()}, 0 -40px 60px ${rand()}, 0 40px 60px ${rand()}`;
            window.SpaceHub?.ui?.components?.toaster?.info('Cycle de couleurs Ambilight simulé !');
        });

        contentEl.querySelector('#btn-save-ambilight-config')?.addEventListener('click', () => {
            this._ambilight?.configureLights({
                left: contentEl.querySelector('#amb-left-entity').value.trim(),
                top: contentEl.querySelector('#amb-top-entity').value.trim(),
                right: contentEl.querySelector('#amb-right-entity').value.trim(),
                bottom: contentEl.querySelector('#amb-bottom-entity').value.trim(),
            });
            window.SpaceHub?.ui?.components?.toaster?.success('Configuration Ambilight enregistrée !');
        });
    }

    async _renderSettingsTab(contentEl) {
        const s = window.SpaceHub?.core?.settings;
        const currentUrl = s?.get('homeassistant.url', '');
        const currentToken = s?.get('homeassistant.token', '');

        contentEl.innerHTML = `
            <div class="sh-domotics-settings-form" style="max-width:600px; margin:0 auto;">
                <h3>⚙️ Connexion Home Assistant</h3>
                <p style="color:var(--sh-text-secondary); font-size:13px; margin:6px 0 20px 0;">
                    Connectez votre instance Home Assistant via un jeton d'accès longue durée (Long-Lived Access Token).
                </p>

                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div>
                        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">URL de Home Assistant</label>
                        <input type="text" class="sh-input" id="ha-url-input" value="${currentUrl}" placeholder="http://homeassistant.local:8123" style="width:100%;" />
                    </div>

                    <div>
                        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Jeton d'accès (Long-Lived Token)</label>
                        <input type="password" class="sh-input" id="ha-token-input" value="${currentToken}" placeholder="eyJhbGciOi..." style="width:100%;" />
                    </div>

                    <div style="display:flex; gap:10px; margin-top:8px;">
                        <button class="sh-btn sh-btn--primary" id="btn-save-ha">💾 Enregistrer</button>
                        <button class="sh-btn sh-btn--ghost" id="btn-test-ha">🧪 Tester la connexion</button>
                    </div>

                    <div id="ha-test-result" style="margin-top:12px;"></div>
                </div>
            </div>
        `;

        contentEl.querySelector('#btn-save-ha')?.addEventListener('click', async () => {
            const url = contentEl.querySelector('#ha-url-input').value.trim();
            const token = contentEl.querySelector('#ha-token-input').value.trim();

            s?.set('homeassistant.url', url);
            s?.set('homeassistant.token', token);

            window.SpaceHub?.ui?.components?.toaster?.success('Paramètres Home Assistant enregistrés !');
        });

        contentEl.querySelector('#btn-test-ha')?.addEventListener('click', async () => {
            const resEl = contentEl.querySelector('#ha-test-result');
            resEl.innerHTML = '<span style="color:var(--sh-text-muted);">Test en cours...</span>';

            const res = await this._ha?.testConnection();
            if (res?.success) {
                resEl.innerHTML = '<span style="color:#2ecc71; font-weight:700;">✅ Connexion réussie à Home Assistant !</span>';
            } else {
                resEl.innerHTML = `<span style="color:#e74c3c; font-weight:700;">❌ Échec de connexion : ${res?.error || 'Injoignable'}</span>`;
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-domotics-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-domotics-styles';
        style.textContent = `
.sh-domotics-page { max-width: 1600px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-domotics-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }
.sh-domotics-tabs { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.sh-dom-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-dom-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }

.sh-scene-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; padding: 20px; }
.sh-light-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; padding: 16px; }

/* Ambilight Studio */
.sh-ambilight-preview-box { height: 280px; background: #08080c; border-radius: 16px; border: 1px solid var(--sh-border-color); display: flex; align-items: center; justify-content: center; position: relative; margin-top: 16px; transition: box-shadow 0.4s ease; box-shadow: -40px 0 60px rgba(124,106,255,0.4), 40px 0 60px rgba(231,76,60,0.4), 0 -30px 40px rgba(46,204,113,0.3), 0 30px 40px rgba(243,156,18,0.3); }
.sh-screen-mockup { width: 50%; height: 65%; background: #16161e; border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.sh-ambilight-zone-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 10px; padding: 14px; }
        `;
        document.head.appendChild(style);
    }
}

export default DomoticsView;
