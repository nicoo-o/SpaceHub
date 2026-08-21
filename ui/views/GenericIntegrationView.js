/**
 * SpaceHub — Generic Integration View
 * Version: 1.1.0
 *
 * Vue de base pour les intégrations (Sonarr, Radarr, etc.).
 * Affiche l'état du service et incorpore automatiquement les widgets
 * associés trouvés dans le Dashboard.
 */

'use strict';

import Logger from '../../core/Logger.js';

class GenericIntegrationView {
    constructor(id, name, icon) {
        this.id = id;
        this.name = name;
        this.icon = icon;
        this._log = new Logger(`${name}View`);
    }

    get _service() {
        return window.SpaceHub?.integrations[this.id];
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-integration-page sh-scrollbar">
                <header class="sh-integration-header">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <span style="font-size:32px;">${this.icon}</span>
                        <div>
                            <h1 style="margin:0; font-size:24px;">${this.name}</h1>
                            <div id="${this.id}-status-badge" class="sh-status-badge">Vérification du statut...</div>
                        </div>
                    </div>
                    <div class="sh-integration-actions">
                        <button class="sh-btn sh-btn--ghost" id="btn-refresh-${this.id}">🔄 Actualiser</button>
                        <button class="sh-btn sh-btn--primary" id="btn-open-external-${this.id}">🌐 Ouvrir l'interface</button>
                    </div>
                </header>

                <div class="sh-integration-grid" id="${this.id}-grid">
                    <!-- Les widgets seront injectés ici -->
                </div>
            </div>
        `;

        this._bindEvents(container);
        this._checkStatus(container);
        this._renderWidgets(container);
    }

    _bindEvents(container) {
        container.querySelector(`#btn-refresh-${this.id}`)?.addEventListener('click', () => this.render(container));
        container.querySelector(`#btn-open-external-${this.id}`)?.addEventListener('click', () => {
            const url = window.SpaceHub?.core?.settings?.get(`${this.id}.url`);
            if (url) window.open(url, '_blank');
        });
    }

    async _checkStatus(container) {
        const badge = container.querySelector(`#${this.id}-status-badge`);
        if (!badge) return;

        try {
            const result = await this._service?.api?.testConnection();
            if (result?.success) {
                badge.innerHTML = `<span style="color:var(--sh-color-success, #4ade80);">● En ligne</span> <small style="color:var(--sh-text-muted); margin-left:8px;">v${result.version || '?'}</small>`;
            } else {
                badge.innerHTML = `<span style="color:var(--sh-color-danger, #ff5c7a);">● Hors ligne</span> <small style="color:var(--sh-text-muted); margin-left:8px;">${result?.error || 'Erreur inconnue'}</small>`;
            }
        } catch (err) {
            badge.innerHTML = `<span style="color:var(--sh-color-danger, #ff5c7a);">● Erreur</span>`;
        }
    }

    async _renderWidgets(container) {
        const grid = container.querySelector(`#${this.id}-grid`);
        if (!grid) return;

        const dashboard = window.SpaceHub?.ui?.dashboard;
        if (!dashboard) return;

        const widgetTypes = dashboard.getRegisteredWidgetTypes().filter(t => t.startsWith(this.id));

        if (widgetTypes.length === 0) {
            grid.innerHTML = `<p style="color:var(--sh-text-muted); padding:20px;">Interface complète de gestion en cours de développement.</p>`;
            return;
        }

        grid.innerHTML = '';
        for (const type of widgetTypes) {
            const WidgetClass = dashboard.getWidgetClass(type);
            if (WidgetClass) {
                const wContainer = document.createElement('div');
                wContainer.className = 'sh-view-widget-container';
                grid.appendChild(wContainer);
                const widget = new WidgetClass();
                await widget.render(wContainer);
            }
        }
    }
}

export default GenericIntegrationView;
