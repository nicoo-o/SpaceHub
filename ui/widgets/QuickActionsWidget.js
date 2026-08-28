/**
 * SpaceHub — Quick Actions Widget (Apple VisionOS Subtile Edition)
 * Version: 2.0.0
 *
 * Raccourcis ultra-subtils et discrets (Icônes seules, sans texte) :
 * 1. Changer de thème (Palette)
 * 2. Recharger les médias (Refresh)
 */

'use strict';

class QuickActionsWidget {
    constructor() {
        this.id = 'quick-actions';
        this.title = 'Actions Rapides';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-quick-actions-compact">
                <button class="sh-quick-btn-icon" data-action="theme-next" title="Changer de thème">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
                        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
                        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
                        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                    </svg>
                </button>
                <button class="sh-quick-btn-icon" data-action="refresh" title="Recharger les médias">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                </button>
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
    }

    _injectStyles() {
        if (document.getElementById('sh-quick-actions-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-quick-actions-styles';
        style.textContent = `
.sh-quick-actions-compact {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.sh-quick-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.10);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: 
        background 160ms ease,
        border-color 160ms ease,
        transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
        color 160ms ease,
        box-shadow 200ms ease;
}

.sh-quick-btn-icon:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
    transform: scale(1.08);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.sh-quick-btn-icon:active {
    transform: scale(0.94);
}
        `;
        document.head.appendChild(style);
    }
}

export default QuickActionsWidget;

