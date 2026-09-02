/**
 * SpaceHub — Movies Shelf Widget
 * Version: 1.0.0
 *
 * Affiche la section des Films & Cinéma sur le Dashboard.
 */

'use strict';


import * as svc from '../../core/services.js';
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
            const userId = api?.getUserId?.() || svc.auth()?.getUserId?.();
            let items = [];

            // Stratégie 1 : api.getMovies
            if (api?.getMovies) {
                try {
                    items = await api.getMovies({ limit: 48, sortBy: 'DateCreated', sortOrder: 'Descending' });
                } catch (e) {
                    console.warn('[MoviesWidget] Stratégie 1 api.getMovies:', e);
                }
            }

            // Stratégie 2 : apiClient.getItems avec IncludeItemTypes: 'Movie'
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({ 
                        userId: userId || '',
                        IncludeItemTypes: 'Movie', 
                        Recursive: true, 
                        Limit: 48, 
                        SortBy: 'DateCreated', 
                        SortOrder: 'Descending',
                        Fields: 'PrimaryImageAspectRatio,Overview,Genres,CommunityRating,CriticRating,UserData,RunTimeTicks,ProductionYear,ProviderIds'
                    });
                    items = response?.Items || (Array.isArray(response) ? response : []);
                } catch (e) {
                    console.warn('[MoviesWidget] Stratégie 2 apiClient.getItems:', e);
                }
            }

            // Stratégie 3 : window.ApiClient natif
            if ((!items || items.length === 0) && window.ApiClient?.getItems) {
                try {
                    const rawRes = await window.ApiClient.getItems(userId, {
                        IncludeItemTypes: 'Movie',
                        Recursive: true,
                        Limit: 48,
                        SortBy: 'DateCreated',
                        SortOrder: 'Descending',
                        Fields: 'PrimaryImageAspectRatio,Overview,Genres,CommunityRating,CriticRating,UserData,RunTimeTicks,ProductionYear,ProviderIds'
                    });
                    items = rawRes?.Items || (Array.isArray(rawRes) ? rawRes : []);
                } catch (e) {
                    console.warn('[MoviesWidget] Stratégie 3 window.ApiClient:', e);
                }
            }

            if (!items || items.length === 0) {
                // Ne pas masquer le conteneur pour éviter les disparitions soudaines
                contentEl.innerHTML = '<div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px; font-size:13px;">Aucun film trouvé dans la médiathèque.</div>';
                return;
            }

            container.style.display = '';
            const cardBuilder = svc.cardBuilder();
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'poster',
                    getImageUrl: (item) => api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600, quality: 90 }) || apiClient?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600, quality: 90 }) || '',
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
            console.error('[MoviesWidget] Erreur:', err);
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default MoviesWidget;
