/**
 * @vitest-environment jsdom
 *
 * Les quatre classes de bogues de focus des applications de télévision.
 *
 * Netflix les a nommées dans son retour d'expérience sur l'entrée utilisateur
 * (« Pass the Remote ») :
 *
 *   1. plusieurs éléments essaient de prendre le focus en même temps ;
 *   2. quelque chose DERRIÈRE la vue du dessus vole le focus ;
 *   3. changer de modalité produit un double focus, ou aucun ;
 *   4. l'élément focalisé est retiré, et rien ne reprend le focus.
 *
 * SpaceHub les avait toutes les quatre. La classe 3 est couverte par
 * `NavigationSourisEtCouches`. Celles-ci couvrent 1, 2 et 4.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';

navigator.getGamepads = () => [];
window.scrollTo = () => {};
Element.prototype.scrollTo = function () {};
Element.prototype.scrollBy = function () {};
Element.prototype.scrollIntoView = function () {};

const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

function bouton(id, x, y, parent = document.body, l = 160, h = 44) {
    const el = document.createElement('button');
    el.id = id;
    el.tabIndex = 0;
    el.setAttribute('data-nav-focusable', 'true');
    el.getBoundingClientRect = () => ({
        left: x, top: y, right: x + l, bottom: y + h, width: l, height: h, x, y,
    });
    parent.appendChild(el);
    return el;
}

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
    nav._appliquerModalite('directionnel');
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
});

describe('Classe 2 — rien derrière la couche du dessus ne vole le focus', () => {
    it('un conteneur strict piège le focus tant qu\'il est ouvert', () => {
        const derriere = bouton('carte-derriere', 100, 100);

        const modale = document.createElement('div');
        modale.className = 'sh-modal--open';
        modale.dataset.navContainer = 'strict';
        document.body.appendChild(modale);
        const dedans = bouton('dans-modale', 500, 400, modale);
        bouton('dans-modale-2', 500, 500, modale);

        nav.setFocus(dedans, { silent: true, scroll: false });
        // La carte du tableau de bord est EN HAUT à gauche : sans confinement,
        // une montée l'atteindrait.
        nav._executeNavStep(NavAction.UP, false);
        expect(nav._state.focusedElement).not.toBe(derriere);
        expect(modale.contains(nav._state.focusedElement)).toBe(true);
    });

    it('une couche fermée ne piège plus rien', () => {
        const dehors = bouton('dehors', 100, 100);
        const modale = document.createElement('div');
        modale.dataset.navContainer = 'strict';
        modale.setAttribute('inert', '');
        document.body.appendChild(modale);
        const dedans = bouton('dedans', 500, 400, modale);

        nav.setFocus(dedans, { silent: true, scroll: false });
        nav._executeNavStep(NavAction.UP, false);
        expect(nav._state.focusedElement).toBe(dehors);
    });

    it('le scope courant ignore une couche en cours de fermeture', () => {
        const lecteur = document.createElement('div');
        lecteur.id = 'sh-grand-cinema-player';
        document.body.appendChild(lecteur);
        expect(nav._detectCurrentScope()).toBe('player');

        // C'est exactement ce que fait `VideoPlayer.close()` : le nœud reste
        // 320 ms de plus dans le document pour son animation de sortie.
        lecteur.setAttribute('inert', '');
        expect(nav._detectCurrentScope()).not.toBe('player');
    });

    it('un scope confiné sans sa couche renvoie une liste VIDE, pas la page', () => {
        // Le repli `|| root` faisait retomber ces scopes sur `document` : le
        // scope « confiné » proposait alors tous les contrôles de la page.
        bouton('ailleurs', 100, 100);
        for (const scope of ['player', 'settings', 'search']) {
            expect(nav.getFocusables(scope), `scope ${scope}`).toHaveLength(0);
        }
    });
});

describe('Classe 4 — le hero ne détruit plus l\'élément focalisé', () => {
    it('la rotation se met en pause quand le focus est dans le hero', async () => {
        const { default: Hero } = await import('../ui/components/HeroSpotlightComponent.js');
        const hero = new Hero();

        const conteneur = document.createElement('div');
        document.body.appendChild(conteneur);
        const btn = bouton('sh-hero-btn-trailer', 200, 600, conteneur);

        window.SpaceHub.core = { spatialNavigation: nav };
        nav.setFocus(btn, { silent: true, scroll: false });

        expect(hero._peutTourner(conteneur)).toBe(false);

        // Focus ailleurs : la rotation reprend.
        const dehors = bouton('dehors', 100, 100);
        nav.setFocus(dehors, { silent: true, scroll: false });
        expect(hero._peutTourner(conteneur)).toBe(true);
    });

    it('elle se met aussi en pause quand l\'onglet n\'est pas visible', async () => {
        const { default: Hero } = await import('../ui/components/HeroSpotlightComponent.js');
        const hero = new Hero();
        const conteneur = document.createElement('div');
        document.body.appendChild(conteneur);

        const original = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        expect(hero._peutTourner(conteneur)).toBe(false);
        if (original) Object.defineProperty(Document.prototype, 'hidden', original);
        else delete document.hidden;
    });
});

describe('Les commandes qui n\'avaient aucun destinataire', () => {
    it('Lecture/Pause active l\'élément focalisé hors du lecteur', () => {
        const cible = bouton('affiche', 100, 100);
        nav.setFocus(cible, { silent: true, scroll: false });
        const active = vi.spyOn(nav, 'activateFocused');

        nav._handleKeyDown({ key: 'MediaPlayPause', repeat: false, preventDefault() {}, target: document.body });
        expect(active).toHaveBeenCalled();
    });
});
