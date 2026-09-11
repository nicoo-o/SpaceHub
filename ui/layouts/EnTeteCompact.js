/**
 * SpaceHub — En-tête compact GSM (variante mobile du dock Dynamic Island)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'île, même tapable, reste une interface de bureau : son état replié ne
 * montre qu'un logo et une horloge — la recherche et le menu utilisateur
 * demandent un DEUXIÈME tap dans la bonne zone, sur des cibles minuscules.
 * Une application mobile expose ces deux actions directement.
 *
 * Ce module est le VARIANT en-tête de la coquille GSM : titre, recherche,
 * avatar. Le tap sur l'avatar ouvre le menu utilisateur DANS UNE MODALE —
 * pas le dropdown conçu pour le survol souris. La modale réutilise la classe
 * Modal (confinement du focus, retour, aria déjà gérés), habillée en feuille
 * par GsmNav.css sous html.sh-gsm.
 *
 * Vue pure : les actions (recherche, entrées de menu, déconnexion) sont
 * injectées par AppLayout — le module ne connaît ni window ni les services.
 */

'use strict';

import Logger from '../../core/Logger.js';
import './GsmNav.css';

const ICONES = {
    recherche: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    theme: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
    personnaliser: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
    actualiser: '<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>',
    stats: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
    reglages: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 1 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    deconnexion: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
};

/**
 * Échappement HTML minimal — les entrées de menu portent du texte utilisateur
 * (nom du compte, URL du serveur) et atterrissent dans innerHTML.
 */
