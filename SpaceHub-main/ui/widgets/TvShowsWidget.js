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
            const userId = api?.getUserId?.() || window.SpaceHub?.auth?.getUserId?.();
            let items = [];

            // Stratégie 1 : api.getSeries
            if (api?.getSeries) {
                try {
                    items = await api.getSeries({ limit: 48, sortBy: 'DateCreated', sortOrder: 'Descending' });
                } catch (e) {
                    console.warn('[TvShowsWidget] Stratégie 1 api.getSeries:', e);
                }
            }

            // Stratégie 2 : apiClient.getItems avec IncludeItemTypes: 'Series'
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const response = await apiClient.getItems({ 
                        userId: userId || '',
                        IncludeItemTypes: 'Series', 
                        Recursive: true, 
                        Limit: 48, 
                        SortBy: 'DateCreated', 
                        SortOrder: 'Descending',
                        Fields: 'PrimaryImageAspectRatio,Overview,Genres,CommunityRating,CriticRating,UserData,ChildCount,RecursiveItemCount,ItemCounts,ProductionYear,ProviderIds'
                    });
                    items = response?.Items || (Array.isArray(response) ? response : []);
                } catch (e) {
                    console.warn('[TvShowsWidget] Stratégie 2 apiClient.getItems:', e);
                }
            }

            // Stratégie 3 : window.ApiClient natif
            if ((!items || items.length === 0) && window.ApiClient?.getItems) {
                try {
                    const rawRes = await window.ApiClient.getItems(userId, {
                        IncludeItemTypes: 'Series',
                        Recursive: true,
                        Limit: 48,
                        SortBy: 'DateCreated',
                        SortOrder: 'Descending',
                        Fields: 'PrimaryImageAspectRatio,Overview,Genres,CommunityRating,CriticRating,UserData,ChildCount,RecursiveItemCount,ItemCounts,ProductionYear,ProviderIds'
                    });
                    items = rawRes?.Items || (Array.isArray(rawRes) ? rawRes : []);
                } catch (e) {
                    console.warn('[TvShowsWidget] Stratégie 3 window.ApiClient:', e);
                }
            }

            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div style="color:rgba(255,255,255,0.4); padding:20px; font-size:13px;">Aucune série trouvée dans la médiathèque.</div>';
                return;
            }

            container.style.display = '';
            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'poster',
                    getImageUrl: (item) => api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600, quality: 90 }) || apiClient?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600, quality: 90 }) || '',
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
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default TvShowsWidget;
