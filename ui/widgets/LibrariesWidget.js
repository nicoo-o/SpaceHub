/**
 * SpaceHub — User Libraries & Collections Shelf Widget
 * Version: 1.0.0
 *
 * Affiche la section "Mes Collections & Bibliothèques" tout en haut du Dashboard,
 * juste sous le Hero Spotlight (Films, Séries, Anime, Musique, Collections, Playlists).
 */

'use strict';


import * as svc from '../../core/services.js';
class LibrariesWidget {
    constructor() {
        this.id = 'user-libraries';
        this.title = 'Mes Collections & Bibliothèques';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--libraries">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
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
            let views = [];

            if (api?.getUserViews) {
                try {
                    views = await api.getUserViews();
                } catch (e) {
                    console.warn('[LibrariesWidget] Erreur getUserViews:', e);
                }
            }

            if (!views || views.length === 0) {
                const apiClient = svc.api()?.getClient('jellyfin');
                const rawViews = await window.ApiClient?.getUserViews?.(apiClient?.getUserId?.() || api?.getUserId?.());
                views = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
            }

            // Filtrage des bibliothèques désactivées par l'utilisateur
            const hiddenIds = new Set(JSON.parse(localStorage.getItem('sh_library_hidden_ids') || '[]'));
            if (hiddenIds.size > 0 && views && views.length > 0) {
                views = views.filter(v => !hiddenIds.has(v.Id));
            }

            // Tri personnalisé selon l'ordre défini par l'utilisateur
            const order = JSON.parse(localStorage.getItem('sh_library_order') || '[]');
            if (order && order.length > 0 && views && views.length > 0) {
                const orderMap = new Map(order.map((id, index) => [id, index]));
                views.sort((a, b) => {
                    const idxA = orderMap.has(a.Id) ? orderMap.get(a.Id) : 999;
                    const idxB = orderMap.has(b.Id) ? orderMap.get(b.Id) : 999;
                    return idxA - idxB;
                });
            }

            if (!views || views.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = '';

            const cardBuilder = svc.cardBuilder();
            if (cardBuilder) {
                // Adapter les items pour l'affichage épuré de dossiers de bibliothèques
                const formattedItems = views.map(v => {
                    let typeLabel = 'BIBLIOTHÈQUE';
                    const colType = (v.CollectionType || v.Type || '').toLowerCase();
                    if (colType.includes('movie')) typeLabel = 'FILMS';
                    else if (colType.includes('tv') || colType.includes('series')) typeLabel = 'SÉRIES';
                    else if (colType.includes('music')) typeLabel = 'MUSIQUE';
                    else if (colType.includes('boxset')) typeLabel = 'COLLECTIONS';
                    else if (colType.includes('playlist')) typeLabel = 'PLAYLISTS';
                    else if (v.Name?.toLowerCase().includes('anime')) typeLabel = 'ANIMÉS';

                    return {
                        ...v,
                        subtitle: 'Dossier racine',
                        codec: typeLabel,
                        rottenScore: null,
                        CommunityRating: null
                    };
                });

                cardBuilder.renderGrid(contentEl, formattedItems, {
                    type: 'poster',
                    getImageUrl: (item) => item.customImage || api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) || '',
                    onClick: (item) => {
                        if (svc.appLayout()?.navigate) {
                            svc.appLayout().navigate('library', { libraryId: item.Id });
                        } else if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(item.Id);
                        } else {
                            window.location.hash = `#/library?parentId=${item.Id}`;
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[LibrariesWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default LibrariesWidget;
