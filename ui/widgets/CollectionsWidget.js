/**
 * SpaceHub — Collections & Sagas Shelf Widget
 * Version: 1.1.0
 *
 * Affiche la section des Sagas Cinéma sur le Dashboard.
 */

'use strict';


import * as svc from '../../core/services.js';
class CollectionsWidget {
    constructor() {
        this.id = 'collections-sagas';
        this.title = 'Sagas & Collections';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--collections">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <path d="m2 9 10-5 10 5-10 5Z"></path>
                            <path d="m2 14 10 5 10-5"></path>
                            <path d="m2 19 10 5 10-5"></path>
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
            const itemsMap = new Map();

            // 1. Requête globale standard des BoxSets / Collections
            if (api?.getBoxSets) {
                try {
                    const globalBoxSets = await api.getBoxSets({ limit: 30 });
                    (globalBoxSets || []).forEach(item => itemsMap.set(item.Id, item));
                } catch (e) {
                    // Pas de boxsets ou endpoint non disponible
                }
            }

            // 2. Recherche du dossier de bibliothèques "Collections / Sagas" si vide
            if (itemsMap.size === 0 && api?.getUserViews && api?.getItems) {
                try {
                    const views = await api.getUserViews() || [];
                    const boxsetView = views.find(v => 
                        (v.CollectionType || '').toLowerCase() === 'boxsets' || 
                        (v.Name || '').toLowerCase().includes('collection') || 
                        (v.Name || '').toLowerCase().includes('saga')
                    );
                    if (boxsetView?.Id) {
                        const res = await api.getItems(boxsetView.Id, {
                            recursive: true,
                            includeItemTypes: 'BoxSet',
                            fields: 'PrimaryImageAspectRatio,Overview,CommunityRating,ProductionYear',
                            sortBy: 'SortName',
                            sortOrder: 'Ascending',
                            limit: 30
                        });
                        const boxsetChildren = Array.isArray(res) ? res : (res?.Items || []);
                        boxsetChildren.forEach(item => {
                            if ((item.Type || '').toLowerCase() === 'boxset' || item.IsFolder) {
                                itemsMap.set(item.Id, item);
                            }
                        });
                    }
                } catch (e) {
                    // Dossier non trouvé
                }
            }

            const items = Array.from(itemsMap.values());

            // Si aucune saga disponible, masquer proprement le bloc sans afficher de fausses données démo
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
                        } else {
                            window.location.hash = `#/details?id=${item.Id}`;
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[CollectionsWidget] Erreur:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default CollectionsWidget;
