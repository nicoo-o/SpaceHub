/**
 * SpaceHub — Dynamic Library Shelf Widget
 * Version: 1.1.0
 *
 * Widget générique haute performance qui affiche les derniers ajouts d'une
 * bibliothèque Jellyfin spécifique (Films, Séries, Documentaires, 4K, etc.).
 * Regroupe automatiquement les séries par fiche parent (Series) et offre
 * un lien direct "Tout voir" vers la vue explorateur complète de la bibliothèque.
 */

'use strict';

import { escapeHtml } from '../../core/utils/domUtils.js';

import * as svc from '../../core/services.js';
class DynamicLibraryWidget {
    /**
     * @param {Object} libraryView - Objet view Jellyfin { Id, Name, CollectionType, ... }
     */
    constructor(libraryView = {}) {
        this.libraryId = libraryView.Id || '';
        this.id = `library-${this.libraryId}`;
        this.title = libraryView.Name || 'Médiathèque';
        this.collectionType = (libraryView.CollectionType || libraryView.Type || '').toLowerCase();
        this.defaultColSpan = 12;
    }

    async render(container) {
        // Déterminer l'icône SVG et le badge en fonction du type de collection ou du nom
        let iconSvg;
        const lowerName = this.title.toLowerCase();

        if (lowerName.includes('anime') || lowerName.includes('animé') || lowerName.includes('manga')) {
            iconSvg = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>';
        } else if (this.collectionType.includes('movie') || lowerName.includes('film') || lowerName.includes('ciné')) {
            iconSvg = '<rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>';
        } else if (this.collectionType.includes('tv') || this.collectionType.includes('series') || lowerName.includes('série') || lowerName.includes('tv')) {
            iconSvg = '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>';
        } else if (this.collectionType.includes('music') || lowerName.includes('musique') || lowerName.includes('album')) {
            iconSvg = '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>';
        } else if (this.collectionType.includes('boxset') || lowerName.includes('collection') || lowerName.includes('saga')) {
            iconSvg = '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path>';
        } else if (this.collectionType.includes('book') || lowerName.includes('livre')) {
            iconSvg = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>';
        } else {
            iconSvg = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>';
        }

        container.innerHTML = `
            <div class="sh-widget sh-widget--dynamic-library" data-library-id="${this.libraryId}">
                <div class="sh-widget__header" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h2 class="sh-widget__title" style="display:flex; align-items:center; gap:8px; margin:0; font-size:1.15rem; font-weight:600; color:var(--sh-ink-solid, #ffffff);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon" style="color:var(--sh-accent, #6366f1);">
                            ${iconSvg}
                        </svg>
                        <span>${escapeHtml(this.title)}</span>
                    </h2>
                    <button class="sh-shelf-see-all-btn" id="sh-btn-see-all-${this.libraryId}" style="background:none; border:none; color:rgba(var(--sh-ink, 255, 255, 255), 0.6); font-size:13px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:4px; transition:color 0.2s;">
                        <span>Tout voir</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container"></div>
                </div>
            </div>
        `;

        const seeAllBtn = container.querySelector(`#sh-btn-see-all-${this.libraryId}`);
        if (seeAllBtn) {
            seeAllBtn.addEventListener('click', () => {
                if (svc.appLayout()?.navigate) {
                    svc.appLayout().navigate('library', { libraryId: this.libraryId });
                }
            });
        }

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

            // Déterminer le type d'entité à inclure pour éviter la pollution par épisodes individuels
            const lowerName = this.title.toLowerCase();
            let includeItemTypes = undefined;

            if (this.collectionType.includes('tv') || this.collectionType.includes('series') || lowerName.includes('série') || lowerName.includes('serie') || lowerName.includes('tv') || lowerName.includes('anime') || lowerName.includes('animé')) {
                includeItemTypes = 'Series';
            } else if (this.collectionType.includes('movie') || lowerName.includes('film') || lowerName.includes('ciné')) {
                includeItemTypes = 'Movie';
            } else if (this.collectionType.includes('boxset') || lowerName.includes('collection') || lowerName.includes('saga')) {
                includeItemTypes = 'BoxSet';
            } else if (this.collectionType.includes('music') || lowerName.includes('musique') || lowerName.includes('album')) {
                includeItemTypes = 'MusicAlbum';
            }

            // 1. Essai avec api.getItemsWithTotal
            if (api?.getItemsWithTotal) {
                try {
                    const queryOpts = {
                        limit: 24,
                        sortBy: 'DateCreated',
                        sortOrder: 'Descending'
                    };
                    if (includeItemTypes) queryOpts.includeItemTypes = includeItemTypes;
                    const res = await api.getItemsWithTotal(this.libraryId, queryOpts);
                    items = res?.items || [];
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur api.getItemsWithTotal:`, e);
                }
            }

            // 2. Fallback api.getItems
            if ((!items || items.length === 0) && api?.getItems) {
                try {
                    const queryOpts = {
                        limit: 24,
                        sortBy: 'DateCreated',
                        sortOrder: 'Descending'
                    };
                    if (includeItemTypes) queryOpts.includeItemTypes = includeItemTypes;
                    items = await api.getItems(this.libraryId, queryOpts);
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur api.getItems:`, e);
                }
            }

            // 3. Fallback apiClient.getItems
            if ((!items || items.length === 0) && apiClient?.getItems) {
                try {
                    const queryOpts = {
                        ParentId: this.libraryId,
                        Recursive: true,
                        Limit: 24,
                        SortBy: 'DateCreated',
                        SortOrder: 'Descending'
                    };
                    if (includeItemTypes) queryOpts.IncludeItemTypes = includeItemTypes;
                    const response = await apiClient.getItems(queryOpts);
                    items = response?.Items || (Array.isArray(response) ? response : []);
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur apiClient.getItems:`, e);
                }
            }

            // 4. Fallback api.getLatestItems avec parentId
            if ((!items || items.length === 0) && api?.getLatestItems) {
                try {
                    items = await api.getLatestItems({ parentId: this.libraryId, limit: 24 });
                } catch (e) {
                    console.warn(`[DynamicLibraryWidget:${this.title}] Erreur api.getLatestItems:`, e);
                }
            }

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
            console.error(`[DynamicLibraryWidget:${this.title}] Erreur:`, err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default DynamicLibraryWidget;
