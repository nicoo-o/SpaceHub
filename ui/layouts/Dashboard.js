/**
 * SpaceHub — Dashboard Layout Manager
 * Version: 0.4.0
 *
 * Gestionnaire de tableau de bord modulaire.
 * Gère une grille responsive de widgets, le réordonnancement, l'ajout/suppression,
 * et la persistance de l'agencement via SettingsManager.
 *
 * Usage:
 *   const dashboard = new Dashboard({
 *       containerId: 'spacehub-dashboard',
 *       settings: SpaceHub.core.settings,
 *       eventBus: SpaceHub.core.eventBus
 *   });
 *   dashboard.registerWidget('continue-watching', ContinueWatchingWidget);
 *   dashboard.registerWidget('latest-additions', LatestAdditionsWidget);
 *   await dashboard.render();
 */

'use strict';

import Logger from '../../core/Logger.js';

class Dashboard {
    /**
     * @param {{
     *   containerId?: string,
     *   settings?: import('../../core/SettingsManager.js').default,
     *   eventBus?: import('../../core/EventBus.js').default,
     * }} [options]
     */
    constructor(options = {}) {
        this.containerId = options.containerId || 'sh-dashboard';
        this._settings   = options.settings || window.SpaceHub?.core?.settings || null;
        this._eventBus   = options.eventBus || window.SpaceHub?.core?.eventBus || null;
        this._log        = new Logger('Dashboard');

        /** @type {Map<string, typeof Object>} Widget Class Registry */
        this._registeredWidgets = new Map();

        /** @type {Map<string, Object>} Active widget instances (instanceId -> instance) */
        this._activeWidgets = new Map();

        /** @type {HTMLElement|null} */
        this._container = null;

        this._registerDefaults();
        this._injectStyles();
        this._log.info('Initialisé.');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Vérifie si l'utilisateur actuel a la permission de voir un widget.
     * @param {string} widgetId
     * @returns {boolean}
     */
    hasPermission(widgetId) {
        // L'admin peut tout voir
        const user = this._auth?.getUser();
        if (user?.Policy?.IsAdministrator) return true;

        // Pour les autres, on vérifie dans les réglages (gérés par l'admin)
        // Format: 'admin.permissions.widgets.id'
        const allowed = this._settings?.get(`admin.permissions.widgets.${widgetId}`, true);
        return !!allowed;
    }

    _registerDefaults() {
        if (!this._settings) return;
        this._settings.registerDefaults({
            'admin.permissions.widgets.sonarr-upcoming': true,
            'admin.permissions.widgets.sonarr-queue': true,
            'admin.permissions.widgets.radarr-upcoming': true,
            'admin.permissions.widgets.radarr-queue': true,
            'admin.permissions.widgets.prowlarr-status': true,
            'admin.permissions.widgets.bazarr-wanted': true,
            'admin.permissions.widgets.jellyseerr-requests': true,
            'admin.permissions.widgets.jellyseerr-trending': true,
            'admin.permissions.widgets.qbittorrent-speed': true,
            'admin.permissions.widgets.qbittorrent-active': true,
            'admin.permissions.widgets.immich-souvenirs': true,
            'admin.permissions.widgets.lidarr-upcoming': true,
            'admin.permissions.widgets.lidarr-queue': true,
            'admin.permissions.widgets.active-sessions': true,
            'admin.permissions.widgets.server-health': true
        });
    }

    // ─── Enregistrement des Widgets ───────────────────────────────────────────

    /**
     * Enregistre une classe de widget disponible pour le dashboard.
     * @param {string} id - Identifiant du type de widget (ex: 'continue-watching')
     * @param {typeof Object} WidgetClass
     */
    registerWidget(id, WidgetClass) {
        if (this._registeredWidgets.has(id)) {
            this._log.warn(`Widget "${id}" déjà enregistré. Remplacement.`);
        }
        this._registeredWidgets.set(id, WidgetClass);
        this._log.debug(`Widget type enregistré : "${id}"`);
    }

    /**
     * Retourne tous les types de widgets enregistrés.
     * @returns {string[]}
     */
    getRegisteredWidgetTypes() {
        return [...this._registeredWidgets.keys()];
    }

    // ─── Rendu & Cycle de vie ──────────────────────────────────────────────────

    /**
     * Monte et rend le Dashboard dans le DOM.
     * @param {HTMLElement|string} [target] - Élément ou sélecteur cible
     */
    async render(target = null) {
        if (target) {
            this._container = typeof target === 'string' ? document.querySelector(target) : target;
        }

        if (!this._container) {
            this._container = document.getElementById(this.containerId);
            if (!this._container) {
                this._container = document.createElement('div');
                this._container.id = this.containerId;
                const mainContent = document.querySelector('.mainAnimatedPages') || document.querySelector('.page') || document.body;
                mainContent.prepend(this._container);
            }
        }

        this._container.className = 'sh-dashboard sh-scrollbar';
        this._container.innerHTML = `
            <header class="sh-dashboard__header">
                <div class="sh-dashboard__titles">
                    <h1 class="sh-dashboard__title">Tableau de bord</h1>
                    <p class="sh-dashboard__subtitle">Bienvenue sur SpaceHub Media Center</p>
                </div>
                <div class="sh-dashboard__actions">
                    <button class="sh-btn sh-btn--ghost sh-dashboard__btn-refresh" title="Actualiser le dashboard">🔄 Actualiser</button>
                    <button class="sh-btn sh-btn--ghost sh-dashboard__btn-customize" title="Personnaliser">⚙️ Personnaliser</button>
                </div>
            </header>
            <div class="sh-dashboard__grid" id="${this.containerId}-grid"></div>
        `;

        // Événements d'en-tête
        this._container.querySelector('.sh-dashboard__btn-refresh')?.addEventListener('click', () => this.refreshAll());
        this._container.querySelector('.sh-dashboard__btn-customize')?.addEventListener('click', () => this._openCustomizeModal());

        await this._loadLayout();
    }

    /**
     * Charge l'agencement sauvegardé ou applique l'agencement par défaut.
     */
    /**
     * Agencement par défaut du dashboard — utilisé à la fois par _loadLayout()
     * (premier affichage) et _openCustomizeModal() (pour que les cases à cocher
     * reflètent l'état réel affiché, même avant toute sauvegarde explicite).
     */
    _getDefaultLayout() {
        return [
            { widgetType: 'quick-actions', colSpan: 12 },
            { widgetType: 'continue-watching', colSpan: 12 },
            { widgetType: 'latest-additions', colSpan: 12 },
        ];
    }

    async _loadLayout() {
        const gridEl = this._container.querySelector(`#${this.containerId}-grid`);
        if (!gridEl) return;

        gridEl.innerHTML = '';
        this._activeWidgets.clear();

        // Récupération de la config sauvegardée ou des valeurs par défaut
        const defaultLayout = this._getDefaultLayout();

        let layout = this._settings?.get('dashboard.layout', defaultLayout) || defaultLayout;

        // Filtrage des widgets selon les permissions admin
        layout = layout.filter(item => this.hasPermission(item.widgetType));

        for (const item of layout) {
            const WidgetClass = this._registeredWidgets.get(item.widgetType);
            if (!WidgetClass) {
                this._log.warn(`Type de widget inconnu dans l'agencement : "${item.widgetType}"`);
                continue;
            }

            await this._mountWidget(WidgetClass, item, gridEl);
        }
    }

    /**
     * Instancie et monte un widget dans la grille.
     */
    async _mountWidget(WidgetClass, itemConfig, gridEl) {
        const widget = new WidgetClass();
        const instanceId = `sh-widget-${widget.id || itemConfig.widgetType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        const colSpan = itemConfig.colSpan || widget.defaultColSpan || 12;
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = `sh-dashboard__item sh-dashboard__item--col-${colSpan}`;
        widgetWrapper.dataset.widgetType = itemConfig.widgetType;
        widgetWrapper.dataset.instanceId = instanceId;

        gridEl.appendChild(widgetWrapper);

        try {
            if (typeof widget.render === 'function') {
                await widget.render(widgetWrapper);
            }
            this._activeWidgets.set(instanceId, { widget, element: widgetWrapper, config: itemConfig });
        } catch (err) {
            this._log.error(`Erreur lors du rendu du widget "${itemConfig.widgetType}":`, err);
            widgetWrapper.innerHTML = `
                <div class="sh-widget-error">
                    <p>⚠️ Erreur lors du chargement du widget : <strong>${itemConfig.widgetType}</strong></p>
                </div>
            `;
        }
    }

    /**
     * Actualise toutes les données des widgets actifs.
     */
    async refreshAll() {
        this._log.info('Actualisation de tous les widgets...');
        const promises = [];
        for (const { widget, element } of this._activeWidgets.values()) {
            if (typeof widget.refresh === 'function') {
                promises.push(widget.refresh(element));
            } else if (typeof widget.render === 'function') {
                promises.push(widget.render(element));
            }
        }
        await Promise.allSettled(promises);
        window.SpaceHub?.ui?.components?.toaster?.success('Dashboard actualisé !');
    }

    // ─── Modal de personnalisation ────────────────────────────────────────────

    _openCustomizeModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const available = this.getRegisteredWidgetTypes();
        const currentLayout = this._settings?.get('dashboard.layout', this._getDefaultLayout()) || this._getDefaultLayout();

        const modal = new Modal({
            id: 'customize-dashboard',
            title: 'Personnaliser le Dashboard',
            size: 'md',
            content: `
                <div class="sh-dashboard-config">
                    <p style="margin-top:0; color:var(--sh-text-secondary);">Activez ou réordonnez les blocs affichés sur votre page d'accueil SpaceHub.</p>
                    <div class="sh-dashboard-config__list">
                        ${available.map(type => {
                            const isEnabled = currentLayout.some(i => i.widgetType === type);
                            return `
                                <label class="sh-dashboard-config__item">
                                    <input type="checkbox" data-widget-type="${type}" ${isEnabled ? 'checked' : ''} />
                                    <span>${type.replace(/-/g, ' ').toUpperCase()}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="cancel">Annuler</button>
                <button class="sh-btn sh-btn--primary" data-action="save">Enregistrer</button>
            `,
            onOpen: (m) => {
                m._el.querySelector('[data-action="cancel"]').addEventListener('click', () => m.close());
                m._el.querySelector('[data-action="save"]').addEventListener('click', () => {
                    const checkboxes = m._el.querySelectorAll('input[data-widget-type]');
                    const newLayout = [];
                    checkboxes.forEach(cb => {
                        if (cb.checked) {
                            newLayout.push({ widgetType: cb.dataset.widgetType, colSpan: 12 });
                        }
                    });
                    this._settings?.set('dashboard.layout', newLayout);
                    this._loadLayout();
                    window.SpaceHub?.ui?.components?.toaster?.success('Agencement enregistré !');
                    m.close();
                });
            }
        });
        modal.open();
    }

    // ─── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById('sh-dashboard-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-dashboard-styles';
        style.textContent = `
.sh-dashboard {
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: var(--sh-space-6, 24px) var(--sh-space-6, 24px) var(--sh-space-12, 48px);
    box-sizing: border-box;
    font-family: var(--sh-font-family, sans-serif);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-dashboard__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: var(--sh-space-6, 24px);
    padding-bottom: var(--sh-space-4, 16px);
    border-bottom: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    flex-wrap: wrap;
    gap: var(--sh-space-4, 16px);
}

.sh-dashboard__title {
    margin: 0;
    font-size: var(--sh-text-2xl, 30px);
    font-weight: var(--sh-font-bold, 700);
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, var(--sh-text-primary, #fff), var(--sh-color-primary, #7c6aff));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.sh-dashboard__subtitle {
    margin: var(--sh-space-1, 4px) 0 0;
    color: var(--sh-text-secondary, #9898b8);
    font-size: var(--sh-text-sm, 13px);
}

.sh-dashboard__actions {
    display: flex;
    gap: var(--sh-space-2, 8px);
}

/* Grille de widgets */
.sh-dashboard__grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sh-space-6, 24px);
}

.sh-dashboard__item {
    display: flex;
    flex-direction: column;
    grid-column: span 12;
}

.sh-dashboard__item--col-12 { grid-column: span 12; }
.sh-dashboard__item--col-6  { grid-column: span 6; }
.sh-dashboard__item--col-4  { grid-column: span 4; }

@media (max-width: 900px) {
    .sh-dashboard__item--col-6,
    .sh-dashboard__item--col-4 {
        grid-column: span 12;
    }
}

/* Base Widget Container */
.sh-widget {
    background: var(--sh-bg-surface, #18181f);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-lg, 16px);
    padding: var(--sh-space-5, 20px);
    box-shadow: var(--sh-shadow-md, 0 4px 16px rgba(0,0,0,0.5));
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-4, 16px);
    position: relative;
    overflow: hidden;
}

.sh-widget__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sh-widget__title {
    margin: 0;
    font-size: var(--sh-text-lg, 20px);
    font-weight: var(--sh-font-semibold, 600);
    color: var(--sh-text-primary, #f0f0f8);
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
}

.sh-widget__content {
    flex: 1;
}

.sh-widget-error {
    background: rgba(255, 92, 122, 0.1);
    border: 1px solid var(--sh-color-danger, #ff5c7a);
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-4, 16px);
    color: var(--sh-color-danger, #ff5c7a);
}

.sh-dashboard-config__list {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-3, 12px);
    margin-top: var(--sh-space-4, 16px);
}

.sh-dashboard-config__item {
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    padding: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border-radius: var(--sh-radius-sm, 8px);
    cursor: pointer;
}

/* Widgets Spécifiques */
.sh-souvenirs-grid {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
}

.sh-souvenir-card {
    flex: 0 0 180px;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background: var(--sh-bg-surface-3);
}

.sh-souvenir-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
        `;
        document.head.appendChild(style);
    }
}

export default Dashboard;
