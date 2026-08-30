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
            title: `
                <div class="sh-brand-badge" style="display:inline-flex; align-items:center; gap:8px;">
                    <div class="sh-luminous-dot" title="SpaceHub Active"><div class="sh-dot-core"></div></div>
                    <svg class="sh-rocket-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                    </svg>
                    <span style="font-size: 16px; font-weight: 750; color: #ffffff; letter-spacing: -0.02em;">SpaceHub</span>
                    <span style="color: rgba(255, 255, 255, 0.35); font-size: 12px;">•</span>
                    <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.6); text-transform: uppercase;">Réglages</span>
                </div>
            `,
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
                <!-- Navigation latérale macOS Style -->
                <nav class="sh-settings-nav">
                    <button class="sh-settings-nav__item ${this._activeTab === 'general' ? 'active' : ''}" data-tab="general">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        <span>Général</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'theme' ? 'active' : ''}" data-tab="theme">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
                        <span>Apparence</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>
                        <span>Dashboard</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'libraries' ? 'active' : ''}" data-tab="libraries">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                        <span>Médiathèques</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'integrations' ? 'active' : ''}" data-tab="integrations">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        <span>Intégrations</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        <span>Notifications</span>
                    </button>
                    <button class="sh-settings-nav__item ${this._activeTab === 'backup' ? 'active' : ''}" data-tab="backup">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Sauvegarde</span>
                    </button>
                </nav>

                <!-- Contenu des onglets -->
                <div class="sh-settings-content sh-no-scrollbar">

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
                                    <span class="sh-theme-choice__icon">${t.icon || '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>'}</span>
                                    <span class="sh-theme-choice__name">${t.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Onglet Dashboard -->
                    <div class="sh-settings-tab ${this._activeTab === 'dashboard' ? 'active' : ''}" id="tab-dashboard">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <h3 style="margin:0;">Personnalisation de l'Accueil</h3>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-reset-home-order" style="font-size:12px; padding:4px 10px;">
                                ↺ Réinitialiser l'ordre
                            </button>
                        </div>
                        <p class="sh-settings-desc">Choisissez précisément les sections et flux multimédias que vous souhaitez afficher sur votre page d'accueil SpaceHub.</p>
                        <div class="sh-settings-libraries-list" id="sh-cfg-home-sections-list"></div>
                    </div>

                    <!-- Onglet Médiathèques & Sections -->
                    <div class="sh-settings-tab ${this._activeTab === 'libraries' ? 'active' : ''}" id="tab-libraries">
                        <h3>Gestion des Médiathèques & Sections</h3>
                        <p class="sh-settings-desc">Cochez ou décochez les bibliothèques que vous souhaitez afficher dans l'application.</p>
                        <div class="sh-settings-libraries-list" id="sh-cfg-libraries-list">
                            <p style="color:var(--sh-text-secondary); font-size:13px;">Chargement des médiathèques...</p>
                        </div>
                    </div>

                    <!-- Onglet Intégrations -->
                    <div class="sh-settings-tab ${this._activeTab === 'integrations' ? 'active' : ''}" id="tab-integrations">
                        <h3>Connexions Servarr & Torrents</h3>
                        <p class="sh-settings-desc">Renseignez vos URLs et clés d'API pour centraliser vos applications.</p>

                        <!-- Sonarr -->
                        <div class="sh-integration-card">
                            <div class="sh-integration-card__header">
                                <h4>Sonarr (Séries TV)</h4>
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
                                <h4>Radarr (Films)</h4>
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
                                <h4>Prowlarr (Indexeurs)</h4>
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
                                <h4>Bazarr (Sous-titres)</h4>
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
                                <h4>Jellyseerr (Demandes)</h4>
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
                                <h4>qBittorrent (Client Torrent)</h4>
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
                            <button class="sh-btn sh-btn--primary" id="btn-export-settings">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                <span>Exporter en JSON</span>
                            </button>
                            <button class="sh-btn sh-btn--danger" id="btn-reset-settings">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                <span>Réinitialiser tout</span>
                            </button>
                        </div>

                        <div class="sh-form-group">
                            <label>Restaurer depuis un JSON</label>
                            <textarea class="sh-input" id="txt-import-json" rows="6" placeholder="Collez votre configuration JSON ici..."></textarea>
                            <button class="sh-btn sh-btn--ghost" id="btn-import-settings" style="margin-top:8px;">Importer</button>
                        </div>
                    </div>

                    <!-- Onglet Notifications & Webhooks -->
                    <div class="sh-settings-tab ${this._activeTab === 'notifications' ? 'active' : ''}" id="tab-notifications">
                        <h3>Alertes & Webhooks</h3>
                        <p class="sh-settings-desc">Recevez des alertes en direct lors des téléchargements, demandes ou sorties médias.</p>

                        <div class="sh-form-group">
                            <label>
                                <input type="checkbox" id="cfg-notif-enabled" ${s?.get('notifications.enabled', true) ? 'checked' : ''}/>
                                Activer les notifications SpaceHub
                            </label>
                        </div>

                        <div class="sh-form-group">
                            <label>
                                <input type="checkbox" id="cfg-notif-browser" ${s?.get('notifications.browser', false) ? 'checked' : ''}/>
                                Autoriser les notifications système du navigateur (Web Push)
                            </label>
                            <button class="sh-btn sh-btn--ghost" id="btn-request-browser-perm" style="margin-top:6px; font-size:12px;">Demander l'autorisation</button>
                        </div>

                        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.08); margin:20px 0;"/>

                        <h4 style="color:#ffffff; margin-bottom:10px;">Webhook Discord</h4>
                        <div class="sh-form-group">
                            <label>
                                <input type="checkbox" id="cfg-notif-discord-enabled" ${s?.get('notifications.discord.enabled', false) ? 'checked' : ''}/>
                                Activer les alertes sur un salon Discord
                            </label>
                        </div>
                        <div class="sh-form-group">
                            <label>URL du Webhook Discord</label>
                            <input type="text" class="sh-input" id="cfg-notif-discord-url" placeholder="https://discord.com/api/webhooks/..." value="${s?.get('notifications.discord.webhookUrl') || ''}" />
                            <button class="sh-btn sh-btn--ghost" id="btn-test-discord-webhook" style="margin-top:6px; font-size:12px;">Tester le Webhook Discord</button>
                        </div>

                        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.08); margin:20px 0;"/>

                        <h4 style="color:#ffffff; margin-bottom:10px;">Telegram Bot</h4>
                        <div class="sh-form-group">
                            <label>
                                <input type="checkbox" id="cfg-notif-telegram-enabled" ${s?.get('notifications.telegram.enabled', false) ? 'checked' : ''}/>
                                Activer les alertes Telegram
                            </label>
                        </div>
                        <div class="sh-form-group">
                            <label>Bot Token Telegram</label>
                            <input type="text" class="sh-input" id="cfg-notif-telegram-token" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" value="${s?.get('notifications.telegram.botToken') || ''}" />
                        </div>
                        <div class="sh-form-group">
                            <label>Chat ID Telegram</label>
                            <input type="text" class="sh-input" id="cfg-notif-telegram-chatid" placeholder="-1001234567890" value="${s?.get('notifications.telegram.chatId') || ''}" />
                            <button class="sh-btn sh-btn--ghost" id="btn-test-telegram" style="margin-top:6px; font-size:12px;">Tester Telegram</button>
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
        const toaster = window.SpaceHub?.ui?.components?.toaster;

        el.querySelector('[data-test="sonarr"]')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-sonarr-url')?.value?.trim();
            const apiKey = el.querySelector('#cfg-sonarr-key')?.value?.trim();
            if (url) this._settings?.set('sonarr.url', url);
            if (apiKey) this._settings?.set('sonarr.apiKey', apiKey);
            window.SpaceHub?.integrations?.sonarr?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.sonarr?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`Sonarr connecté (v${res.version || '3.0'}) !`);
            else toaster?.error(`Sonarr injoignable : ${res?.error || 'Vérifiez l\'URL et la clé API'}`);
        });

        el.querySelector('[data-test="radarr"]')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-radarr-url')?.value?.trim();
            const apiKey = el.querySelector('#cfg-radarr-key')?.value?.trim();
            if (url) this._settings?.set('radarr.url', url);
            if (apiKey) this._settings?.set('radarr.apiKey', apiKey);
            window.SpaceHub?.integrations?.radarr?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.radarr?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`Radarr connecté (v${res.version || '3.0'}) !`);
            else toaster?.error(`Radarr injoignable : ${res?.error || 'Vérifiez l\'URL et la clé API'}`);
        });

        el.querySelector('[data-test="prowlarr"]')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-prowlarr-url')?.value?.trim();
            const apiKey = el.querySelector('#cfg-prowlarr-key')?.value?.trim();
            if (url) this._settings?.set('prowlarr.url', url);
            if (apiKey) this._settings?.set('prowlarr.apiKey', apiKey);
            window.SpaceHub?.integrations?.prowlarr?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.prowlarr?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`Prowlarr connecté (v${res.version || '1.0'}) !`);
            else toaster?.error(`Prowlarr injoignable : ${res?.error || 'Vérifiez l\'URL et la clé API'}`);
        });

        el.querySelector('[data-test="bazarr"]')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-bazarr-url')?.value?.trim();
            const apiKey = el.querySelector('#cfg-bazarr-key')?.value?.trim();
            if (url) this._settings?.set('bazarr.url', url);
            if (apiKey) this._settings?.set('bazarr.apiKey', apiKey);
            window.SpaceHub?.integrations?.bazarr?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.bazarr?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`Bazarr connecté (v${res.version || '1.0'}) !`);
            else toaster?.error(`Bazarr injoignable : ${res?.error || 'Vérifiez l\'URL et la clé API'}`);
        });

        el.querySelector('[data-test="jellyseerr"]')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-jellyseerr-url')?.value?.trim();
            const apiKey = el.querySelector('#cfg-jellyseerr-key')?.value?.trim();
            if (url) this._settings?.set('jellyseerr.url', url);
            if (apiKey) this._settings?.set('jellyseerr.apiKey', apiKey);
            window.SpaceHub?.integrations?.jellyseerr?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.jellyseerr?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`Jellyseerr connecté (v${res.version || '1.0'}) !`);
            else toaster?.error(`Jellyseerr injoignable : ${res?.error || 'Vérifiez l\'URL et la clé API'}`);
        });

        el.querySelector('[data-test="qbittorrent"]')?.addEventListener('click', async (e) => {
            const url = (el.querySelector('#cfg-qbit-url')?.value || el.querySelector('#cfg-qbittorrent-url')?.value)?.trim();
            const username = (el.querySelector('#cfg-qbit-user')?.value || el.querySelector('#cfg-qbittorrent-user')?.value)?.trim();
            const password = el.querySelector('#cfg-qbit-pass')?.value ?? el.querySelector('#cfg-qbittorrent-pass')?.value;
            if (url) this._settings?.set('qbittorrent.url', url);
            if (username) this._settings?.set('qbittorrent.username', username);
            if (password !== undefined) this._settings?.set('qbittorrent.password', password);
            window.SpaceHub?.integrations?.qbittorrent?.api?.updateConfig?.();

            e.target.textContent = 'Test...';
            const res = await window.SpaceHub?.integrations?.qbittorrent?.api?.testConnection();
            e.target.textContent = res?.success ? 'Connecté' : 'Erreur';
            if (res?.success) toaster?.success(`qBittorrent connecté (v${res.version || '4.0+'}) !`);
            else toaster?.error(`qBittorrent injoignable : ${res?.error || 'Vérifiez l\'URL et vos identifiants WebUI'}`);
        });

        // Test Webhooks & Notifications
        el.querySelector('#btn-request-browser-perm')?.addEventListener('click', async () => {
            const notif = window.SpaceHub?.core?.notifications;
            const granted = await notif?.requestBrowserPermission?.();
            if (granted) toaster?.success('Notifications navigateur autorisées !');
            else toaster?.warn('Permission notifications non accordée.');
        });

        el.querySelector('#btn-test-discord-webhook')?.addEventListener('click', async (e) => {
            const url = el.querySelector('#cfg-notif-discord-url')?.value?.trim();
            if (!url) {
                toaster?.error('Veuillez renseigner une URL de Webhook Discord');
                return;
            }
            e.target.textContent = 'Envoi...';
            try {
                const notif = window.SpaceHub?.core?.notifications;
                if (notif) {
                    await notif._sendDiscordWebhook(url, 'Test SpaceHub 🚀', 'Connexion Webhook Discord réussie !', { type: 'success' });
                    toaster?.success('Message de test envoyé sur Discord !');
                }
            } catch (err) {
                toaster?.error(`Échec du test : ${err.message}`);
            } finally {
                e.target.textContent = 'Tester le Webhook Discord';
            }
        });

        el.querySelector('#btn-test-telegram')?.addEventListener('click', async (e) => {
            const token = el.querySelector('#cfg-notif-telegram-token')?.value?.trim();
            const chatId = el.querySelector('#cfg-notif-telegram-chatid')?.value?.trim();
            if (!token || !chatId) {
                toaster?.error('Veuillez renseigner le Token Bot et le Chat ID Telegram');
                return;
            }
            e.target.textContent = 'Envoi...';
            try {
                const notif = window.SpaceHub?.core?.notifications;
                if (notif) {
                    await notif._sendTelegramMessage(token, chatId, 'Test SpaceHub 🚀', 'Connexion Telegram Bot réussie !');
                    toaster?.success('Message de test envoyé sur Telegram !');
                }
            } catch (err) {
                toaster?.error(`Échec du test : ${err.message}`);
            } finally {
                e.target.textContent = 'Tester Telegram';
            }
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
                localStorage.removeItem('sh_library_hidden_ids');
                window.SpaceHub?.ui?.components?.toaster?.info('Paramètres réinitialisés.');
                modal.close();
            }
        });

        // Chargement et gestion de la Personnalisation de l'Accueil (Dashboard)
        const homeSectionsEl = el.querySelector('#sh-cfg-home-sections-list');
        if (homeSectionsEl) {
            const DEFAULT_HOME_SECTIONS = [
                { id: 'hero-spotlight', name: 'Bannière Hero Spotlight', type: 'En-tête Cinématique 100vh', icon: '🎬' },
                { id: 'user-genres', name: 'Barre des Univers & Genres', type: 'Filtres rapides', icon: '✨' },
                { id: 'user-libraries', name: 'Mes Médiathèques & Bibliothèques', type: 'Rayons Jellyfin', icon: '📁' },
                { id: 'continue-watching', name: 'Continuer la lecture', type: 'Reprise rapide avec progression', icon: '▶️' },
                { id: 'latest-additions', name: 'Nouveautés & Ajouts Récents', type: 'Flux serveur Jellyfin', icon: '🔥' },
                { id: 'movies', name: 'Films populaires', type: 'Rayon Films', icon: '🍿' },
                { id: 'tv-shows', name: 'Séries TV', type: 'Rayon Séries', icon: '📺' },
                { id: 'anime', name: 'Animés & Animation Japonaise', type: 'Rayon Animés', icon: '⚡' },
                { id: 'collections-sagas', name: 'Mes Sagas & Collections', type: 'Boxsets & Sagas', icon: '📦' },
                { id: 'music-soundtracks', name: 'Musiques & Bandes Originales', type: 'Rayon Musique', icon: '🎵' },
                { id: 'jellyseerr-trending', name: 'Tendances & Découverte (Jellyseerr)', type: 'Découverte TMDB', icon: '🔥' },
                { id: 'jellyseerr-popular-movies', name: 'Films Populaires (Jellyseerr)', type: 'Streaming & Box-office', icon: '🍿' },
                { id: 'jellyseerr-popular-series', name: 'Séries Populaires & Nouveautés TV', type: 'Séries en streaming', icon: '📺' },
                { id: 'jellyseerr-upcoming', name: 'Sorties Très Attendues (Jellyseerr)', type: 'Prochainement', icon: '⏳' },
                { id: 'jellyseerr-requests', name: 'Demandes de Médias (Jellyseerr)', type: 'Gestion requêtes', icon: '🤝' },
                { id: 'unified-calendar', name: 'Calendrier Unifié des Sorties', type: 'Sorties Séries & Films', icon: '📅' },
                { id: 'media-analytics', name: 'Mon Activité & Statistiques', type: 'Statistiques de visionnage', icon: '📊' },
                { id: 'qbittorrent-speed', name: 'Compteurs Vitesse qBittorrent', type: 'Intégration qBittorrent', icon: '⚡' },
                { id: 'qbittorrent-active', name: 'Téléchargements Actifs qBittorrent', type: 'Intégration qBittorrent', icon: '📥' },
                { id: 'sonarr-upcoming', name: 'Calendrier Séries (Sonarr)', type: 'Intégration Sonarr', icon: '📅' },
                { id: 'radarr-upcoming', name: 'Sorties Films (Radarr)', type: 'Intégration Radarr', icon: '🎥' },
                { id: 'bazarr-wanted', name: 'Sous-titres Recherchés (Bazarr)', type: 'Intégration Bazarr', icon: '📝' },
            ];

            const hiddenSections = new Set(this._settings?.get('dashboard.hiddenSections', []));
            let sectionOrderArr = JSON.parse(localStorage.getItem('sh_dashboard_sections_order') || 'null') || this._settings?.get('dashboard.sectionsOrder', []);
            let sectionsList = [...DEFAULT_HOME_SECTIONS];

            // Découvrir les bibliothèques personnalisées du serveur et les ajouter à la liste
            const api = window.SpaceHub?.jellyfin?.api;
            const loadCustomLibs = async () => {
                try {
                    let userViews = [];
                    if (api?.getUserViews) {
                        userViews = await api.getUserViews();
                    }
                    if ((!userViews || userViews.length === 0) && window.ApiClient?.getUserViews) {
                        const rawViews = await window.ApiClient.getUserViews(api?.getUserId?.());
                        userViews = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
                    }
                    if (Array.isArray(userViews)) {
                        for (const v of userViews) {
                            const name = (v.Name || '').toLowerCase();
                            const colType = (v.CollectionType || '').toLowerCase();

                            // Sauter les bibliothèques déjà couvertes par des sections dédiées
                            if (name.includes('anime') || name.includes('animé') || name.includes('animation') || name.includes('manga') || colType.includes('anime')) continue;
                            if (name === 'films' || name === 'movies' || name === 'cinéma' || name === 'cinema') continue;
                            if (name === 'séries' || name === 'series' || name === 'séries tv' || name === 'tv shows' || name === 'tv') continue;
                            if (colType === 'music' || name === 'musique' || name === 'music') continue;
                            if (colType === 'boxsets' || name === 'collections' || name === 'sagas') continue;

                            const libSecId = `library-${v.Id}`;
                            if (!sectionsList.some(s => s.id === libSecId)) {
                                const lowerType = (v.CollectionType || v.Type || '').toLowerCase();
                                let libIcon = '📁';
                                if (lowerType.includes('movie')) libIcon = '🎬';
                                else if (lowerType.includes('tv') || lowerType.includes('series')) libIcon = '📺';
                                else if (lowerType.includes('music')) libIcon = '🎵';

                                sectionsList.splice(10, 0, {
                                    id: libSecId,
                                    name: `Rayon : ${v.Name}`,
                                    type: 'Médiathèque Jellyfin',
                                    icon: libIcon
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Ignorer
                }
                renderHomeSectionRows();
            };

            const CANONICAL_RANKS = new Map([
                ['hero-spotlight', 0],
                ['user-genres', 5],
                ['user-libraries', 10],
                ['continue-watching', 20],
                ['latest-additions', 30],
                ['movies', 40],
                ['tv-shows', 50],
                ['anime', 60],
                ['collections-sagas', 70],
                ['music-soundtracks', 80],
                ['jellyseerr-trending', 100],
                ['jellyseerr-popular-movies', 110],
                ['jellyseerr-popular-series', 120],
                ['jellyseerr-upcoming', 130],
                ['jellyseerr-requests', 140],
                ['unified-calendar', 150],
                ['media-analytics', 160],
                ['qbittorrent-speed', 170],
                ['qbittorrent-active', 180],
                ['sonarr-upcoming', 190],
                ['radarr-upcoming', 200],
                ['bazarr-wanted', 210],
            ]);

            const renderHomeSectionRows = () => {
                if (Array.isArray(sectionOrderArr) && sectionOrderArr.length > 0) {
                    const orderMap = new Map(sectionOrderArr.map((id, i) => [id, i]));
                    sectionsList.sort((a, b) => {
                        const getScore = (id) => {
                            if (orderMap.has(id)) return orderMap.get(id);
                            if (id.startsWith('library-')) return 8.5;
                            const canRank = CANONICAL_RANKS.get(id);
                            return canRank !== undefined ? canRank / 10 : 999;
                        };
                        return getScore(a.id) - getScore(b.id);
                    });
                } else {
                    sectionsList.sort((a, b) => {
                        const rankA = a.id.startsWith('library-') ? 85 : (CANONICAL_RANKS.get(a.id) ?? 999);
                        const rankB = b.id.startsWith('library-') ? 85 : (CANONICAL_RANKS.get(b.id) ?? 999);
                        return rankA - rankB;
                    });
                }

                homeSectionsEl.innerHTML = sectionsList.map((sec, idx) => {
                    const isVisible = !hiddenSections.has(sec.id);
                    const isFirst = idx === 0;
                    const isLast = idx === sectionsList.length - 1;

                    return `
                        <div class="sh-settings-lib-row" data-id="${sec.id}" data-index="${idx}" draggable="true">
                            <div class="sh-drag-handle" title="Glisser pour réordonner">⠿</div>
                            <div class="sh-lib-manage-reorder" style="margin-right:10px;">
                                <button class="sh-lib-order-btn sh-cfg-sec-order-up" data-index="${idx}" ${isFirst ? 'disabled' : ''} title="Monter">▲</button>
                                <button class="sh-lib-order-btn sh-cfg-sec-order-down" data-index="${idx}" ${isLast ? 'disabled' : ''} title="Descendre">▼</button>
                            </div>
                            <div class="sh-settings-lib-info" style="flex:1;">
                                <span class="sh-settings-lib-icon" style="font-size:16px;">${sec.icon}</span>
                                <div>
                                    <div class="sh-settings-lib-name">${sec.name}</div>
                                    <div class="sh-settings-lib-type">${sec.type}</div>
                                </div>
                            </div>
                            <label class="sh-apple-switch">
                                <input type="checkbox" class="sh-cfg-section-toggle" data-id="${sec.id}" ${isVisible ? 'checked' : ''} />
                                <span class="sh-apple-switch-slider"></span>
                            </label>
                        </div>
                    `;
                }).join('');

                // Toggles
                homeSectionsEl.querySelectorAll('.sh-cfg-section-toggle').forEach(chk => {
                    chk.addEventListener('change', () => {
                        const secId = chk.dataset.id;
                        if (chk.checked) {
                            hiddenSections.delete(secId);
                        } else {
                            hiddenSections.add(secId);
                        }
                        this._settings?.set('dashboard.hiddenSections', Array.from(hiddenSections));
                        window.SpaceHub?.ui?.dashboard?.render?.();
                    });
                });

                // Flèches Monter
                homeSectionsEl.querySelectorAll('.sh-cfg-sec-order-up').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = Number(btn.dataset.index);
                        if (idx > 0) {
                            const temp = sectionsList[idx];
                            sectionsList[idx] = sectionsList[idx - 1];
                            sectionsList[idx - 1] = temp;
                            sectionOrderArr = sectionsList.map(s => s.id);
                            localStorage.setItem('sh_dashboard_sections_order', JSON.stringify(sectionOrderArr));
                            this._settings?.set('dashboard.sectionsOrder', sectionOrderArr);
                            renderHomeSectionRows();
                            window.SpaceHub?.ui?.dashboard?.render?.();
                        }
                    });
                });

                // Flèches Descendre
                homeSectionsEl.querySelectorAll('.sh-cfg-sec-order-down').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = Number(btn.dataset.index);
                        if (idx < sectionsList.length - 1) {
                            const temp = sectionsList[idx];
                            sectionsList[idx] = sectionsList[idx + 1];
                            sectionsList[idx + 1] = temp;
                            sectionOrderArr = sectionsList.map(s => s.id);
                            localStorage.setItem('sh_dashboard_sections_order', JSON.stringify(sectionOrderArr));
                            this._settings?.set('dashboard.sectionsOrder', sectionOrderArr);
                            renderHomeSectionRows();
                            window.SpaceHub?.ui?.dashboard?.render?.();
                        }
                    });
                });

                // Drag & Drop avec souris
                let draggedSecIdx = null;

                homeSectionsEl.querySelectorAll('.sh-settings-lib-row').forEach(row => {
                    row.addEventListener('dragstart', (e) => {
                        draggedSecIdx = Number(row.dataset.index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(draggedSecIdx));
                        requestAnimationFrame(() => row.classList.add('dragging'));
                    });

                    row.addEventListener('dragend', () => {
                        row.classList.remove('dragging');
                        homeSectionsEl.querySelectorAll('.sh-settings-lib-row').forEach(r => {
                            r.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
                        });
                    });

                    row.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const targetIdx = Number(row.dataset.index);
                        if (targetIdx === draggedSecIdx) return;

                        const rect = row.getBoundingClientRect();
                        const isTop = (e.clientY - rect.top) < (rect.height / 2);
                        row.classList.toggle('drag-over-top', isTop);
                        row.classList.toggle('drag-over-bottom', !isTop);
                    });

                    row.addEventListener('dragleave', () => {
                        row.classList.remove('drag-over-top', 'drag-over-bottom');
                    });

                    row.addEventListener('drop', (e) => {
                        e.preventDefault();
                        row.classList.remove('drag-over-top', 'drag-over-bottom');
                        const targetIdx = Number(row.dataset.index);
                        if (draggedSecIdx === null || draggedSecIdx === targetIdx) return;

                        const rect = row.getBoundingClientRect();
                        const isTop = (e.clientY - rect.top) < (rect.height / 2);
                        let newIndex = isTop ? targetIdx : targetIdx + 1;
                        if (draggedSecIdx < newIndex) newIndex--;

                        const [movedItem] = sectionsList.splice(draggedSecIdx, 1);
                        sectionsList.splice(newIndex, 0, movedItem);
                        sectionOrderArr = sectionsList.map(s => s.id);
                        localStorage.setItem('sh_dashboard_sections_order', JSON.stringify(sectionOrderArr));
                        this._settings?.set('dashboard.sectionsOrder', sectionOrderArr);
                        renderHomeSectionRows();
                        window.SpaceHub?.ui?.dashboard?.render?.();
                    });
                });
            };

            // Bouton de réinitialisation de l'ordre
            const resetHomeOrderBtn = el.querySelector('#btn-reset-home-order');
            if (resetHomeOrderBtn) {
                resetHomeOrderBtn.addEventListener('click', () => {
                    localStorage.removeItem('sh_dashboard_sections_order');
                    sectionOrderArr = null;
                    this._settings?.set('dashboard.sectionsOrder', null);
                    sectionsList = [...DEFAULT_HOME_SECTIONS];
                    loadCustomLibs();
                    window.SpaceHub?.ui?.dashboard?.render?.();
                    window.SpaceHub?.ui?.components?.toaster?.success?.('Ordre par défaut restauré !');
                });
            }

            renderHomeSectionRows();
            loadCustomLibs();
        }

        // Chargement et gestion de l'onglet Médiathèques
        const libListEl = el.querySelector('#sh-cfg-libraries-list');
        if (libListEl) {
            const api = window.SpaceHub?.jellyfin?.api;
            const hiddenSet = new Set(JSON.parse(localStorage.getItem('sh_library_hidden_ids') || '[]'));
            let orderArr = JSON.parse(localStorage.getItem('sh_library_order') || '[]');

            api?.getUserViews?.().then(views => {
                let list = views ? [...views] : [];
                if (list.length === 0) {
                    libListEl.innerHTML = '<p style="color:var(--sh-text-secondary); font-size:13px;">Aucune médiathèque trouvée sur le serveur.</p>';
                    return;
                }

                const renderLibRows = () => {
                    if (orderArr.length > 0) {
                        const map = new Map(orderArr.map((id, i) => [id, i]));
                        list.sort((a, b) => (map.has(a.Id) ? map.get(a.Id) : 999) - (map.has(b.Id) ? map.get(b.Id) : 999));
                    }

                    libListEl.innerHTML = list.map((lib, idx) => {
                        const isVisible = !hiddenSet.has(lib.Id);
                        const rawType = (lib.CollectionType || lib.Type || '').toLowerCase();
                        let icon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`;
                        if (rawType.includes('movie')) icon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`;
                        else if (rawType.includes('tv') || rawType.includes('series')) icon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`;
                        else if (rawType.includes('boxset')) icon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 10-5 10 5-10 5Z"></path><path d="m2 14 10 5 10-5"></path><path d="m2 19 10 5 10-5"></path></svg>`;
                        else if (rawType.includes('music')) icon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;

                        const isFirst = idx === 0;
                        const isLast = idx === list.length - 1;

                        return `
                            <div class="sh-settings-lib-row" data-id="${lib.Id}" data-index="${idx}" draggable="true">
                                <div class="sh-drag-handle" title="Glisser pour réordonner">⠿</div>
                                <div class="sh-lib-manage-reorder" style="margin-right:10px;">
                                    <button class="sh-lib-order-btn sh-cfg-order-up" data-index="${idx}" ${isFirst ? 'disabled' : ''} title="Monter">▲</button>
                                    <button class="sh-lib-order-btn sh-cfg-order-down" data-index="${idx}" ${isLast ? 'disabled' : ''} title="Descendre">▼</button>
                                </div>
                                <div class="sh-settings-lib-info" style="flex:1;">
                                    <span class="sh-settings-lib-icon">${icon}</span>
                                    <div>
                                        <div class="sh-settings-lib-name">${lib.Name}</div>
                                        <div class="sh-settings-lib-type">${lib.CollectionType || lib.Type || 'Dossier'}</div>
                                    </div>
                                </div>
                                <label class="sh-apple-switch">
                                    <input type="checkbox" class="sh-cfg-lib-toggle" data-id="${lib.Id}" ${isVisible ? 'checked' : ''} />
                                    <span class="sh-apple-switch-slider"></span>
                                </label>
                            </div>
                        `;
                    }).join('');

                    libListEl.querySelectorAll('.sh-cfg-lib-toggle').forEach(chk => {
                        chk.addEventListener('change', () => {
                            const libId = chk.dataset.id;
                            if (chk.checked) {
                                hiddenSet.delete(libId);
                            } else {
                                const visibleCount = list.filter(l => !hiddenSet.has(l.Id)).length;
                                if (visibleCount <= 1) {
                                    chk.checked = true;
                                    window.SpaceHub?.ui?.components?.toaster?.warning('Au moins une médiathèque doit rester visible.');
                                    return;
                                }
                                hiddenSet.add(libId);
                            }
                            localStorage.setItem('sh_library_hidden_ids', JSON.stringify(Array.from(hiddenSet)));
                        });
                    });

                    libListEl.querySelectorAll('.sh-cfg-order-up').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const idx = Number(btn.dataset.index);
                            if (idx > 0) {
                                const temp = list[idx];
                                list[idx] = list[idx - 1];
                                list[idx - 1] = temp;
                                orderArr = list.map(l => l.Id);
                                localStorage.setItem('sh_library_order', JSON.stringify(orderArr));
                                renderLibRows();
                            }
                        });
                    });

                    libListEl.querySelectorAll('.sh-cfg-order-down').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const idx = Number(btn.dataset.index);
                            if (idx < list.length - 1) {
                                const temp = list[idx];
                                list[idx] = list[idx + 1];
                                list[idx + 1] = temp;
                                orderArr = list.map(l => l.Id);
                                localStorage.setItem('sh_library_order', JSON.stringify(orderArr));
                                renderLibRows();
                            }
                        });
                    });

                    // Drag and Drop avec la souris
                    let draggedIdx = null;

                    libListEl.querySelectorAll('.sh-settings-lib-row').forEach(row => {
                        row.addEventListener('dragstart', (e) => {
                            draggedIdx = Number(row.dataset.index);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(draggedIdx));
                            requestAnimationFrame(() => row.classList.add('dragging'));
                        });

                        row.addEventListener('dragend', () => {
                            row.classList.remove('dragging');
                            libListEl.querySelectorAll('.sh-settings-lib-row').forEach(r => {
                                r.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
                            });
                        });

                        row.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const targetIdx = Number(row.dataset.index);
                            if (targetIdx === draggedIdx) return;

                            const rect = row.getBoundingClientRect();
                            const isTop = (e.clientY - rect.top) < (rect.height / 2);
                            row.classList.toggle('drag-over-top', isTop);
                            row.classList.toggle('drag-over-bottom', !isTop);
                        });

                        row.addEventListener('dragleave', () => {
                            row.classList.remove('drag-over-top', 'drag-over-bottom');
                        });

                        row.addEventListener('drop', (e) => {
                            e.preventDefault();
                            row.classList.remove('drag-over-top', 'drag-over-bottom');
                            const targetIdx = Number(row.dataset.index);
                            if (draggedIdx === null || draggedIdx === targetIdx) return;

                            const rect = row.getBoundingClientRect();
                            const isTop = (e.clientY - rect.top) < (rect.height / 2);
                            let newIndex = isTop ? targetIdx : targetIdx + 1;
                            if (draggedIdx < newIndex) newIndex--;

                            const [movedItem] = list.splice(draggedIdx, 1);
                            list.splice(newIndex, 0, movedItem);
                            orderArr = list.map(l => l.Id);
                            localStorage.setItem('sh_library_order', JSON.stringify(orderArr));
                            renderLibRows();
                        });
                    });
                };

                renderLibRows();

            }).catch(e => {
                libListEl.innerHTML = '<p style="color:var(--sh-accent-danger,#ff4757); font-size:13px;">Impossible de récupérer les médiathèques.</p>';
            });
        }

        // Enregistrement
        el.querySelector('[data-action="save"]')?.addEventListener('click', () => {
            const s = this._settings;
            if (!s) return;

            s.set('core.logLevel', el.querySelector('#cfg-log-level')?.value);
            s.set('jellyfin.search.enabled', el.querySelector('#cfg-unified-search')?.checked);

            s.set('sonarr.url', el.querySelector('#cfg-sonarr-url')?.value?.trim() || '');
            s.set('sonarr.apiKey', el.querySelector('#cfg-sonarr-key')?.value?.trim() || '');

            s.set('radarr.url', el.querySelector('#cfg-radarr-url')?.value?.trim() || '');
            s.set('radarr.apiKey', el.querySelector('#cfg-radarr-key')?.value?.trim() || '');

            s.set('prowlarr.url', el.querySelector('#cfg-prowlarr-url')?.value?.trim());
            s.set('prowlarr.apiKey', el.querySelector('#cfg-prowlarr-key')?.value?.trim());

            s.set('bazarr.url', el.querySelector('#cfg-bazarr-url')?.value?.trim());
            s.set('bazarr.apiKey', el.querySelector('#cfg-bazarr-key')?.value?.trim());

            s.set('jellyseerr.url', el.querySelector('#cfg-jellyseerr-url')?.value?.trim() || '');
            s.set('jellyseerr.apiKey', el.querySelector('#cfg-jellyseerr-key')?.value?.trim() || '');

            s.set('qbittorrent.url', (el.querySelector('#cfg-qbit-url')?.value || el.querySelector('#cfg-qbittorrent-url')?.value)?.trim());
            s.set('qbittorrent.username', (el.querySelector('#cfg-qbit-user')?.value || el.querySelector('#cfg-qbittorrent-user')?.value)?.trim());
            s.set('qbittorrent.password', el.querySelector('#cfg-qbit-pass')?.value ?? el.querySelector('#cfg-qbittorrent-pass')?.value);

            s.set('notifications.enabled', el.querySelector('#cfg-notif-enabled')?.checked);
            s.set('notifications.browser', el.querySelector('#cfg-notif-browser')?.checked);
            s.set('notifications.discord.enabled', el.querySelector('#cfg-notif-discord-enabled')?.checked);
            s.set('notifications.discord.webhookUrl', el.querySelector('#cfg-notif-discord-url')?.value?.trim());
            s.set('notifications.telegram.enabled', el.querySelector('#cfg-notif-telegram-enabled')?.checked);
            s.set('notifications.telegram.botToken', el.querySelector('#cfg-notif-telegram-token')?.value?.trim());
            s.set('notifications.telegram.chatId', el.querySelector('#cfg-notif-telegram-chatid')?.value?.trim());

            // Mettre à jour tous les services actifs en direct
            window.SpaceHub?.integrations?.sonarr?.api?.updateConfig?.();
            window.SpaceHub?.integrations?.radarr?.api?.updateConfig?.();
            window.SpaceHub?.integrations?.prowlarr?.api?.updateConfig?.();
            window.SpaceHub?.integrations?.bazarr?.api?.updateConfig?.();
            window.SpaceHub?.integrations?.jellyseerr?.api?.updateConfig?.();
            window.SpaceHub?.integrations?.qbittorrent?.api?.updateConfig?.();

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
    height: 540px;
    max-height: 75vh;
}

.sh-settings-nav {
    width: 180px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-1, 4px);
    border-right: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    padding-right: var(--sh-space-4, 16px);
    overflow-y: auto;
}

