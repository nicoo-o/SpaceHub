/**
 * @vitest-environment jsdom
 *
 * La fonction de score — table de cas de figure.
 *
 * Écrite AVANT de toucher au moteur, comme le prévoyait
 * docs/NAVIGATION_ETAT_DE_LART.md. C'est la seule façon de modifier le cœur
 * d'un algorithme sans naviguer à vue : chaque cas décrit ce qu'un utilisateur
 * attend, et la modification doit les satisfaire TOUS — pas seulement celui
 * qu'elle visait.
 *
 * Les cas 1 à 5 décrivent le comportement déjà correct : ils sont là pour
 * détecter une régression. Le cas 6 est celui que le moteur rate aujourd'hui.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';

navigator.getGamepads = () => [];
const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

/**
 * Pose un élément focalisable avec une géométrie imposée.
 * jsdom ne fait aucune mise en page : la géométrie est fournie à la main, ce
 * qui rend chaque cas parfaitement reproductible.
 */
function element(id, { x, y, l, h }) {
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

/** Focalise `depart`, presse `direction`, renvoie l'identifiant atteint. */
function presser(depart, direction) {
    nav.setFocus(depart, { silent: true, scroll: false });
    return nav._findSpatialTarget(direction)?.id ?? null;
}

describe('Cas 1 — deux rangées régulières alignées', () => {
    it('Bas descend dans la même colonne', () => {
        const depart = element('depart', { x: 460, y: 0, l: 200, h: 200 });
        element('bas-gauche', { x: 0, y: 300, l: 200, h: 200 });
        element('bas-meme', { x: 460, y: 300, l: 200, h: 200 });
        element('bas-droite', { x: 920, y: 300, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBe('bas-meme');
    });

    it('Haut remonte dans la même colonne', () => {
        element('haut-meme', { x: 460, y: 0, l: 200, h: 200 });
        element('haut-loin', { x: 1400, y: 0, l: 200, h: 200 });
        const depart = element('depart', { x: 460, y: 300, l: 200, h: 200 });

        expect(presser(depart, NavAction.UP)).toBe('haut-meme');
    });
});

describe('Cas 2 — le voisin le plus proche gagne, à alignement égal', () => {
    it('Bas préfère la rangée immédiatement dessous', () => {
        const depart = element('depart', { x: 100, y: 0, l: 200, h: 200 });
        element('proche', { x: 100, y: 250, l: 200, h: 200 });
        element('lointain', { x: 100, y: 900, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBe('proche');
    });
});

describe('Cas 3 — l\'alignement prime sur la distance brute', () => {
    it('Bas préfère l\'élément aligné, même un peu plus loin', () => {
        // Sur un téléviseur, sauter latéralement en descendant est
        // désorientant : mieux vaut descendre droit, même de plus loin.
        const depart = element('depart', { x: 100, y: 0, l: 200, h: 200 });
        element('aligne-un-peu-plus-loin', { x: 100, y: 400, l: 200, h: 200 });
        element('decale-mais-proche', { x: 900, y: 260, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBe('aligne-un-peu-plus-loin');
    });
});

describe('Cas 4 — grille irrégulière', () => {
    it('Bas trouve la carte qui recouvre le plus la colonne de départ', () => {
        // Rangée du dessous décalée d'un demi-pas : c'est la carte dont la
        // projection recouvre le plus l'élément de départ qui doit gagner.
        const depart = element('depart', { x: 400, y: 0, l: 200, h: 200 });
        element('recouvre-peu', { x: 250, y: 300, l: 200, h: 200 });   // recouvre 100 px
        element('recouvre-beaucoup', { x: 380, y: 300, l: 200, h: 200 }); // recouvre 180 px

        expect(presser(depart, NavAction.DOWN)).toBe('recouvre-beaucoup');
    });
});

describe('Cas 5 — rien dans cette direction', () => {
    it('Bas ne trouve rien sous le dernier élément', () => {
        element('dessus', { x: 100, y: 0, l: 200, h: 200 });
        const depart = element('depart', { x: 100, y: 300, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBeNull();
    });

    it('Droite ne trouve rien à droite du dernier élément', () => {
        element('gauche', { x: 0, y: 0, l: 200, h: 200 });
        const depart = element('depart', { x: 300, y: 0, l: 200, h: 200 });

        expect(presser(depart, NavAction.RIGHT)).toBeNull();
    });
});

describe('Cas 6 — l\'élément large directement dessous', () => {
    it('Bas atteint la bannière pleine largeur, pas la carte lointaine', () => {
        // LE cas que le moteur ratait : la pénalité d'alignement était
        // calculée entre les CENTRES, donc un élément large était puni d'être
        // large — alors que son recouvrement avec l'élément de départ est
        // total. La bannière est à 40 px, la carte à 500 px.
        const depart = element('depart', { x: 100, y: 100, l: 200, h: 200 });
        element('banniere', { x: 0, y: 340, l: 1800, h: 150 });
        element('carte-lointaine', { x: 100, y: 800, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBe('banniere');
    });

    it('Droite atteint un panneau haut placé à droite', () => {
        // Le symétrique horizontal : un panneau vertical (une barre latérale,
        // une colonne d'informations) à droite d'une petite carte.
        const depart = element('depart', { x: 100, y: 400, l: 200, h: 200 });
        element('panneau', { x: 360, y: 0, l: 300, h: 1000 });
        element('carte-lointaine', { x: 1500, y: 400, l: 200, h: 200 });

        expect(presser(depart, NavAction.RIGHT)).toBe('panneau');
    });

    it('une bannière NON recouvrante ne gagne pas pour autant', () => {
        // Garde-fou : ce n'est pas « les gros éléments gagnent toujours ».
        // Cette bannière-ci est décalée, elle ne recouvre pas la colonne.
        const depart = element('depart', { x: 100, y: 100, l: 200, h: 200 });
        element('banniere-decalee', { x: 900, y: 340, l: 900, h: 150 });
        element('carte-alignee', { x: 100, y: 500, l: 200, h: 200 });

        expect(presser(depart, NavAction.DOWN)).toBe('carte-alignee');
    });
});

describe('Cas 7 — mémoire de colonne', () => {
    it('deux descentes successives restent dans la colonne de départ', () => {
        // On descend d'une carte étroite vers une rangée dense, puis encore :
        // la seconde descente doit viser la colonne d'ORIGINE, pas celle où
        // l'on a atterri. C'est le rôle de `_lastColumnX`.
        const depart = element('depart', { x: 500, y: 0, l: 200, h: 100 });
        element('milieu', { x: 480, y: 200, l: 240, h: 100 });
        element('bas-aligne', { x: 500, y: 400, l: 200, h: 100 });
        element('bas-decale', { x: 1200, y: 400, l: 200, h: 100 });

        nav.setFocus(depart, { silent: true, scroll: false });
        const premier = nav._findSpatialTarget(NavAction.DOWN);
        expect(premier.id).toBe('milieu');

        nav.setFocus(premier, { silent: true, scroll: false, reason: 'vertical-move' });
        expect(nav._findSpatialTarget(NavAction.DOWN)?.id).toBe('bas-aligne');
    });
});
