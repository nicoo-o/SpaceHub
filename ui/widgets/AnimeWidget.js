/**
 * SpaceHub — Anime Shelf Widget
 * Version: 1.1.0
 *
 * Détecte automatiquement la bibliothèque Anime dans Jellyfin
 * (par nom ou CollectionType) ou filtre par genres Animation/Anime
 * et affiche les derniers ajouts animés avec regroupement par série.
 */

'use strict';

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
                    <h2 class="sh-widget__title" style="display:flex; align-items:center; gap:8px; margin:0; font-size:1.15rem; font-weight:600; color:#ffffff;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon" style="color:var(--sh-accent, #6366f1);">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-shelf-see-all-btn" id="sh-btn-see-all-anime" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:13px; font-weight:500; cursor:pointer; display:none; align-items:center; gap:4px; transition:color 0.2s;">
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
            let animeLibraryId = null;

            // 1. Chercher si une bibliothèque dédiée "Anime" existe dans Jellyfin
            try {
                let views = [];
                if (api?.getUserViews) {
                    views = await api.getUserViews();
                }
                if ((!views || views.length === 0) && window.ApiClient?.getUserViews) {
                    const rawViews = await window.ApiClient.getUserViews(api?.getUserId?.());
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

            // Bouton "Tout voir" si bibliothèque trouvée
            const seeAllBtn = container.querySelector('#sh-btn-see-all-anime');
            if (seeAllBtn && animeLibraryId) {
                seeAllBtn.style.display = 'flex';
                seeAllBtn.onclick = () => {
                    if (window.SpaceHub?.ui?.appLayout?.navigate) {
                        window.SpaceHub.ui.appLayout.navigate('library', { libraryId: animeLibraryId });
                    }
                };
            }

            // 2. Récupérer les séries/films de cette bibliothèque ou par genre
            if (animeLibraryId) {
                if (api?.getItemsWithTotal) {
                    try {
                        const res = await api.getItemsWithTotal(animeLibraryId, {
                            limit: 24,
                            sortBy: 'DateCreated',
                            sortOrder: 'Descending',
                            includeItemTypes: 'Series,Movie'
                        });
                        items = res?.items || [];
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur api.getItemsWithTotal:', e);
                    }
                }

                if ((!items || items.length === 0) && api?.getItems) {
                    try {
                        items = await api.getItems(animeLibraryId, {
                            limit: 24,
                            sortBy: 'DateCreated',
                            sortOrder: 'Descending',
                            includeItemTypes: 'Series,Movie'
                        });
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur api.getItems:', e);
                    }
                }

                if ((!items || items.length === 0) && apiClient?.getItems) {
                    try {
                        const response = await apiClient.getItems({
                            ParentId: animeLibraryId,
                            Recursive: true,
                            Limit: 24,
                            SortBy: 'DateCreated',
                            SortOrder: 'Descending',
                            IncludeItemTypes: 'Series,Movie'
                        });
                        items = response?.Items || (Array.isArray(response) ? response : []);
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur apiClient.getItems pour Anime:', e);
                    }
                }
            } else {
                // Pas de bibliothèque dédiée : chercher les séries et films avec le genre Animation / Anime
                if (api?.getItemsWithTotal) {
                    try {
                        const res = await api.getItemsWithTotal('', {
                            limit: 24,
                            sortBy: 'DateCreated',
                            sortOrder: 'Descending',
                            includeItemTypes: 'Series,Movie',
                            genres: 'Animation,Anime'
                        });
                        items = res?.items || [];
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur api.getItemsWithTotal fallback genre:', e);
                    }
                }

                if ((!items || items.length === 0) && apiClient?.getItems) {
                    try {
                        const response = await apiClient.getItems({
                            Recursive: true,
                            Limit: 24,
                            SortBy: 'DateCreated',
                            SortOrder: 'Descending',
                            IncludeItemTypes: 'Series,Movie',
                            Genres: 'Animation,Anime'
                        });
                        items = response?.Items || (Array.isArray(response) ? response : []);
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur apiClient fallback genre Anime:', e);
                    }
                }
            }

            // Si aucun contenu anime, masquer proprement sans casser la page
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
            console.error('[AnimeWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default AnimeWidget;