.sh-settings-nav__item {
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    background: transparent;
    border: none;
    padding: 9px 12px;
    border-radius: 9px;
    color: rgba(255, 255, 255, 0.50);
    font-size: 13px;
    font-weight: 550;
    font-family: inherit;
    cursor: pointer;
    transition: all 140ms ease;
    width: 100%;
}

.sh-settings-nav__item svg {
    flex-shrink: 0;
    opacity: 0.7;
    transition: opacity 140ms ease;
}

.sh-settings-nav__item:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.06);
}
.sh-settings-nav__item:hover svg { opacity: 1; }

.sh-settings-nav__item.active {
    color: #000000;
    background: #ffffff;
    font-weight: 700;
}
.sh-settings-nav__item.active svg { stroke: #000000; opacity: 1; }

.sh-settings-content {
    flex: 1;
    overflow-y: auto;
    height: 100%;
    max-height: 100%;
    padding-right: 8px;
}

.sh-settings-tab { display: none; }
.sh-settings-tab.active {
    display: block;
    animation: sh-settings-tab-in 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes sh-settings-tab-in {
    0%   { opacity: 0; transform: translateY(4px); }
    100% { opacity: 1; transform: translateY(0); }
}

.sh-settings-tab h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
}

.sh-settings-desc {
    margin: 0 0 16px 0;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.40);
}

