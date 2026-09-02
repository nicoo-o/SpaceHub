/**
 * @vitest-environment jsdom
 *
 * Vague A — les trois mécanismes empruntés aux systèmes professionnels.
 *
 * Chacun répond à un écart relevé dans docs/NAVIGATION_ETAT_DE_LART.md, et
 * chacun est ADDITIF : sans l'attribut correspondant, le comportement doit être
 * rigoureusement celui d'avant. C'est ce que ces tests vérifient en premier —
 * une régression silencieuse sur le cas « aucun attribut » serait pire que
 * l'absence de la fonctionnalité.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';

// GamepadInput est instancié par le constructeur ; jsdom n'a pas cette API.
navigator.getGamepads = () => [];

const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

/** Place un élément focalisable à une position donnée. */
function carte(id, x, y, l = 200, h = 200, parent = document.body) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'sh-card';
    el.tabIndex = 0;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${l}px;height:${h}px;`;
    // jsdom ne calcule pas les mises en page : on fournit la géométrie.
    el.getBoundingClientRect = () => ({
        left: x, top: y, right: x + l, bottom: y + h,
        width: l, height: h, x, y,
    });
    parent.appendChild(el);
    return el;
}

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
    // Le scope « dashboard » regarde `.sh-card` : c'est le plus simple à peupler.
    vi.spyOn(nav, '_detectCurrentScope').mockReturnValue('dashboard');
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
});

// ─── Écart 4 : redirections déclaratives ─────────────────────────────────────

describe('Redirections déclaratives (data-nav-*)', () => {
    it('sans attribut, la géométrie décide — comportement inchangé', () => {
        const depart = carte('depart', 100, 100);
        const dessous = carte('dessous', 100, 400);
        carte('loin', 1000, 400);
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dessous);
    });

    it('data-nav-down redirige vers le sélecteur indiqué', () => {
        // Équivalent d'un UIFocusGuide tvOS ou d'un leaveFor Enact : on désigne
        // la destination sans toucher à la mise en page.
        const depart = carte('depart', 100, 100);
        carte('geometrique', 100, 400);
        const voulu = carte('voulu', 1400, 900);
        depart.dataset.navDown = '#voulu';
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(voulu);
    });

    it('les quatre directions sont lues', () => {
        const depart = carte('depart', 500, 500);
        const h = carte('h', 0, 0);
        const b = carte('b', 0, 900);
        const g = carte('g', 0, 500);
        const d = carte('d', 1400, 500);
        Object.assign(depart.dataset, { navUp: '#h', navDown: '#b', navLeft: '#g', navRight: '#d' });
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.UP)).toBe(h);
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(b);
        expect(nav._findSpatialTarget(NavAction.LEFT)).toBe(g);
        expect(nav._findSpatialTarget(NavAction.RIGHT)).toBe(d);
    });

    it('un sélecteur qui ne correspond à rien laisse la géométrie décider', () => {
        // Une redirection cassée ne doit jamais bloquer la navigation : c'est
        // le pire défaut possible pour ce genre de mécanisme.
        const depart = carte('depart', 100, 100);
        const dessous = carte('dessous', 100, 400);
        depart.dataset.navDown = '#nexistepas';
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dessous);
    });

    it('un sélecteur invalide ne lève pas', () => {
        const depart = carte('depart', 100, 100);
        const dessous = carte('dessous', 100, 400);
        depart.dataset.navDown = ':::pas un sélecteur:::';
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(() => nav._findSpatialTarget(NavAction.DOWN)).not.toThrow();
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dessous);
    });

    it('une cible cachée est ignorée au profit de la géométrie', () => {
        // Rediriger vers un élément invisible bloquerait l'utilisateur.
        const depart = carte('depart', 100, 100);
        const dessous = carte('dessous', 100, 400);
        const cache = carte('cache', 1400, 900);
        cache.style.display = 'none';
        cache.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
        depart.dataset.navDown = '#cache';
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dessous);
    });

    it('« none » bloque le déplacement dans cette direction', () => {
        // Équivalent du leaveFor: '' d'Enact — un bord dur, volontaire.
        const depart = carte('depart', 100, 100);
        carte('dessous', 100, 400);
        depart.dataset.navDown = 'none';
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBeNull();
    });
});

// ─── Écart 2 : mémoire de focus par conteneur ────────────────────────────────

describe('Mémoire de focus par conteneur (data-focus)', () => {
    /** Une rangée de carrousel contenant des cartes. */
    function rangee(id, y, nombre) {
        const r = document.createElement('div');
        r.id = id;
        r.className = 'sh-card-grid';
        r.style.cssText = `position:absolute;left:0;top:${y}px;width:1900px;height:200px;`;
        r.getBoundingClientRect = () => ({ left: 0, top: y, right: 1900, bottom: y + 200,
            width: 1900, height: 200, x: 0, y });
        document.body.appendChild(r);
        const cartes = [];
        for (let i = 0; i < nombre; i++) cartes.push(carte(`${id}-${i}`, i * 230, y, 200, 200, r));
        return { r, cartes };
    }

    it('mémorise la dernière carte focalisée de chaque rangée', () => {
        const a = rangee('rangeeA', 0, 5);
        nav.setFocus(a.cartes[3], { silent: true, scroll: false });
        expect(a.r.dataset.focus).toBe('rangeeA-3');
    });

    it('revenir dans une rangée y restaure la position quittée', () => {
        // C'est le comportement de Netflix, et le enterTo: 'last-focused'
        // d'Enact : on quitte une rangée en huitième position, on y revient
        // en huitième position.
        const a = rangee('rangeeA', 0, 10);
        const b = rangee('rangeeB', 400, 10);

        nav.setFocus(a.cartes[7], { silent: true, scroll: false });
        nav.setFocus(b.cartes[0], { silent: true, scroll: false });

        const retour = nav._cibleMemorisee(b.cartes[0], NavAction.UP);
        expect(retour).toBe(a.cartes[7]);
    });

    it('une rangée jamais visitée n\'a pas de mémoire', () => {
        const a = rangee('rangeeA', 0, 5);
        const b = rangee('rangeeB', 400, 5);
        nav.setFocus(b.cartes[0], { silent: true, scroll: false });

        expect(nav._cibleMemorisee(b.cartes[0], NavAction.UP)).toBeNull();
        expect(a.r.dataset.focus).toBeUndefined();
    });

    it('une carte mémorisée qui a disparu ne bloque pas', () => {
        // Le contenu d'une rangée est rechargé en permanence : la mémoire doit
        // se périmer d'elle-même, pas renvoyer un élément détaché.
        const a = rangee('rangeeA', 0, 5);
        const b = rangee('rangeeB', 400, 5);
        nav.setFocus(a.cartes[3], { silent: true, scroll: false });
        nav.setFocus(b.cartes[0], { silent: true, scroll: false });
        a.cartes[3].remove();

        expect(nav._cibleMemorisee(b.cartes[0], NavAction.UP)).toBeNull();
    });

    it('la mémoire ne s\'applique pas au déplacement horizontal', () => {
        // Gauche/droite reste un déplacement DANS la rangée : y appliquer la
        // mémoire ferait sauter le focus au lieu de le faire avancer d'un cran.
        const a = rangee('rangeeA', 0, 5);
        nav.setFocus(a.cartes[2], { silent: true, scroll: false });
        expect(nav._cibleMemorisee(a.cartes[2], NavAction.RIGHT)).toBeNull();
    });
});

// ─── Écart 6 : Retour à la racine ────────────────────────────────────────────

describe('Retour quand aucune couche n\'est ouverte', () => {
    it('appelle la sortie Tizen quand elle est disponible', () => {
        const quitter = vi.fn();
        window.tizen = { application: { getCurrentApplication: () => ({ exit: quitter }) } };
        nav._handleBack({});
        expect(quitter).toHaveBeenCalled();
        delete window.tizen;
    });

    it('appelle platformBack sur webOS', () => {
        const retour = vi.fn();
        window.webOS = { platformBack: retour };
        nav._handleBack({});
        expect(retour).toHaveBeenCalled();
        delete window.webOS;
    });

    it('en mode TV, remonte l\'historique s\'il y a où aller', () => {
        // Cas d'un téléviseur qui n'est ni Tizen ni webOS : aucune API de
        // sortie, l'historique est le seul chemin.
        const enArriere = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        document.documentElement.classList.add('sh-tv-mode');
        Object.defineProperty(window.history, 'length', { value: 3, configurable: true });
        nav._handleBack({});
        expect(enArriere).toHaveBeenCalled();
        document.documentElement.classList.remove('sh-tv-mode');
    });

    it('hors mode TV, ne touche PAS à l\'historique', () => {
        // Sur un ordinateur, Échap au niveau racine ne fait rien dans toutes
        // les applications web. Sortir du site à la place surprendrait sans
        // rien apporter.
        const enArriere = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        Object.defineProperty(window.history, 'length', { value: 3, configurable: true });
        nav._handleBack({});
        expect(enArriere).not.toHaveBeenCalled();
    });

    it('ne fait rien quand il n\'y a nulle part où aller', () => {
        const enArriere = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        document.documentElement.classList.add('sh-tv-mode');
        Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
        nav._handleBack({});
        expect(enArriere).not.toHaveBeenCalled();
        document.documentElement.classList.remove('sh-tv-mode');
    });

    it('ne quitte PAS l\'application quand une couche est ouverte', () => {
        // La règle absolue : la sortie est le dernier recours, jamais un
        // raccourci qui court-circuite la fermeture d'une modale.
        const quitter = vi.fn();
        window.tizen = { application: { getCurrentApplication: () => ({ exit: quitter }) } };
        const couche = document.createElement('div');
        couche.className = 'sh-spotlight-overlay open';
        document.body.appendChild(couche);
        nav.pushLayer('search');
        vi.spyOn(nav, '_closeLayer').mockImplementation(() => {});

        nav._handleBack({});

        expect(quitter).not.toHaveBeenCalled();
        delete window.tizen;
    });
});
