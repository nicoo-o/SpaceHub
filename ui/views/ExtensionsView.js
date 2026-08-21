/**
 * SpaceHub — Extensions View
 * Version: 1.0.0
 *
 * Placeholder pour le futur écosystème de plugins tiers basé sur core/SDK.js.
 * Pas encore de marketplace/chargement dynamique — juste la page réservée
 * dans la navigation pour que la section existe dès maintenant.
 */

'use strict';

class ExtensionsView {
    async render(container) {
        container.innerHTML = `
            <div class="sh-extensions-empty">
                <div class="sh-extensions-empty__icon">🧩</div>
                <h1>Extensions</h1>
                <p>Le SDK SpaceHub (<code>core/SDK.js</code>) existe déjà en interne pour les 6 intégrations *arr.
                Un écosystème de plugins tiers installables ici arrivera dans une prochaine étape.</p>
            </div>
            <style>
                .sh-extensions-empty { max-width: 500px; margin: 80px auto; text-align: center; padding: var(--sh-space-6, 24px); color: var(--sh-text-secondary); }
                .sh-extensions-empty__icon { font-size: 48px; margin-bottom: var(--sh-space-4, 16px); }
                .sh-extensions-empty h1 { color: var(--sh-text-primary, #f0f0f8); margin-bottom: var(--sh-space-3, 12px); }
                .sh-extensions-empty code { background: var(--sh-bg-surface-2, #22222e); padding: 2px 6px; border-radius: 4px; }
            </style>
        `;
    }
}

export default ExtensionsView;