.sh-form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}

.sh-form-group label {
    font-size: 13px;
    font-weight: 550;
    color: rgba(255, 255, 255, 0.85);
}

.sh-form-row {
    display: flex;
    gap: 8px;
}

.sh-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 12px;
    color: #ffffff;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    color-scheme: dark;
    transition: all 140ms ease;
}

.sh-input:focus {
    border-color: rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.07);
}

select.sh-input {
    color-scheme: dark !important;
    background-color: rgba(20, 20, 26, 0.90) !important;
    color: #ffffff !important;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.10) !important;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 14px center;
    background-size: 16px;
    padding-right: 40px;
}

select.sh-input:focus {
    border-color: rgba(255, 255, 255, 0.40) !important;
}

select.sh-input option {
    background-color: #0f0f14 !important;
    color: #ffffff !important;
    padding: 12px 16px;
}

.sh-theme-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
}

.sh-theme-choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-theme-choice:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
}

.sh-theme-choice.selected {
    border-color: rgba(255, 255, 255, 0.40);
    background: rgba(255, 255, 255, 0.10);
}

.sh-theme-choice__icon { 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    width: 32px; 
    height: 32px; 
    color: #ffffff; 
    opacity: 0.9;
}
.sh-theme-choice__name { font-size: 11px; font-weight: 600; text-align: center; color: #ffffff; }

.sh-integration-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
}

