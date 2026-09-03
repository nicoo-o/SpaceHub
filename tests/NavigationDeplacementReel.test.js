/**
 * @vitest-environment jsdom
 *
 * Le déplacement du focus, exécuté POUR DE VRAI.
 *
 * Ce fichier existe à cause d'une leçon coûteuse. Une `ReferenceError` dormait
 * dans `_executeNavStep` — le code lisait une variable `direction` qui n'existe
 * pas dans cette portée, alors que le paramètre s'appelle `action`. Le fichier
 * étant en mode strict, CHAQUE appui sur une flèche levait, avant même d'avoir
 * déplacé quoi que ce soit. La navigation au clavier ne fonctionnait pas.
 *
 * 159 tests unitaires et 13 scénarios de bout en bout ne l'ont pas vue. Pas par
 * malchance — par construction :
 *
 *   - les huit tests qui touchaient au moteur de répétition faisaient
 *     `vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {})`. Ils
 *     mockaient exactement la fonction cassée, parce qu'ils s'intéressaient à
 *     la cadence et non au déplacement ;
 *   - aucun scénario E2E n'a jamais pressé une touche fléchée. Ils pressaient
 *     Échap, Ctrl+K, appelaient `_findSpatialTarget` directement — jamais le
 *     chemin complet.
 *
 * Une fonction mockée dans tous les tests qui la traversent n'est pas testée.
 * Les tests ci-dessous ne mockent RIEN du chemin de déplacement : ils partent
 * d'un événement clavier et vérifient que le focus a bougé.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';

navigator.getGamepads = () => [];
const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

function carte(id, x, y, l = 200, h = 200) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'sh-card';
    el.tabIndex = 0;
    el.getBoundingClientRect = () => ({
        left: x, top: y, right: x + l, bottom: y + h, width: l, height: h, x, y,
    });
    document.body.appendChild(el);
    return el;
}

/** Événement clavier minimal, tel que `_handleKeyDown` le reçoit. */
function touche(key, { repeat = false } = {}) {
    return { key, repeat, preventDefault() {}, target: document.body };
}

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
    vi.spyOn(nav, '_detectCurrentScope').mockReturnValue('dashboard');
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
});

describe('_executeNavStep déplace réellement le focus', () => {
    it('ne lève pas, et bouge le focus', () => {
        const depart = carte('depart', 100, 100);
        const droite = carte('droite', 400, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(() => nav._executeNavStep(NavAction.RIGHT, false)).not.toThrow();
        expect(nav._state.focusedElement).toBe(droite);
    });

    it('marque un déplacement vertical comme tel', () => {
        // La raison « vertical-move » commande la mémoire de colonne : s'en
        // tromper fait dériver le focus latéralement au fil des descentes.
        const depart = carte('depart', 100, 100);
        carte('bas', 100, 400);
        nav.setFocus(depart, { silent: true, scroll: false });

        const espion = vi.spyOn(nav, 'setFocus');
        nav._executeNavStep(NavAction.DOWN, false);

        expect(espion).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({ reason: 'vertical-move' }));
    });

    it('marque un déplacement horizontal comme une répétition', () => {
        const depart = carte('depart', 100, 100);
        carte('droite', 400, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        const espion = vi.spyOn(nav, 'setFocus');
        nav._executeNavStep(NavAction.RIGHT, false);

        expect(espion).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({ reason: 'repeat' }));
    });

    it('ne fait rien, sans lever, quand il n\'y a rien dans cette direction', () => {
        const depart = carte('depart', 100, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(() => nav._executeNavStep(NavAction.RIGHT, false)).not.toThrow();
        expect(nav._state.focusedElement).toBe(depart);
    });
});

describe('Le chemin complet, de la touche au focus', () => {
    it('une flèche déplace le focus — RIEN n\'est mocké sur ce chemin', () => {
        // C'est LE test qui manquait. Il part d'un événement clavier et va
        // jusqu'au focus, en passant par _handleKeyDown, _startInputRepeat et
        // _executeNavStep, sans doublure d'aucune sorte.
        const depart = carte('depart', 100, 100);
        const droite = carte('droite', 400, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        nav._handleKeyDown(touche('ArrowRight'));

        expect(nav._state.focusedElement).toBe(droite);
        nav._stopInputRepeat();
    });

    it('les quatre directions fonctionnent depuis un événement clavier', () => {
        const centre = carte('centre', 500, 500);
        const h = carte('h', 500, 100);
        const b = carte('b', 500, 900);
        const g = carte('g', 100, 500);
        const d = carte('d', 900, 500);

        for (const [cle, attendu] of [['ArrowUp', h], ['ArrowDown', b],
            ['ArrowLeft', g], ['ArrowRight', d]]) {
            nav._stopInputRepeat();
            nav._lastColumnX = null;
            nav.setFocus(centre, { silent: true, scroll: false });
            nav._handleKeyDown(touche(cle));
            expect(nav._state.focusedElement, `touche ${cle}`).toBe(attendu);
        }
        nav._stopInputRepeat();
    });

    it('aucune exception n\'échappe au gestionnaire', () => {
        // Le routeur d'entrée attrape les exceptions pour qu'un gestionnaire
        // fautif ne prive pas les autres de clavier. C'est un filet, pas une
        // excuse : ce qu'il attrape doit rester exceptionnel, et un test doit
        // le voir. Sans ce test, l'erreur restait une ligne dans la console.
        const depart = carte('depart', 100, 100);
        carte('droite', 400, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        for (const cle of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape']) {
            expect(() => nav._handleKeyDown(touche(cle)), `touche ${cle}`).not.toThrow();
        }
        nav._stopInputRepeat();
    });

    it('la répétition native du navigateur ne relance pas le moteur', () => {
        const depart = carte('depart', 100, 100);
        const droite = carte('droite', 400, 100);
        carte('loin', 700, 100);
        nav.setFocus(depart, { silent: true, scroll: false });

        nav._handleKeyDown(touche('ArrowRight'));
        expect(nav._state.focusedElement).toBe(droite);

        // e.repeat = true : c'est le système qui répète, le moteur a déjà sa
        // propre cadence. Il ne doit pas avancer une seconde fois.
        nav._handleKeyDown(touche('ArrowRight', { repeat: true }));
        expect(nav._state.focusedElement).toBe(droite);
        nav._stopInputRepeat();
    });
});
