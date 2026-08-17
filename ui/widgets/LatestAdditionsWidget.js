/**
 * SpaceHub — Latest Additions Widget
 * Version: 0.4.0
 *
 * Affiche les derniers ajouts de médias dans la bibliothèque Jellyfin.
 */

'use strict';

class LatestAdditionsWidget {
    constructor() {
        this.id = 'latest-additions';
        this.title = 'Derniers Ajouts';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--latest-additions">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">✨ ${this.title}</h2>
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
            contentEl.appendChild(cardBuilder.createSkeletonGrid(8, 'poster'));
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

            if (!apiClient) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <p>Client Jellyfin non initialisé.</p>
                    </div>
                `;
                return;
            }

            const response = await apiClient.getRecentlyAdded(12);
            const items = response?.Items || (Array.isArray(response) ? response : []);

            if (items.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding: var(--sh-space-6, 24px); text-align: center; color: var(--sh-text-muted);">
                        <p>📭 Aucun média récent trouvé.</p>
                    </div>
                `;
                return;
            }

            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                cardBuilder.renderGrid(contentEl, items, {
                    type: 'poster',
                    getImageUrl: (item) => {
                        return apiClient.getImageUrl(item.Id, 'Primary', { maxWidth: 300, maxHeight: 450 });
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
            console.error('[LatestAdditionsWidget] Erreur chargement:', err);
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de récupérer les derniers ajouts (${err.message}).</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export default LatestAdditionsWidget;
