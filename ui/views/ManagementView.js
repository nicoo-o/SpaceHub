/**
 * SpaceHub — Management View
 * Version: 1.0.0
 *
 * Page dédiée par service *arr (Sonarr, Radarr, Prowlarr, Bazarr, qBittorrent).
 * Réutilise les widgets déjà construits pour le Dashboard (UpcomingEpisodesWidget,
 * SonarrQueueWidget, etc.) plutôt que de dupliquer la logique d'affichage —
 * ils exposent déjà tous render(container), donc on peut les monter tels quels
 * dans une page complète plutôt que dans une case du dashboard.
 */

'use strict';

import Logger from '../../core/Logger.js';

import { UpcomingEpisodesWidget, SonarrQueueWidget } from '../../integrations/sonarr/SonarrWidgets.js';
import { UpcomingMoviesWidget, RadarrQueueWidget } from '../../integrations/radarr/RadarrWidgets.js';
import { ProwlarrStatusWidget } from '../../integrations/prowlarr/ProwlarrWidgets.js';
import { BazarrWantedWidget } from '../../integrations/bazarr/BazarrWidgets.js';
import { QBittorrentSpeedWidget, QBittorrentActiveWidget } from '../../integrations/qbittorrent/QBittorrentWidgets.js';

const SERVICES = [
    { id: 'sonarr', label: '📺 Sonarr', widgets: [UpcomingEpisodesWidget, SonarrQueueWidget] },
    { id: 'radarr', label: '🎬 Radarr', widgets: [UpcomingMoviesWidget, RadarrQueueWidget] },
    { id: 'prowlarr', label: '🔗 Prowlarr', widgets: [ProwlarrStatusWidget] },
    { id: 'bazarr', label: '💬 Bazarr', widgets: [BazarrWantedWidget] },
    { id: 'qbittorrent', label: '⬇️ qBittorrent', widgets: [QBittorrentSpeedWidget, QBittorrentActiveWidget] },
];

class ManagementView {
    constructor() {
        this._log = new Logger('ManagementView');
    }

    /**
     * @param {HTMLElement} container
     * @param {string|null} subpath - id du service actif (ex: 'sonarr'), ou null
     */
    async render(container, subpath = null) {
        const activeId = SERVICES.some(s => s.id === subpath) ? subpath : SERVICES[0].id;

        container.innerHTML = `
            <div class="sh-management">
                <h1>⚙️ Management</h1>
                <nav class="sh-management__tabs">
                    ${SERVICES.map(s => `
                        <button class="sh-management__tab ${s.id === activeId ? 'active' : ''}" data-service="${s.id}">
                            ${s.label}
                        </button>
                    `).join('')}
                </nav>
                <div id="sh-management-content" class="sh-management__content"></div>
            </div>
        `;

        this._injectStyles();

        container.querySelectorAll('.sh-management__tab').forEach(btn => {
            btn.addEventListener('click', () => {
                window.SpaceHub?.router?.navigate(`/management/${btn.dataset.service}`);
            });
        });

        await this._renderService(container, activeId);
    }

    async _renderService(container, serviceId) {
        const service = SERVICES.find(s => s.id === serviceId);
        const content = container.querySelector('#sh-management-content');
        if (!service || !content) return;

        const configured = !!window.SpaceHub?.integrations?.[serviceId];
        if (!configured) {
            content.innerHTML = `
                <div class="sh-management__empty">
                    <p>${service.label} n'est pas encore configuré.</p>
                    <button class="sh-btn sh-btn--primary" id="sh-management-open-settings">Configurer dans les réglages</button>
                </div>
            `;
            content.querySelector('#sh-management-open-settings')?.addEventListener('click', () => {
                window.SpaceHub?.ui?.settingsPanel?.open();
            });
            return;
        }

        content.innerHTML = '';
        for (const WidgetClass of service.widgets) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sh-management__widget';
            content.appendChild(wrapper);
            try {
                const widget = new WidgetClass();
                await widget.render(wrapper);
            } catch (err) {
                this._log.error(`Erreur rendu widget de ${serviceId}:`, err);
                wrapper.innerHTML = `<p class="sh-text-muted">Erreur de chargement de ce module.</p>`;
            }
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-management-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-management-styles';
        style.textContent = `
.sh-management { max-width: 1000px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-management__tabs { display:flex; gap: var(--sh-space-2, 8px); margin: var(--sh-space-5, 20px) 0; flex-wrap: wrap; }
.sh-management__tab { background: var(--sh-bg-surface-2, #22222e); border: none; padding: var(--sh-space-2, 8px) var(--sh-space-4, 16px); border-radius: var(--sh-radius-sm, 8px); color: var(--sh-text-secondary); cursor: pointer; font-weight: 500; }
.sh-management__tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; }
.sh-management__widget { margin-bottom: var(--sh-space-5, 20px); }
.sh-management__empty { text-align:center; padding: var(--sh-space-8, 32px); color: var(--sh-text-secondary); }
.sh-text-muted { color: var(--sh-text-muted, #5c5c7a); }
        `;
        document.head.appendChild(style);
    }
}

export default ManagementView;
