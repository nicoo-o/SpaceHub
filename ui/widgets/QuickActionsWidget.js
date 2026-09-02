/**
 * SpaceHub — Quick Actions Widget (Apple VisionOS Subtile Edition)
 * Version: 2.0.0
 *
 * Raccourcis ultra-subtils et discrets (Icônes seules, sans texte) :
 * 1. Changer de thème (Palette)
 * 2. Recharger les médias (Refresh)
 */

'use strict';


import './QuickActionsWidget.css';
import * as svc from '../../core/services.js';
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
            svc.themes()?.next();
        });

        container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
            svc.dashboard()?.refreshAll();
        });
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans QuickActionsWidget.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default QuickActionsWidget;

