/**
 * SpaceHub — Continue Watching Widget
 * Version: 1.1.0
 *
 * Affiche la section des médias en cours de lecture pour l'utilisateur.
 */

'use strict';

class ContinueWatchingWidget {
    constructor() {
        this.id = 'continue-watching';
        this.title = 'Reprendre la lecture';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--continue-watching">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-shelf-title-icon">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
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
            contentEl.appendChild(cardBuilder.createSkeletonGrid(4, 'backdrop'));
        }

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const api = window.SpaceHub?.jellyfin?.api;
            let items = [];
            if (api?.getUnifiedContinueWatching) {
                items = await api.getUnifiedContinueWatching(16);
            } else if (api?.getResumeItems) {
                items = await api.getResumeItems(12);
            }

            // Si aucune lecture en cours pour l'utilisateur, masquer proprement l'étagère
            if (!items || items.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = '';
            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                // Enrichissement du titre et du sous-titre pour une lisibilité Apple TV+ parfaite
                const enrichedItems = items.map(it => {
                    const isEpisode = it.Type === 'Episode' || it.SeriesName;
                    const seriesTitle = it.SeriesName || (isEpisode ? it.Name : '');
                    const epNum = isEpisode ? `S${String(it.ParentIndexNumber || 1).padStart(2, '0')}E${String(it.IndexNumber || 1).padStart(2, '0')}` : '';
                    const epName = isEpisode ? (it.Name || '') : '';
                    
                    const displayTitle = isEpisode ? seriesTitle : (it.Name || it.title || 'Média');
                    const displaySubtitle = isEpisode 
                        ? `${epNum}${epName ? ' · ' + epName : ''}`
                        : (it.ProductionYear ? `${it.ProductionYear} · Film` : 'Film');

                    return {
                        ...it,
                        customTitle: displayTitle,
                        customSubtitle: displaySubtitle
                    };
                });

                cardBuilder.renderGrid(contentEl, enrichedItems, {
                    type: 'backdrop',
                    getImageUrl: (item) => {
                        const isEpisode = item.Type === 'Episode' || item.SeriesName;

                        if (isEpisode) {
                            // 1. Si l'épisode dispose de sa propre vignette 16:9 native (screenshot de l'épisode)
                            if (item.ImageTags?.Primary || item.PrimaryImageTag) {
                                return api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 1000, quality: 90 }) || '';
                            }
                            // 2. Sinon, Backdrop horizontal 16:9 de la Série / Saison (jamais l'affiche verticale !)
                            const seriesOrParentId = item.SeriesId || item.ParentBackdropItemId || item.SeasonId || item.Id;
                            return api?.getImageUrl?.(seriesOrParentId, 'Backdrop', { maxWidth: 1280, quality: 90 }) || '';
                        } else {
                            // Pour les films : Backdrop 16:9 en priorité haute résolution
                            if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                                return api?.getImageUrl?.(item.Id, 'Backdrop', { maxWidth: 1280, quality: 90 }) || '';
                            }
                            if (item.ImageTags?.Thumb) {
                                return api?.getImageUrl?.(item.Id, 'Thumb', { maxWidth: 1000, quality: 90 }) || '';
                            }
                            return api?.getImageUrl?.(item.Id, 'Primary', { maxWidth: 1000, quality: 90 }) || '';
                        }
                    },
                    onClick: (item) => {
                        if (window.SpaceHub?.ui?.modalSlideUpSheet) {
                            window.SpaceHub.ui.modalSlideUpSheet.open(item);
                        } else if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(item.Id);
                        } else {
                            window.location.hash = `#/details?id=${item.Id}`;
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[ContinueWatchingWidget] Erreur chargement:', err);
            container.style.display = 'none';
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default ContinueWatchingWidget;
