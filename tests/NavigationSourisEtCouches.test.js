/**
 * @vitest-environment jsdom
 *
 * Trois défauts trouvés en test réel, et le même mécanisme derrière deux d'entre eux :
 * du code qui SUIT un état sans que personne ne le LISE.
 *
 *   - la modalité d'entrée : `_state.mode` passait bien à « souris » au moindre
 *     mouvement, mais rien n'en tenait compte. Les classes de focus restaient
 *     posées et l'anneau orange s'affichait pendant qu'on se servait de la
 *     souris — c'est le symptôme signalé : « en navigation souris je vois les
 *     sélections de navigation TV/clavier » ;
 *   - le scope « flux » : `AppLayout` normalise l'onglet Téléchargements en
 *     `'flux'`, or aucun scope ne porte ce nom. Le registre ne trouvait rien,
 *     la liste de candidats était vide, et TOUTES les flèches étaient mortes
 *     dans cette vue ;
 *   - la couche fermée : le panneau latéral n'est masqué que par un
 *     `transform`. Il gardait un rectangle de 270 px et restait donc un
 *     candidat parfaitement valide, hors écran.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';
import { FOCUS_CLASSES } from '../core/DomContracts.js';

navigator.getGamepads = () => [];
window.scrollTo = () => {};
Element.prototype.scrollTo = function () {};
Element.prototype.scrollBy = function () {};
Element.prototype.scrollIntoView = function () {};

const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

function carte(id, x, y, l = 200, h = 200, classe = 'sh-card') {
    const el = document.createElement('div');
    el.id = id;
    el.className = classe;
    el.tabIndex = 0;
    el.setAttribute('data-nav-focusable', 'true');
    el.getBoundingClientRect = () => ({
        left: x, top: y, right: x + l, bottom: y + h, width: l, height: h, x, y,
    });
    document.body.appendChild(el);
    return el;
}

const touche = (key) => ({ key, repeat: false, preventDefault() {}, target: document.body });

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
    document.documentElement.className = '';
});

describe('La souris et la télécommande ne se marchent plus dessus', () => {
    it('un mouvement de souris retire l\'anneau posé par le clavier', () => {
        const el = carte('a', 100, 100);
        nav.setFocus(el, { silent: true, scroll: false });
        for (const c of FOCUS_CLASSES) expect(el.classList.contains(c), c).toBe(true);

        nav._handleMouseMove();

        for (const c of FOCUS_CLASSES) {
            expect(el.classList.contains(c), `${c} doit être retirée à la souris`).toBe(false);
        }
    });

    it('la première flèche le remet, sans avoir perdu la position', () => {
        const el = carte('a', 100, 100);
        nav.setFocus(el, { silent: true, scroll: false });
        nav._handleMouseMove();

        nav._handleKeyDown(touche('ArrowRight'));   // rien à droite : on ne bouge pas
        nav._stopInputRepeat();

        expect(nav._state.focusedElement).toBe(el);
        for (const c of FOCUS_CLASSES) expect(el.classList.contains(c), c).toBe(true);
    });

    it('la modalité est lisible depuis le CSS', () => {
        nav._handleMouseMove();
        expect(document.documentElement.classList.contains('sh-entree-pointeur')).toBe(true);
        expect(document.documentElement.classList.contains('sh-entree-directionnelle')).toBe(false);

        nav._appliquerModalite('directionnel');
        expect(document.documentElement.classList.contains('sh-entree-directionnelle')).toBe(true);
        expect(document.documentElement.classList.contains('sh-entree-pointeur')).toBe(false);
    });

    it('la manette compte comme une entrée directionnelle', () => {
        nav._handleMouseMove();
        nav._onGamepadDirectionStart('right');
        expect(document.documentElement.classList.contains('sh-entree-directionnelle')).toBe(true);
        nav._stopInputRepeat();
    });
});

describe('Chaque vue a un scope qui existe', () => {
    it('la vue « flux » retombe sur le scope « downloads »', () => {
        // Sans cette correspondance, `getFocusables` renvoyait [] et toutes les
        // flèches étaient mortes dans l'onglet Téléchargements.
        window.SpaceHub.ui = { appLayout: { _currentView: 'flux' } };
        vi.spyOn(nav, '_detectCurrentScope');
        const scope = SpatialNavigation.prototype._detectCurrentScope.call(nav);
        expect(scope).toBe('downloads');
    });

    it('toute vue déclarée par la barre du haut a un scope enregistré', () => {
        // Contrat : si un onglet peut devenir la vue courante, son scope doit
        // exister — sinon la vue est navigable à la souris et morte au clavier.
        for (const vue of ['dashboard', 'library', 'flux', 'downloads', 'hub', 'home']) {
            window.SpaceHub.ui = { appLayout: { _currentView: vue } };
            const scope = SpatialNavigation.prototype._detectCurrentScope.call(nav);
            expect(nav._focusRegistry.has(scope), `vue « ${vue} » → scope « ${scope} »`).toBe(true);
        }
    });
});

describe('Une couche fermée ne capture plus le focus', () => {
    it('les éléments sous [inert] ne sont pas des candidats', () => {
        const panneau = document.createElement('aside');
        panneau.id = 'sh-sidebar-panel';
        panneau.setAttribute('inert', '');
        document.body.appendChild(panneau);

        const item = carte('menu-1', -270, 100);
        panneau.appendChild(item);
        const visible = carte('carte-1', 400, 100);

        const candidats = nav.getFocusables('dashboard');
        expect(candidats).not.toContain(item);
        expect(candidats).toContain(visible);
    });

    it('rouvrir la couche les rend de nouveau atteignables', () => {
        const panneau = document.createElement('aside');
        panneau.setAttribute('inert', '');
        document.body.appendChild(panneau);
        const item = carte('menu-1', 20, 100);
        panneau.appendChild(item);

        expect(nav.getFocusables('dashboard')).not.toContain(item);
        panneau.removeAttribute('inert');
        expect(nav.getFocusables('dashboard')).toContain(item);
    });

    it('_isElementVisible existe vraiment et sait dire non', () => {
        // Elle était APPELÉE par popFocus et n'était définie nulle part :
        // `undefined !== false` valant vrai, le test passait toujours.
        expect(typeof nav._isElementVisible).toBe('function');
        const el = carte('a', 100, 100);
        expect(nav._isElementVisible(el)).toBe(true);
        expect(nav._isElementVisible(null)).toBe(false);
        expect(nav._isElementVisible(document.createElement('div'))).toBe(false);
    });
});

describe('Une fermeture ne dépile qu\'une fois', () => {
    it('quatre appels concurrents ne consomment qu\'un point de retour', async () => {
        const depart = carte('depart', 100, 100);
        const dansLaCouche = carte('modale', 400, 100);
        const repli = carte('repli', 700, 100);

        nav.setFocus(depart, { silent: true, scroll: false });
        nav.pushFocus();                       // point de retour = depart
        nav.setFocus(dansLaCouche, { silent: true, scroll: false });

        // Ce que font réellement Modal.close, son rappel onClose,
        // SettingsPanel.close et _closeLayer : quatre appels pour une fermeture.
        nav.onModalClosed();
        nav.onModalClosed();
        nav.onModalClosed();
        nav.onModalClosed();
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        expect(nav._state.focusedElement, 'on doit revenir au point de départ').toBe(depart);
        expect(nav._focusStack.length, 'la pile ne doit pas avoir été vidée').toBe(0);
        void repli;
    });

    it('le rattrapage d\'un élément détruit ne fait pas défiler la page', () => {
        const perdu = carte('perdu', 100, 900);
        carte('premier', 100, 100);
        nav.setFocus(perdu, { silent: true, scroll: false });
        perdu.remove();

        const espion = vi.spyOn(nav, 'setFocus');
        nav._getValidCurrentElement();

        expect(espion).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({ scroll: false }));
    });
});
