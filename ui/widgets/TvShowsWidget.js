/**
 * SpaceHub — TV Shows Shelf Widget
 * Version: 1.1.0
 *
 * Affiche la section des Séries TV sur le Dashboard.
 */

'use strict';

class TvShowsWidget {
    constructor() {
        this.id = 'tv-shows';
        this.title = 'Séries TV';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--tv-shows">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect>
                            <polyline points="17 2 12 7 7 2"></polyline>
                        </svg>
                        <span>${this.title}</span>
                    </h2>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container"></div>
                </div>
            </div>
        `;

        const contentEl = container.querySelector('.sh-widget__items-container');
        const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;

        if (cardBuilder) {
            contentEl.appendChild(cardBuilder.createSkeletonGrid(6, 'poster'));
        }

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const api = window.SpaceHub?.jellyfin?.api;
            const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
            let items = [];

            if (api?.getSeries) {
                try {
                    items = await api.getSeries({ limit: 48 });
                } catch (e) {
                    console.warn('[TvShowsWidget] Erreur api.getSeries:', e);
                }
            }
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({ IncludeItemTypes: 'Series', Recursive: true, Limit: 48, SortBy: 'DateCreated', SortOrder: 'Descending' });
                    items = response?.Items || [];
                } catch (e) {
                    console.warn('[TvShowsWidget] Erreur apiClient.getItems:', e);
                }
            }

            // Si aucune série disponible, masquer proprement le bloc sans afficher de données démo factices
            if (!items || items.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = '';
            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'poster',
                    getImageUrl: (item) => api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) || apiClient?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) || '',
                    onClick: (item) => {
                        if (window.SpaceHub?.ui?.modalSlideUpSheet) {
                            window.SpaceHub.ui.modalSlideUpSheet.open(item);
                        } else if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(item.Id);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[TvShowsWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default TvShowsWidget;
