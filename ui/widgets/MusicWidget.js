/**
 * SpaceHub — Music Shelf Widget
 * Version: 1.1.0
 *
 * Affiche la section Musique sur le Dashboard.
 */

'use strict';


import * as svc from '../../core/services.js';
class MusicWidget {
    constructor() {
        this.id = 'music-soundtracks';
        this.title = 'Musique';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--music">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
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
        const cardBuilder = svc.cardBuilder();

        if (cardBuilder) {
            contentEl.appendChild(cardBuilder.createSkeletonGrid(6, 'poster'));
        }

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const api = svc.jellyfinApi();
            const apiClient = svc.api()?.getClient('jellyfin');
            let items = [];

            if (api?.getMusicAlbums) {
                try {
                    items = await api.getMusicAlbums({ limit: 18 });
                } catch (e) {
                    console.warn('[MusicWidget] Erreur api.getMusicAlbums:', e);
                }
            }
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({ IncludeItemTypes: 'MusicAlbum', Recursive: true, Limit: 18, SortBy: 'SortName', SortOrder: 'Ascending' });
                    items = response?.Items || [];
                } catch (e) {
                    console.warn('[MusicWidget] Erreur apiClient.getItems:', e);
                }
            }

            // Si aucun album de musique n'est présent sur le serveur, masquer le bloc
            if (!items || items.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = '';
            const cardBuilder = svc.cardBuilder();
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'poster',
                    getImageUrl: (item) => api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) || apiClient?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) || '',
                    onClick: (item) => {
                        if (svc.slideUpSheet()) {
                            svc.slideUpSheet().open(item);
                        } else if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(item.Id);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[MusicWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default MusicWidget;
