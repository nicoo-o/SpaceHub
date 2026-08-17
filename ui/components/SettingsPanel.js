/**
 * SpaceHub — Settings Panel
 * Version: 1.0.0
 *
 * Panneau de configuration unifié pour SpaceHub.
 * Permet de configurer les thèmes, les widgets du dashboard,
 * et toutes les connexions d'intégrations (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent).
 */

'use strict';

import Logger from '../../core/Logger.js';

class SettingsPanel {
    constructor() {
        this._log = new Logger('SettingsPanel');
        this._modal = null;
        this._activeTab = 'general';
    }

    get _settings() {
        return window.SpaceHub?.core?.settings;
    }

    /**
     * Ouvre la modale des réglages SpaceHub.
     * @param {'general'|'theme'|'dashboard'|'integrations'|'backup'} [tab='general']
     */
    open(tab = 'general') {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        this._activeTab = tab;
        this._injectStyles();

        this._modal = new Modal({
            id: 'spacehub-settings',
            title: '⚙️ Paramètres SpaceHub',
            size: 'xl',
            content: this._renderContent(),
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="close">Fermer</button>
                <button class="sh-btn sh-btn--primary" data-action="save">Enregistrer</button>
            `,
            onOpen: (m) => this._bindEvents(m)
        });

        this._modal.open();
    }

    _renderContent() {
        const themes = window.SpaceHub?.ui?.themes?.getAvailable() || [];
        const currentTheme = window.SpaceHub?.ui?.themes?.getCurrent() || 'spacehub-dark';
        const s = this._settings;

        return `
            <div class="sh-settings-container">
                <!-- Navigation latérale -->
                <nav class="sh-settings-nav">
                    <button class="sh-settings-nav__item ${this._activeTab === 'general' ? 'active' : ''}" data-tab="general">🚀 Général</button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'theme' ? 'active' : ''}" data-tab="theme">🎨 Apparence</button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">📊 Tableau de bord</button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'integrations' ? 'active' : ''}" data-tab="integrations">🔌 Intégrations</button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'backup' ? 'active' : ''}" data-tab="backup">💾 Sauvegarde</button>
                </nav>

                <!-- Contenu des onglets -->
                <div class="sh-settings-content sh-scrollbar">

                    <!-- Onglet Général -->
                    <div class="sh-settings-tab ${this._activeTab === 'general' ? 'active' : ''}" id="tab-general">
                        <h3>Configuration Générale</h3>
                        <p class="sh-settings-desc">Paramètres globaux de fonctionnement de SpaceHub.</p>
                        
                        <div class="sh-form-group">
                            <label>Niveau de logs (Console)</label>
                            <select class="sh-input" id="cfg-log-level">
                                <option value="debug" ${s?.get('core.logLevel') === 'debug' ? 'selected' : ''}>Debug (Très verbeux)</option>
                                <option value="info" ${s?.get('core.logLevel', 'info') === 'info' ? 'selected' : ''}>Info (Recommandé)</option>
                                <option value="warn" ${s?.get('core.logLevel') === 'warn' ? 'selected' : ''}>Avertissements seulement</option>
                                <option value="error" ${s?.get('core.logLevel') === 'error' ? 'selected' : ''}>Erreurs seulement</option>
                            </select>
                        </div>

                        <div class="sh-form-group">
                            <label>
                                <input type="checkbox" id="cfg-unified-search" ${s?.get('jellyfin.search.enabled', true) ? 'checked' : ''}/>
                                Activer la recherche unifiée rapide (Ctrl+K / /)
                            </label>
                        </div>
                    </div>

                    <!-- Onglet Apparence -->
                    <div class="sh-settings-tab ${this._activeTab === 'theme' ? 'active' : ''}" id="tab-theme">
                        <h3>Thèmes & Design</h3>
                        <p class="sh-settings-desc">Personnalisez l'identité visuelle de votre interface Jellyfin.</p>

                        <div class="sh-theme-picker-grid">
                            ${themes.map(t => `
                                <div class="sh-theme-choice ${t.id === currentTheme ? 'selected' : ''}" data-theme-id="${t.id}">
                                    <span class="sh-theme-choice__emoji">${t.emoji}</span>
                                    <span class="sh-theme-choice__name">${t.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Onglet Dashboard -->
                    <div class="sh-settings-tab ${this._activeTab === 'dashboard' ? 'active' : ''}" id="tab-dashboard">
                        <h3>Widgets du Tableau de bord</h3>
                        <p class="sh-settings-desc">Gérez les modules affichés sur votre page d'accueil SpaceHub.</p>
                        <p style="color:var(--sh-text-secondary); font-size:13px;">Vous pouvez également personnaliser l'agencement directement depuis le bouton "⚙️ Personnaliser" de la page d'accueil.</p>
                    </div>

                    <!-- Onglet Intégrations -->
                    <div class="sh-settings-tab ${this._activeTab === 'integrations' ? 'active' : ''}" id="tab-integrations">
                        <h3>Connexions Servarr & Torrents</h3>
                        <p class="sh-settings-desc">Renseignez vos URLs et clés d'API pour centraliser vos applications.</p>

                        <!-- Sonarr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>📺 Sonarr (Séries)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="sonarr">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-sonarr-url" placeholder="http://localhost:8989" value="${s?.get('sonarr.url', 'http://localhost:8989') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-sonarr-key" placeholder="Clé API Sonarr" value="${s?.get('sonarr.apiKey', '') || ''}"/>
                            </div>
                        </div>

                        <!-- Radarr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>🍿 Radarr (Films)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="radarr">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-radarr-url" placeholder="http://localhost:7878" value="${s?.get('radarr.url', 'http://localhost:7878') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-radarr-key" placeholder="Clé API Radarr" value="${s?.get('radarr.apiKey', '') || ''}"/>
                            </div>
                        </div>

                        <!-- Prowlarr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>🌐 Prowlarr (Indexeurs)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="prowlarr">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-prowlarr-url" placeholder="http://localhost:9696" value="${s?.get('prowlarr.url', 'http://localhost:9696') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-prowlarr-key" placeholder="Clé API Prowlarr" value="${s?.get('prowlarr.apiKey', '') || ''}"/>
                            </div>
                        </div>

                        <!-- Bazarr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>💬 Bazarr (Sous-titres)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="bazarr">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-bazarr-url" placeholder="http://localhost:6767" value="${s?.get('bazarr.url', 'http://localhost:6767') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-bazarr-key" placeholder="Clé API Bazarr" value="${s?.get('bazarr.apiKey', '') || ''}"/>
                            </div>
                        </div>

                        <!-- Jellyseerr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>🛎️ Jellyseerr (Demandes)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="jellyseerr">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-jellyseerr-url" placeholder="http://localhost:5055" value="${s?.get('jellyseerr.url', 'http://localhost:5055') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-jellyseerr-key" placeholder="Clé API Jellyseerr" value="${s?.get('jellyseerr.apiKey', '') || ''}"/>
                            </div>
                        </div>

                        <!-- qBittorrent -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>📥 qBittorrent (Client)</h4>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm" data-test="qbittorrent">Tester</button>
                            </div>
                            <div class="sh-form-row">
                                <input type="text" class="sh-input" id="cfg-qbit-url" placeholder="http://localhost:8080" value="${s?.get('qbittorrent.url', 'http://localhost:8080') || ''}"/>
                                <input type="text" class="sh-input" id="cfg-qbit-user" placeholder="Nom d'utilisateur" value="${s?.get('qbittorrent.username', 'admin') || ''}"/>
                                <input type="password" class="sh-input" id="cfg-qbit-pass" placeholder="Mot de passe" value="${s?.get('qbittorrent.password', '') || ''}"/>
                            </div>
                        </div>
                    </div>

                    <!-- Onglet Sauvegarde -->
                    <div class="sh-settings-tab ${this._activeTab === 'backup' ? 'active' : ''}" id="tab-backup">
                        <h3>Import / Export de configuration</h3>
                        <p class="sh-settings-desc">Sauvegardez vos réglages ou restaurez-les sur un autre navigateur / appareil.</p>

                        <div style="display:flex; gap:var(--sh-space-3,12px); margin-bottom:var(--sh-space-4,16px);">
                            <button class="sh-btn sh-btn--primary" id="btn-export-settings">📋 Exporter en JSON</button>
                            <button class="sh-btn sh-btn--danger" id="btn-reset-settings">⚠️ Réinitialiser tout</button>
                        </div>

                        <div class="sh-form-group">
                            <label>Restaurer depuis un JSON</label>
                            <textarea class="sh-input" id="txt-import-json" rows="6" placeholder="Collez votre configuration JSON ici..."></textarea>
                            <button class="sh-btn sh-btn--ghost" id="btn-import-settings" style="margin-top:8px;">Importer</button>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }

    _bindEvents(modal) {
        const el = modal._el;

        // Navigation onglets
        el.querySelectorAll('.sh-settings-nav__item').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.sh-settings-nav__item').forEach(b => b.classList.remove('active'));
                el.querySelectorAll('.sh-settings-tab').forEach(t => t.classList.remove('active'));

                btn.classList.add('active');
                el.querySelector(`#tab-${btn.dataset.tab}`)?.classList.add('active');
            });
        });

        // Sélecteur de thème
        el.querySelectorAll('.sh-theme-choice').forEach(choice => {
            choice.addEventListener('click', () => {
                el.querySelectorAll('.sh-theme-choice').forEach(c => c.classList.remove('selected'));
                choice.classList.add('selected');
                window.SpaceHub?.ui?.themes?.apply(choice.dataset.themeId);
            });
        });

        // Boutons de test de connexion
        el.querySelector('[data-test="sonarr"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.sonarr?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        el.querySelector('[data-test="radarr"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.radarr?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        el.querySelector('[data-test="prowlarr"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.prowlarr?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        el.querySelector('[data-test="bazarr"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.bazarr?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        el.querySelector('[data-test="jellyseerr"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.jellyseerr?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        el.querySelector('[data-test="qbittorrent"]')?.addEventListener('click', async (e) => {
            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.qbittorrent?.api?.testConnection();
            e.target.textContent = res?.success ? '✅ OK' : '❌ Erreur';
        });

        // Export JSON
        el.querySelector('#btn-export-settings')?.addEventListener('click', () => {
            const json = this._settings?.export() || '{}';
            navigator.clipboard.writeText(json);
            window.SpaceHub?.ui?.components?.toaster?.success('Configuration copiée dans le presse-papier !');
        });

        // Import JSON
        el.querySelector('#btn-import-settings')?.addEventListener('click', () => {
            const text = el.querySelector('#txt-import-json')?.value?.trim();
            if (text) {
                this._settings?.import(text);
                window.SpaceHub?.ui?.components?.toaster?.success('Configuration restaurée !');
                modal.close();
            }
        });

        // Reset
        el.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
            if (confirm('Voulez-vous vraiment réinitialiser tous les paramètres SpaceHub ?')) {
                this._settings?.reset();
                window.SpaceHub?.ui?.components?.toaster?.info('Paramètres réinitialisés.');
                modal.close();
            }
        });

        // Enregistrement
        el.querySelector('[data-action="save"]')?.addEventListener('click', () => {
            const s = this._settings;
            if (!s) return;

            s.set('core.logLevel', el.querySelector('#cfg-log-level')?.value);
            s.set('jellyfin.search.enabled', el.querySelector('#cfg-unified-search')?.checked);

            s.set('sonarr.url', el.querySelector('#cfg-sonarr-url')?.value);
            s.set('sonarr.apiKey', el.querySelector('#cfg-sonarr-key')?.value);

            s.set('radarr.url', el.querySelector('#cfg-radarr-url')?.value);
            s.set('radarr.apiKey', el.querySelector('#cfg-radarr-key')?.value);

            s.set('prowlarr.url', el.querySelector('#cfg-prowlarr-url')?.value);
            s.set('prowlarr.apiKey', el.querySelector('#cfg-prowlarr-key')?.value);

            s.set('bazarr.url', el.querySelector('#cfg-bazarr-url')?.value);
            s.set('bazarr.apiKey', el.querySelector('#cfg-bazarr-key')?.value);

            s.set('jellyseerr.url', el.querySelector('#cfg-jellyseerr-url')?.value);
            s.set('jellyseerr.apiKey', el.querySelector('#cfg-jellyseerr-key')?.value);

            s.set('qbittorrent.url', el.querySelector('#cfg-qbit-url')?.value);
            s.set('qbittorrent.username', el.querySelector('#cfg-qbit-user')?.value);
            s.set('qbittorrent.password', el.querySelector('#cfg-qbit-pass')?.value);

            window.SpaceHub?.ui?.components?.toaster?.success('Paramètres enregistrés avec succès !');
            modal.close();
        });

        el.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.close());
    }

    _injectStyles() {
        if (document.getElementById('sh-settings-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-settings-styles';
        style.textContent = `
.sh-settings-container {
    display: flex;
    gap: var(--sh-space-6, 24px);
    min-height: 480px;
}

.sh-settings-nav {
    width: 180px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-1, 4px);
    border-right: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    padding-right: var(--sh-space-4, 16px);
}

.sh-settings-nav__item {
    text-align: left;
    background: transparent;
    border: none;
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    border-radius: var(--sh-radius-sm, 8px);
    color: var(--sh-text-secondary, #9898b8);
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
}

.sh-settings-nav__item:hover {
    color: var(--sh-text-primary, #f0f0f8);
    background: var(--sh-bg-surface-2, #22222e);
}

.sh-settings-nav__item.active {
    color: var(--sh-text-on-primary, #fff);
    background: var(--sh-color-primary, #7c6aff);
}

.sh-settings-content {
    flex: 1;
    overflow-y: auto;
    max-height: 65vh;
    padding-right: var(--sh-space-2, 8px);
}

.sh-settings-tab { display: none; }
.sh-settings-tab.active { display: block; }

.sh-settings-tab h3 {
    margin: 0 0 var(--sh-space-1, 4px) 0;
    font-size: var(--sh-text-lg, 20px);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-settings-desc {
    margin: 0 0 var(--sh-space-4, 16px) 0;
    font-size: var(--sh-text-sm, 13px);
    color: var(--sh-text-muted, #5c5c7a);
}

.sh-form-group {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-2, 8px);
    margin-bottom: var(--sh-space-4, 16px);
}

.sh-form-group label {
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-form-row {
    display: flex;
    gap: var(--sh-space-2, 8px);
}

.sh-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-sm, 8px);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    color: var(--sh-text-primary, #f0f0f8);
    font-family: var(--sh-font-family, sans-serif);
    font-size: var(--sh-text-sm, 13px);
    outline: none;
    transition: border-color var(--sh-transition-fast, 150ms);
}

.sh-input:focus {
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-theme-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--sh-space-3, 12px);
}

.sh-theme-choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sh-space-2, 8px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 2px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-4, 16px);
    cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
}

.sh-theme-choice:hover {
    transform: translateY(-2px);
    border-color: var(--sh-border-color-hover);
}

.sh-theme-choice.selected {
    border-color: var(--sh-color-primary, #7c6aff);
    background: rgba(var(--sh-color-primary-rgb, 124,106,255), 0.1);
}

.sh-theme-choice__emoji { font-size: 24px; }
.sh-theme-choice__name { font-size: var(--sh-text-xs, 11px); font-weight: 600; text-align: center; }

.sh-integration-card {
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-4, 16px);
    margin-bottom: var(--sh-space-3, 12px);
}

.sh-integration-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--sh-space-3, 12px);
}

.sh-integration-card__header h4 {
    margin: 0;
    font-size: var(--sh-text-sm, 13px);
    color: var(--sh-text-primary, #f0f0f8);
}
        `;
        document.head.appendChild(style);
    }
}

export default SettingsPanel;
