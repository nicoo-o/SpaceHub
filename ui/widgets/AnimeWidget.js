/**
 * SpaceHub — Anime Shelf Widget
 * Version: 1.0.0
 *
 * Détecte automatiquement la ou les bibliothèques Anime dans Jellyfin
 * (par nom ou CollectionType) et affiche les derniers ajouts animés.
 * Se masque proprement si aucune bibliothèque Anime n'existe.
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
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                            <path d="M2 17l10 5 10-5"></path>
                            <path d="M2 12l10 5 10-5"></path>
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

            // 1. Chercher la bibliothèque Anime par nom ou CollectionType
            let animeLibraryId = null;
            try {
                let views = [];
                if (api?.getUserViews) {
                    views = await api.getUserViews();
                }
                if ((!views || views.length === 0) && window.ApiClient?.getUserViews) {
                    const rawViews = await window.ApiClient.getUserViews(api?.getUserId?.());
                    views = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
                }

                if (Array.isArray(views)) {
                    const animeLib = views.find(v => {
                        const name = (v.Name || '').toLowerCase();
                        const colType = (v.CollectionType || '').toLowerCase();
                        return name.includes('anime') || name.includes('animé') || name.includes('animés') || name.includes('animation') || colType.includes('anime');
                    });
                    if (animeLib) {
                        animeLibraryId = animeLib.Id;
                    }
                }
            } catch (e) {
                console.warn('[AnimeWidget] Erreur détection bibliothèque Anime:', e);
            }

            // Pas de bibliothèque anime trouvée → on cherche les séries avec le tag/genre "Animation" ou "Anime"
            if (animeLibraryId) {
                // Récupérer les items de la bibliothèque Anime
                if (apiClient?.getItems) {
                    try {
                        const response = await apiClient.getItems({
                            ParentId: animeLibraryId,
                            Recursive: true,
                            Limit: 24,
                            SortBy: 'DateCreated',
                            SortOrder: 'Descending',
                            IncludeItemTypes: 'Series,Movie'
                        });
                        items = response?.Items || [];
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur apiClient.getItems pour Anime:', e);
                    }
                }

                if ((!items || items.length === 0) && api?.getItems) {
                    try {
                        const response = await api.getItems({
                            parentId: animeLibraryId,
                            recursive: true,
                            limit: 24,
                            sortBy: 'DateCreated',
                            sortOrder: 'Descending',
                            includeItemTypes: 'Series,Movie'
                        });
                        items = response?.Items || response || [];
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur api.getItems pour Anime:', e);
                    }
                }
            } else {
                // Fallback : chercher les séries/films avec genre "Animation" ou "Anime"
                if (apiClient?.getItems) {
                    try {
                        const response = await apiClient.getItems({
                            Recursive: true,
                            Limit: 24,
                            SortBy: 'DateCreated',
                            SortOrder: 'Descending',
                            IncludeItemTypes: 'Series,Movie',
                            Genres: 'Animation,Anime'
                        });
                        items = response?.Items || [];
                    } catch (e) {
                        console.warn('[AnimeWidget] Erreur apiClient fallback genre Anime:', e);
                    }
                }
            }

            // Si aucun contenu anime, masquer proprement
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
