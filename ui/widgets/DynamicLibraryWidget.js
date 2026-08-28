/**
 * SpaceHub — Dynamic Library Shelf Widget
 * Version: 1.0.0
 *
 * Widget générique qui affiche les derniers ajouts d'une bibliothèque Jellyfin
 * spécifique. Créé dynamiquement par le Dashboard pour chaque bibliothèque
 * non couverte par un widget dédié (Films, Séries, Anime, Musique, Collections).
 */

'use strict';

class DynamicLibraryWidget {
    /**
     * @param {Object} libraryView - Objet view Jellyfin { Id, Name, CollectionType, ... }
     */
    constructor(libraryView = {}) {
        this.libraryId = libraryView.Id || '';
        this.id = `dynamic-library-${this.libraryId}`;
        this.title = libraryView.Name || 'Bibliothèque';
        this.collectionType = (libraryView.CollectionType || '').toLowerCase();
        this.defaultColSpan = 12;
    }

    async render(container) {
        // Déterminer l'icône SVG en fonction du type de collection
        let iconSvg;
        switch (this.collectionType) {
            case 'movies':
                iconSvg = '<rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line>';
                break;
            case 'tvshows':
                iconSvg = '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>';
                break;
            case 'music':
                iconSvg = '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>';
                break;
            case 'books':
                iconSvg = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>';
                break;
            case 'homevideos':
            case 'photos':
                iconSvg = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>';
                break;
            default:
                iconSvg = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>';
                break;
        }

        container.innerHTML = `
            <div class="sh-widget sh-widget--dynamic-library" data-library-id="${this.libraryId}">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            ${iconSvg}
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

            if (apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({
                        ParentId: this.libraryId,
                        Recursive: true,
                        Limit: 24,
                        SortBy: 'DateCreated',
                        SortOrder: 'Descending'
                    });
                    items = response?.Items || [];
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur apiClient.getItems:`, e);
                }
            }

            if ((!items || items.length === 0) && api?.getItems) {
                try {
                    const response = await api.getItems({
                        parentId: this.libraryId,
                        recursive: true,
                        limit: 24,
                        sortBy: 'DateCreated',
                        sortOrder: 'Descending'
                    });
                    items = response?.Items || response || [];
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur api.getItems:`, e);
                }
            }

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
            console.error(`[DynamicLibraryWidget:${this.title}] Erreur:`, err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default DynamicLibraryWidget;
