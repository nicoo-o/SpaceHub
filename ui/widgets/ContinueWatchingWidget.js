/**
 * SpaceHub — Continue Watching Widget
 * Version: 0.4.0
 *
 * Affiche la liste des films / épisodes en cours de lecture pour l'utilisateur connecté.
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
                    <h2 class="sh-widget__title">▶️ ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <!-- Skeleton loading initial -->
                    </div>
                </div>
            </div>
        `;

        const contentEl = container.querySelector('.sh-widget__items-container');
        const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;

        if (cardBuilder) {
            contentEl.appendChild(cardBuilder.createSkeletonGrid(4, 'backdrop'));
        } else {
            contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">Chargement...</p>';
        }

        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
            const currentUser = await window.ApiClient?.getCurrentUser?.();
            const userId = currentUser?.Id || window.ApiClient?.getCurrentUserId?.();

            if (!apiClient || !userId) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <p>Connectez-vous à Jellyfin pour voir vos lectures en cours.</p>
                    </div>
                `;
                return;
            }

            const response = await apiClient.getContinueWatching(userId, 8);
            const items = response?.Items || [];

            if (items.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding: var(--sh-space-6, 24px); text-align: center; color: var(--sh-text-muted);">
                        <p>🎬 Aucun média en cours de lecture. Commencez un film ou une série !</p>
                    </div>
                `;
                return;
            }

            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'backdrop',
                    getImageUrl: (item) => {
                        const imageItemId = item.BackdropImageTags?.length ? item.Id : (item.SeriesId || item.Id);
                        const imageType = item.BackdropImageTags?.length ? 'Backdrop' : 'Primary';
                        return apiClient.getImageUrl(imageItemId, imageType, { maxWidth: 500, maxHeight: 280 });
                    },
                    onClick: (item) => {
                        if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(item.Id);
                        } else {
                            window.location.hash = `#/details?id=${item.Id}`;
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[ContinueWatchingWidget] Erreur chargement:', err);
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de récupérer vos lectures en cours (${err.message}).</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default ContinueWatchingWidget;