.sh-integration-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.sh-integration-card__header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 650;
    color: #ffffff;
}

/* ── Gestion des Médiathèques dans les Réglages ── */
.sh-settings-libraries-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
}

.sh-settings-lib-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease;
    cursor: default;
}

.sh-settings-lib-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
}

.sh-drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.35);
    cursor: grab;
    user-select: none;
    margin-right: 8px;
    padding: 4px;
    border-radius: 4px;
    transition: all 140ms ease;
}

.sh-drag-handle:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
}

.sh-settings-lib-row:active .sh-drag-handle {
    cursor: grabbing;
}

.sh-settings-lib-row.dragging {
    opacity: 0.35;
    transform: scale(0.98);
    border: 1px dashed rgba(255, 255, 255, 0.45);
    background: rgba(255, 255, 255, 0.02);
}

.sh-settings-lib-row.drag-over-top {
    border-top: 2px solid #ffffff !important;
    box-shadow: 0 -4px 12px rgba(255, 255, 255, 0.35);
}

.sh-settings-lib-row.drag-over-bottom {
    border-bottom: 2px solid #ffffff !important;
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.35);
}

.sh-settings-lib-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sh-settings-lib-icon {
    font-size: 20px;
}

.sh-settings-lib-name {
    font-size: 13.5px;
    font-weight: 650;
    color: #ffffff;
}

.sh-settings-lib-type {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.40);
}

/* ── Apple Switch Toggle ── */
.sh-apple-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 26px;
    flex-shrink: 0;
}

.sh-apple-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.sh-apple-switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.20);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 9999px;
}

.sh-apple-switch-slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 2px;
    bottom: 2px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-apple-switch input:checked + .sh-apple-switch-slider {
    background: #34c759;
    border-color: #34c759;
    box-shadow: 0 0 12px rgba(52, 199, 89, 0.45);
}

.sh-apple-switch input:checked + .sh-apple-switch-slider:before {
    transform: translateX(18px);
}
        `;
        document.head.appendChild(style);
    }
}

export default SettingsPanel;
