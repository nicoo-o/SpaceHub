/**
 * SpaceHub — Barre de navigation GSM (variante mobile de la coquille)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * Le dock « Dynamic Island » est une interface de BUREAU : il se déplie au
 * survol de la souris et au focus clavier. Sur un téléphone, ni l'un ni
 * l'autre — le tap ne déclenche ni mouseenter ni focus. Les onglets
 * Bibliothèques et Flux y étaient donc quasi inatteignables.
 *
 * Plutôt que d'ajouter des booléens « estMobile » au dock, ce module est un
 * VARIANT explicite de la navigation, sélectionné par AppLayout quand le
 * profil d'appareil dit GSM : le dock reste ce qu'il est, le téléphone reçoit
 * sa propre barre, conforme au modèle Material 3 « navigation bar » (3 à 5
 * destinations, fenêtres compactes) — que la spécification réserve précisément
 * aux fenêtres de moins de 600 dp.
 *
 * Les destinations réutilisent les `data-view` existants : `navigate()` n'est
 * pas modifié, les swipes de TouchEngine continuent de fonctionner, et le
 * moteur TV garde ses scopes (les boutons sont déclarés au contrat
 * CHROME_PERSISTANT — voir core/DomContracts.js).
 *
 * Ce module est une vue pure : toute la logique (navigation, actions du menu)
 * est injectée par AppLayout. Rien n'est lu depuis `window`.
 */

'use strict';

import Logger from '../../core/Logger.js';
import './GsmNav.css';

/** Les trois destinations de la barre, dans l'ordre Material 3 (3 à 5). */
export const DESTINATIONS = [
    { view: 'dashboard', libelle: 'Accueil' },
    { view: 'library', libelle: 'Bibliothèques' },
    { view: 'flux', libelle: 'Flux' },
];

const ICONES = {
    dashboard: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>',
    library: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>',
    flux: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
};

/**
 * Crée la barre de navigation basse GSM.
 *
 * @param {object} deps
 * @param {(view: string) => void} deps.onOnglet   tap sur une destination
 * @param {() => string} [deps.vueActive]          destination active au rendu
 * @param {Logger} [deps.logger]
 * @returns {{ render, definirActif, nettoyer }}
 */
export function creerBarreNavigation(deps = {}) {
    // Déstructuration évitée : le contrôle des fonctions fantômes ne voit pas
    // à travers les paramètres déstructurés — lire `deps.x` puis des locales
    // est équivalent et lisible.
    const onOnglet = deps.onOnglet;
    const vueActive = deps.vueActive || (() => 'dashboard');
    const logger = deps.logger || new Logger('BarreNavigation');
    if (typeof onOnglet !== 'function') throw new Error('[BarreNavigation] onOnglet est obligatoire.');
    let racine = null;

    return {
        /** Injecte la barre dans le conteneur (idempotent : une seule). */
        render(conteneur) {
            if (!conteneur) return;
            if (conteneur.querySelector('.sh-tab-bar')) return;
            const active = vueActive();
            racine = document.createElement('nav');
            racine.className = 'sh-tab-bar';
            racine.setAttribute('aria-label', 'Navigation principale');
            racine.innerHTML = `
                <span class="sh-tabbar-pill" aria-hidden="true"></span>
                ${DESTINATIONS.map(d => `
                <button type="button" data-nav-focusable="true" data-view="${d.view}"
                        class="sh-tabbar-btn ${d.view === active ? 'active' : ''}">
                    <span class="sh-tabbar-btn__icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[d.view] || ''}</svg>
                    </span>
                    <span class="sh-tabbar-btn__label">${d.libelle}</span>
                </button>`).join('')}
            `;
            racine.addEventListener('click', (e) => {
                const btn = e.target.closest?.('.sh-tabbar-btn');
                if (!btn) return;
                logger.debug(`Barre GSM → ${btn.dataset.view}`);
                onOnglet(btn.dataset.view);
            });
            conteneur.appendChild(racine);
            this.definirActif(active, false);
        },

        /**
         * Synchronise l'onglet actif et l'indicateur Material 3.
         * La vue « flux » et la vue « downloads » partagent l'onglet Flux,
         * comme dans le dock.
         */
        definirActif(view, animer = true) {
            if (!racine) return;
            const normalise = (view === 'downloads') ? 'flux' : view;
            let actif = null;
            racine.querySelectorAll('.sh-tabbar-btn').forEach((btn) => {
                const est = btn.dataset.view === normalise;
                btn.classList.toggle('active', est);
                if (est) actif = btn;
            });
            const pilule = racine.querySelector('.sh-tabbar-pill');
            if (!pilule || !actif) return;
            // transform et left : left pour la position, transform pour
            // l'animation — propriétés composables, pas de layout forcé.
            const cible = actif.offsetLeft + actif.offsetWidth / 2;
            pilule.style.transition = animer
                ? 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease'
                : 'none';
            pilule.style.transform = `translateX(calc(${Math.round(cible)}px - 50%))`;
            pilule.style.opacity = '1';
        },

        /** Retire la barre du DOM. */
        nettoyer() {
            racine?.remove();
            racine = null;
        },
    };
}

export default creerBarreNavigation;
