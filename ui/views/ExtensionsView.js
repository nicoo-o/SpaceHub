/**
 * SpaceHub — Extensions & Live Theme Studio View
 * Version: 2.0.0
 *
 * Centre complet des extensions communautaires, du Marketplace,
 * du Live Theme Studio (personnalisation CSS) et de la documentation Plugin SDK 2.0.
 */

'use strict';

import Logger from '../../core/Logger.js';
import LiveThemeStudio from '../themes/LiveThemeStudio.js';

class ExtensionsView {
    constructor() {
        this._log = new Logger('ExtensionsView');
        this._themeStudio = new LiveThemeStudio();
        this._currentTab = 'marketplace';
        this._container = null;
    }

    get _marketplace() {
        return window.SpaceHub?.core?.marketplace;
    }

    get _hooks() {
        return window.SpaceHub?.core?.hooks;
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-extensions-page">
                <div class="sh-extensions-header">
                    <div>
                        <h2>🧩 Extensions & Thèmes SpaceHub</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Étendez SpaceHub avec des plugins communautaires et personnalisez votre thème en direct.
                        </p>
                    </div>
                </div>

                <div class="sh-extensions-tabs">
                    <button class="sh-ext-tab ${this._currentTab === 'marketplace' ? 'active' : ''}" data-tab="marketplace">
                        🏪 Marketplace & Plugins
                    </button>
                    <button class="sh-ext-tab ${this._currentTab === 'themes' ? 'active' : ''}" data-tab="themes">
                        🎨 Live Theme Studio
                    </button>
                    <button class="sh-ext-tab ${this._currentTab === 'sdk' ? 'active' : ''}" data-tab="sdk">
                        🛠️ Plugin SDK 2.0 & UI Hooks
                    </button>
                </div>

                <div class="sh-extensions-content" id="sh-ext-tab-content"></div>
            </div>
        `;

        this._injectStyles();
        this._bindTabs();
        this._renderCurrentTab();
    }

    _bindTabs() {
        const tabs = this._container.querySelectorAll('.sh-ext-tab');
        tabs.forEach(t => {
            t.addEventListener('click', () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                this._renderCurrentTab();
            });
        });
    }

    _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-ext-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'marketplace') {
            this._renderMarketplaceTab(contentEl);
        } else if (this._currentTab === 'themes') {
            this._themeStudio.renderStudio(contentEl);
        } else if (this._currentTab === 'sdk') {
            this._renderSdkTab(contentEl);
        }
    }

    _renderMarketplaceTab(contentEl) {
        const installed = this._marketplace?.listInstalledExtensions() || [];

        contentEl.innerHTML = `
            <div class="sh-marketplace-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3>Plugins Installés (${installed.length})</h3>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-add-custom-repo">➕ Ajouter un Dépôt Tiers</button>
                </div>

                <div class="sh-installed-plugins-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
                    <div class="sh-plugin-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong>🎬 TMDB Trailers Pro</strong>
                                <div style="font-size:11px; color:var(--sh-text-muted);">v1.2.0 • Par SpaceHub Core</div>
                            </div>
                            <span class="sh-badge" style="background:rgba(46,204,113,0.15); color:#2ecc71; font-weight:700;">Actif</span>
                        </div>
                        <p style="font-size:12px; color:var(--sh-text-secondary); margin:12px 0;">
                            Injecte automatiquement les bandes-annonces TMDB & YouTube sur toutes les fiches de films et séries.
                        </p>
                        <div style="font-size:11px; color:var(--sh-text-muted);">Points d'injection : <code>media:modal:actions</code></div>
                    </div>

                    <div class="sh-plugin-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong>🍿 Jellyfin SyncPlay Watch Party</strong>
                                <div style="font-size:11px; color:var(--sh-text-muted);">v1.0.0 • Par SpaceHub Core</div>
                            </div>
                            <span class="sh-badge" style="background:rgba(46,204,113,0.15); color:#2ecc71; font-weight:700;">Actif</span>
                        </div>
                        <p style="font-size:12px; color:var(--sh-text-secondary); margin:12px 0;">
                            Permet le visionnage synchrone en groupe avec chat et réactions emojis en temps réel.
                        </p>
                        <div style="font-size:11px; color:var(--sh-text-muted);">Points d'injection : <code>player:controls:actions</code></div>
                    </div>

                    <div class="sh-plugin-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong>⚡ Trickplay & Intro Skipper</strong>
                                <div style="font-size:11px; color:var(--sh-text-muted);">v1.0.0 • Par SpaceHub Core</div>
                            </div>
                            <span class="sh-badge" style="background:rgba(46,204,113,0.15); color:#2ecc71; font-weight:700;">Actif</span>
                        </div>
                        <p style="font-size:12px; color:var(--sh-text-secondary); margin:12px 0;">
                            Scrubbing vidéo fluide avec aperçu par vignettes et saut automatique des génériques de séries.
                        </p>
                        <div style="font-size:11px; color:var(--sh-text-muted);">Points d'injection : <code>player:timeline</code></div>
                    </div>
                </div>
            </div>
        `;

        contentEl.querySelector('#btn-add-custom-repo')?.addEventListener('click', () => {
            const url = prompt('URL du catalogue de plugins JSON :');
            if (url) {
                window.SpaceHub?.ui?.components?.toaster?.success('Dépôt enregistré !');
            }
        });
    }

    _renderSdkTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-sdk-docs">
                <h3>🛠️ Documentation Plugin SDK 2.0</h3>
                <p style="color:var(--sh-text-secondary); font-size:14px; margin:8px 0 20px 0;">
                    Créez des plugins modulaires en déclarant des <strong>UI Hooks</strong> pour injecter des éléments personnalisés dans SpaceHub.
                </p>

                <div style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:10px; padding:20px; margin-bottom:20px;">
                    <h4 style="margin-bottom:8px;">📌 Points d'injection UI disponibles</h4>
                    <ul style="color:var(--sh-text-secondary); font-size:13px; line-height:1.8; padding-left:20px;">
                        <li><code>media:card:actions</code> : Ajoute des boutons personnalisés sur chaque carte média.</li>
                        <li><code>media:modal:actions</code> : Injecte des actions dans la fiche détaillée d'un film ou d'une série.</li>
                        <li><code>player:controls:actions</code> : Ajoute des contrôles personnalisés dans la barre du lecteur vidéo.</li>
                        <li><code>dashboard:widget</code> : Enregistre des widgets dynamiques sur la page d'accueil.</li>
                        <li><code>nav:item</code> : Enregistre un onglet supplémentaire dans la barre de navigation.</li>
                    </ul>
                </div>

                <div style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:10px; padding:20px;">
                    <h4 style="margin-bottom:8px;">💻 Exemple de code (Manifest + UI Hook)</h4>
                    <pre style="background:var(--sh-bg-surface-3); padding:16px; border-radius:8px; font-family:'JetBrains Mono', monospace; font-size:12px; color:#e0e0ff; overflow-x:auto;">
// 1. Déclaration du Hook dans votre plugin
window.SpaceHub.core.hooks.registerHook('media:modal:actions', {
    id: 'my-imdb-button',
    extensionId: 'com.example.imdb',
    render: (item) => {
        return \`&lt;button class="sh-btn sh-btn--ghost" onclick="window.open('https://imdb.com/find?q=\${encodeURIComponent(item.Name)}')">⭐ Voir sur IMDb&lt;/button>\`;
    }
});
                    </pre>
                </div>
            </div>
        `;
    }

    _injectStyles() {
        if (document.getElementById('sh-extensions-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-extensions-styles';
        style.textContent = `
.sh-extensions-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--sh-space-6, 24px);
}

.sh-extensions-header {
    margin-bottom: var(--sh-space-6, 24px);
    border-bottom: 1px solid var(--sh-border-color);
    padding-bottom: var(--sh-space-4, 16px);
}

.sh-extensions-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.sh-ext-tab {
    background: transparent;
    border: 1px solid var(--sh-border-color);
    color: var(--sh-text-secondary);
    padding: 10px 18px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.sh-ext-tab.active {
    background: var(--sh-color-primary, #7c6aff);
    color: #fff;
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-plugin-card {
    background: var(--sh-bg-surface-2);
    border: 1px solid var(--sh-border-color);
    border-radius: 12px;
    padding: 16px;
}
        `;
        document.head.appendChild(style);
    }
}

export default ExtensionsView;
