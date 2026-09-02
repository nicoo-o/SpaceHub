/**
 * SpaceHub — Anime Shelf Widget
 * Version: 1.1.0
 *
 * Détecte automatiquement la bibliothèque Anime dans Jellyfin
 * (par nom ou CollectionType) ou filtre par genres Animation/Anime
 * et affiche les derniers ajouts animés avec regroupement par série.
 */

'use strict';


import * as svc from '../../core/services.js';
class AnimeWidget {
    constructor() {
        this.id = 'anime';
        this.title = 'Animés';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--anime">
                <div class="sh-widget__header" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h2 class="sh-widget__title" style="display:flex; align-items:center; gap:8px; margin:0; font-size:1.15rem; font-weight:600; color:var(--sh-ink-solid, #ffffff);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon" style="color:var(--sh-accent, #6366f1);">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-shelf-see-all-btn" id="sh-btn-see-all-anime" style="background:none; border:none; color:rgba(var(--sh-ink, 255, 255, 255), 0.6); font-size:13px; font-weight:500; cursor:pointer; display:none; align-items:center; gap:4px; transition:color 0.2s;">
                        <span>Tout voir</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
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
            let animeLibraryId = null;

            // 1. Chercher si une bibliothèque dédiée "Anime" existe dans Jellyfin
            try {
                let views = [];
                if (api?.getUserViews) {
                    views = await api.getUserViews();
                }
                if ((!views || views.length === 0) && window.ApiClient?.getUserViews) {
                    const rawViews = await window.ApiClient.getUserViews(userId);
                    views = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
                }

                if (Array.isArray(views) && views.length > 0) {
                    const animeLib = views.find(v => {
                        const name = (v.Name || '').toLowerCase();
                        const colType = (v.CollectionType || '').toLowerCase();
                        return name.includes('anime') || name.includes('animé') || name.includes('animés') || name.includes('animation') || name.includes('manga') || colType.includes('anime');
                    });
                    if (animeLib) {
                        animeLibraryId = animeLib.Id;
                        this.title = animeLib.Name || 'Animés';
                        const titleSpan = container.querySelector('.sh-widget__title span');
                        if (titleSpan) titleSpan.textContent = this.title;
                    }
                }
            } catch (e) {
                console.warn('[AnimeWidget] Erreur détection bibliothèque Anime:', e);
            }

            // 2. Si une bibliothèque dédiée existe, charger ses éléments
            if (animeLibraryId) {
                if (api?.getItems) {
                    try {
                        items = await api.getItems(animeLibraryId, { limit: 48, sortBy: 'DateCreated', sortOrder: 'Descending' });
                    } catch (e) {
                        console.warn('[AnimeWidget] api.getItems animeLib:', e);
                    }
                }
                if ((!items || items.length === 0) && apiClient?.getItems) {
                    try {
                        const res = await apiClient.getItems({ ParentId: animeLibraryId, Recursive: true, Limit: 48, SortBy: 'DateCreated', SortOrder: 'Descending' });
                        items = res?.Items || [];
                    } catch (e) {}
                }
            }

            // 3. Fallback : Filtrer par genre Animation / Anime sur l'ensemble des séries et films
            if (!items || items.length === 0) {
                if (apiClient?.getItems) {
                    try {
                        const res = await apiClient.getItems({ 
                            userId: userId || '',
                            IncludeItemTypes: 'Series,Movie', 
                            Genres: 'Animation,Anime', 
                            Recursive: true, 
                            Limit: 48, 
                            SortBy: 'DateCreated', 
                            SortOrder: 'Descending' 
                        });
                        items = res?.Items || [];
                    } catch (e) {}
                }
                if ((!items || items.length === 0) && window.ApiClient?.getItems) {
                    try {
                        const raw = await window.ApiClient.getItems(userId, {
                            IncludeItemTypes: 'Series,Movie',
                            Genres: 'Animation,Anime',
                            Recursive: true,
                            Limit: 48,
                            SortBy: 'DateCreated',
                            SortOrder: 'Descending'
                        });
                        items = raw?.Items || [];
                    } catch (e) {}
                }
            }

            // 4. Dernier fallback : si rien avec le genre Animation, afficher les séries récentes pour ne jamais laisser vide
            if (!items || items.length === 0) {
                if (api?.getSeries) {
                    try {
                        const allSeries = await api.getSeries({ limit: 24 });
                        // Filtrer celles avec mot-clé anime ou japon ou studio
                        items = allSeries.filter(s => {
                            const str = ((s.Name || '') + ' ' + (s.Genres || []).join(' ')).toLowerCase();
                            return str.includes('re:zero') || str.includes('anime') || str.includes('anim') || str.includes('japon') || str.includes('hero') || str.includes('demon');
                        });
                        if (!items || items.length === 0) {
                            items = allSeries.slice(0, 12);
                        }
                    } catch (e) {}
                }
            }

            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px; font-size:13px;">Aucun animé trouvé dans la médiathèque.</div>';
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
            console.error('[AnimeWidget] Erreur:', err);
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default AnimeWidget;