function echapper(valeur) {
    if (valeur === null || valeur === undefined) return '';
    return String(valeur).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Crée l'en-tête compact GSM.
 *
 * @param {object} deps
 * @param {() => void} deps.onRecherche            tap sur la loupe
 * @param {() => void} deps.onMenu                 tap sur l'avatar
 * @param {() => string} [deps.titre]
 * @param {() => string} [deps.initialeUtilisateur]
 * @param {() => string|null} [deps.avatarUrl]
 * @param {() => boolean} [deps.estAdmin]          l'entrée Administration existe ?
 * @param {(cle: string) => boolean} [deps.fonctionActive]  FeatureFlags
 * @param {Logger} [deps.logger]
 * @returns {{ render, nettoyer }}
 */
export function creerEnTeteCompact(deps = {}) {
    // Déstructuration évitée : le contrôle des fonctions fantômes ne voit pas
    // à travers les paramètres déstructurés — lire `deps.x` puis des locales
    // est équivalent et lisible.
    const onRecherche = deps.onRecherche;
    const onMenu = deps.onMenu;
    const titre = deps.titre || (() => 'SpaceHub');
    const initialeUtilisateur = deps.initialeUtilisateur || (() => '?');
    const avatarUrl = deps.avatarUrl || (() => null);
    const estAdmin = deps.estAdmin || (() => false);
    const fonctionActive = deps.fonctionActive || (() => true);
    const logger = deps.logger || new Logger('EnTeteCompact');
    if (typeof onRecherche !== 'function') throw new Error('[EnTeteCompact] onRecherche est obligatoire.');
    if (typeof onMenu !== 'function') throw new Error('[EnTeteCompact] onMenu est obligatoire.');

    let racine = null;

    /** Entrées du menu GSM — même contenu que le dropdown PC, ordre stable. */
    function entreesMenu() {
        const entrees = [
            { id: 'theme', libelle: 'Changer de thème', icone: ICONES.theme },
            { id: 'personnaliser', libelle: "Personnaliser l'accueil", icone: ICONES.personnaliser },
            { id: 'actualiser', libelle: "Actualiser l'affichage", icone: ICONES.actualiser },
            { id: 'analytics', libelle: 'Mes Statistiques', icone: ICONES.stats },
        ];
        if (fonctionActive('features.adminConsole') !== false && estAdmin()) {
            entrees.push({ id: 'admin', libelle: 'Administration Serveur', icone: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' });
        }
        entrees.push({ id: 'reglages', libelle: 'Réglages', icone: ICONES.reglages });
        entrees.push({ id: 'deconnexion', libelle: 'Déconnexion', icone: ICONES.deconnexion, danger: true });
        return entrees;
    }

    return {
        /** Injecte l'en-tête (appelé par AppLayout.render, idempotent). */
        render(conteneur) {
            if (!conteneur || conteneur.querySelector('.sh-gsm-header')) return;
            const initiale = echapper(initialeUtilisateur());
            const url = avatarUrl();
            racine = document.createElement('header');
            racine.className = 'sh-gsm-header';
            racine.innerHTML = `
                <div class="sh-gsm-header__brand">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES.dashboard}</svg>
                    <span class="sh-gsm-header__title">${echapper(titre())}</span>
                </div>
                <div class="sh-gsm-header__actions">
                    <button type="button" class="sh-gsm-header__btn" id="sh-gsm-btn-search" aria-label="Recherche" data-nav-focusable="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES.recherche}</svg>
                    </button>
                    <button type="button" class="sh-gsm-header__btn sh-gsm-header__avatar" id="sh-gsm-btn-menu" aria-label="Menu utilisateur" data-nav-focusable="true">
                        ${url ? `<span class="sh-gsm-avatar-img" style="background-image:url('${echapper(url)}')"></span>` : `<span class="sh-gsm-avatar-initiale">${initiale}</span>`}
                    </button>
                </div>
            `;
            racine.querySelector('#sh-gsm-btn-search').addEventListener('click', () => {
                logger.debug('En-tête GSM → recherche');
                onRecherche();
            });
            racine.querySelector('#sh-gsm-btn-menu').addEventListener('click', () => {
                logger.debug('En-tête GSM → menu utilisateur');
                onMenu();
            });
            conteneur.appendChild(racine);
        },

        /**
         * Construit et ouvre le menu utilisateur en modale-feuille.
         * Appelée par AppLayout quand onMenu() est déclenché — la modale
         * (confinement focus, Retour, aria) est gérée par la classe Modal ;
         * GsmNav.css l'habille en feuille sous html.sh-gsm.
         *
         * @param {object} ctx  { modalClass, utilisateur, serveur, actions }
         * @returns {object|null} la modale ouverte (AppLayout garde la réf)
         */
        ouvrirMenu({ modalClass, utilisateur = '', serveur = '', actions = {} } = {}) {
            if (!modalClass) return null;
            const boutons = entreesMenu().map(e => `
                <button type="button" data-nav-focusable="true" class="sh-gsm-menu__item ${e.danger ? 'sh-gsm-menu__item--danger' : ''}" data-action="${e.id}">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${e.icone}</svg>
                    <span>${e.libelle}</span>
                </button>`).join('');
            const contenu = `
                <div class="sh-gsm-menu">
                    <div class="sh-gsm-menu__identite">
                        <strong>${echapper(utilisateur)}</strong>
                        <span class="sh-gsm-menu__serveur">${echapper(serveur)}</span>
                    </div>
                    ${boutons}
                </div>
            `;
            const modal = new modalClass({
                id: 'gsm-user-menu',
                title: '',
                content: contenu,
                size: 'sm',
                showCloseButton: false,
                onClose: () => { if (this._menuModal === modal) this._menuModal = null; },
            });
            this._menuModal = modal;
            modal.open();
            modal._el?.querySelector('.sh-gsm-menu')?.addEventListener('click', (e) => {
                const item = e.target.closest?.('.sh-gsm-menu__item');
                if (!item) return;
                modal.close();
                const action = actions[item.dataset.action];
                if (typeof action === 'function') action();
                else logger.warn(`Action de menu GSM inconnue : ${item.dataset.action}`);
            });
            return modal;
        },

        /** Ferme le menu s'il est ouvert (fermeture programmée, ex. déconnexion). */
        fermerMenu() {
            this._menuModal?.close?.();
            this._menuModal = null;
        },

        nettoyer() {
            this.fermerMenu();
            racine?.remove();
            racine = null;
        },
    };
}

export default creerEnTeteCompact;
