/**
 * SpaceHub — Quick Actions Widget
 * Version: 1.0.0
 *
 * Widget d'actions et raccourcis rapides (changer de thème, chercher, actualiser, accès rapide).
 */

'use strict';

class QuickActionsWidget {
    constructor() {
        this.id = 'quick-actions';
        this.title = 'Accès Rapide';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--quick-actions">
                <div class="sh-widget__content">
                    <div class="sh-quick-actions-bar">
                        <button class="sh-quick-btn" data-action="theme-next">
                            <span class="sh-quick-btn__icon">🎨</span>
                            <span class="sh-quick-btn__label">Changer de thème</span>
                        </button>
                        <button class="sh-quick-btn" data-action="search">
                            <span class="sh-quick-btn__icon">🔍</span>
                            <span class="sh-quick-btn__label">Recherche rapide</span>
                        </button>
                        <button class="sh-quick-btn" data-action="refresh">
                            <span class="sh-quick-btn__icon">🔄</span>
                            <span class="sh-quick-btn__label">Recharger les médias</span>
                        </button>
                        <button class="sh-quick-btn" data-action="settings">
                            <span class="sh-quick-btn__icon">⚙️</span>
                            <span class="sh-quick-btn__label">Réglages SpaceHub</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._bindEvents(container);
        this._injectStyles();
    }

    _bindEvents(container) {
        container.querySelector('[data-action="theme-next"]')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.themes?.next();
        });

        container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.dashboard?.refreshAll();
        });

        container.querySelector('[data-action="search"]')?.addEventListener('click', () => {
            if (window.SpaceHub?.jellyfin?.search?.open) {
                window.SpaceHub.jellyfin.search.open();
            } else {
                const searchBtn = document.querySelector('.headerSearchButton') || document.querySelector('.searchButton');
                if (searchBtn) searchBtn.click();
            }
        });

        container.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
            if (window.SpaceHub?.ui?.settingsPanel?.open) {
                window.SpaceHub.ui.settingsPanel.open();
            } else {
                const userBtn = document.querySelector('.headerUserButton') || document.querySelector('.headerButtonUser');
                if (userBtn) userBtn.click();
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-quick-actions-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-quick-actions-styles';
        style.textContent = `
.sh-quick-actions-bar {
    display: flex;
    gap: var(--sh-space-3, 12px);
    overflow-x: auto;
    padding: var(--sh-space-1, 4px) 0;
}

.sh-quick-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    padding: var(--sh-space-3, 12px) var(--sh-space-4, 16px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    color: var(--sh-text-primary, #f0f0f8);
    font-family: var(--sh-font-family, sans-serif);
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--sh-transition-fast, 150ms);
}

.sh-quick-btn:hover {
    background: var(--sh-bg-surface-3, #2e2e3d);
    border-color: var(--sh-color-primary, #7c6aff);
    transform: translateY(-2px);
}

.sh-quick-btn__icon {
    font-size: 16px;
}
        `;
        document.head.appendChild(style);
    }
}

export default QuickActionsWidget;
