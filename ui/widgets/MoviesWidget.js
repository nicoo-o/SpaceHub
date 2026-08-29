/**
 * SpaceHub — Movies Shelf Widget
 * Version: 1.0.0
 *
 * Affiche la section des Films & Cinéma sur le Dashboard.
 */

'use strict';

class MoviesWidget {
    constructor() {
        this.id = 'movies';
        this.title = 'Films';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--movies">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect>
                            <line x1="7" y1="2" x2="7" y2="22"></line>
                            <line x1="17" y1="2" x2="17" y2="22"></line>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <line x1="2" y1="7" x2="7" y2="7"></line>
                            <line x1="2" y1="17" x2="7" y2="17"></line>
                            <line x1="17" y1="17" x2="22" y2="17"></line>
                            <line x1="17" y1="7" x2="22" y2="7"></line>
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

            if (api?.getMovies) {
                try {
                    items = await api.getMovies({ limit: 48, sortBy: 'DateCreated', sortOrder: 'Descending' });
                } catch (e) {
                    console.warn('[MoviesWidget] Erreur api.getMovies:', e);
                }
            }
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({ IncludeItemTypes: 'Movie', Recursive: true, Limit: 48, SortBy: 'DateCreated', SortOrder: 'Descending' });
                    items = response?.Items || [];
                } catch (e) {
                    console.warn('[MoviesWidget] Erreur apiClient.getItems:', e);
                }
            }

            // Si aucun film disponible, masquer proprement le bloc sans afficher de données démo factices
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
            console.error('[MoviesWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default MoviesWidget;
