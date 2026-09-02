/**
 * @vitest-environment jsdom
 *
 * Vague C — conteneurs par l'arbre DOM, et cache de mesure par salve.
 *
 * Ces deux-là sont les plus structurants du plan, et le plan disait de les
 * garder pour APRÈS la recette matériel. Ils sont faits avant, à la demande.
 * La contrepartie est ici : chaque comportement est figé par un test, y
 * compris les cas où le nouveau mécanisme ne doit PAS s'appliquer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';

navigator.getGamepads = () => [];
const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

function element(id, { x, y, l = 200, h = 200 }, parent = document.body) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'sh-card';
    el.tabIndex = 0;
    el.getBoundingClientRect = () => ({
        left: x, top: y, right: x + l, bottom: y + h, width: l, height: h, x, y,
    });
    parent.appendChild(el);
    return el;
}

function boite(id, options = {}) {
    const b = document.createElement('div');
    b.id = id;
    if (options.conteneur) b.dataset.navContainer = options.conteneur;
    b.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1920, bottom: 1080,
        width: 1920, height: 1080, x: 0, y: 0 });
    document.body.appendChild(b);
    return b;
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

// ─── Écart 3 : conteneurs par l'arbre ────────────────────────────────────────

describe('Conteneurs de navigation déclarés dans l\'arbre', () => {
    it('sans conteneur déclaré, le scope global décide — comportement inchangé', () => {
        const depart = element('depart', { x: 100, y: 0 });
        const bas = element('bas', { x: 100, y: 300 });
        nav.setFocus(depart, { silent: true, scroll: false });

        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(bas);
    });

    it('cherche d\'abord DANS le conteneur, avant de regarder ailleurs', () => {
        // « self-first » d'Enact : à distance égale, ce qui est dans le
        // conteneur courant l'emporte sur ce qui est dehors.
        const b = boite('boite', { conteneur: 'auto' });
        const depart = element('depart', { x: 100, y: 0 }, b);
        const dedans = element('dedans', { x: 100, y: 400 }, b);
        element('dehors', { x: 100, y: 300 });   // pourtant PLUS PROCHE

        nav.setFocus(depart, { silent: true, scroll: false });
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dedans);
    });

    it('remonte au conteneur parent quand le sien est épuisé', () => {
        // W3C : « le traitement remonte au conteneur parent », récursivement.
        const parent = boite('parent', { conteneur: 'auto' });
        const enfant = document.createElement('div');
        enfant.dataset.navContainer = 'auto';
        enfant.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 200,
            width: 500, height: 200, x: 0, y: 0 });
        parent.appendChild(enfant);

        const depart = element('depart', { x: 100, y: 0 }, enfant);
        const ailleurs = element('ailleurs', { x: 100, y: 400 }, parent);

        nav.setFocus(depart, { silent: true, scroll: false });
        // Rien sous « depart » dans l'enfant : on remonte au parent.
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(ailleurs);
    });

    it('« strict » piège le focus — il ne sort jamais', () => {
        // « self-only » d'Enact : le comportement attendu d'une modale.
        const b = boite('modale', { conteneur: 'strict' });
        const depart = element('depart', { x: 100, y: 0 }, b);
        element('hors-modale', { x: 100, y: 400 });

        nav.setFocus(depart, { silent: true, scroll: false });
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBeNull();
    });

    it('« strict » laisse circuler à l\'intérieur', () => {
        const b = boite('modale', { conteneur: 'strict' });
        const depart = element('depart', { x: 100, y: 0 }, b);
        const bas = element('bas', { x: 100, y: 400 }, b);

        nav.setFocus(depart, { silent: true, scroll: false });
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(bas);
    });

    it('un conteneur vide ne bloque pas la navigation', () => {
        // Cas dégradé : le conteneur existe mais ne contient rien d'autre.
        const b = boite('vide', { conteneur: 'auto' });
        const depart = element('depart', { x: 100, y: 0 }, b);
        const dehors = element('dehors', { x: 100, y: 400 });

        nav.setFocus(depart, { silent: true, scroll: false });
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(dehors);
    });

    it('la redirection déclarée passe AVANT le conteneur, même strict', () => {
        // L'ordre des priorités doit être sans ambiguïté : une redirection est
        // une instruction explicite, elle prime sur un confinement générique.
        const b = boite('modale', { conteneur: 'strict' });
        const depart = element('depart', { x: 100, y: 0 }, b);
        const cible = element('cible', { x: 100, y: 400 });
        depart.dataset.navDown = '#cible';

        nav.setFocus(depart, { silent: true, scroll: false });
        expect(nav._findSpatialTarget(NavAction.DOWN)).toBe(cible);
    });
});

// ─── Écart 5 : cache de mesure par salve ─────────────────────────────────────

describe('Cache de visibilité pendant une salve de répétition', () => {
    /** Compte les appels à getComputedStyle sur un cycle. */
    function compterStyles(fn) {
        const original = window.getComputedStyle;
        let n = 0;
        window.getComputedStyle = function (...a) { n++; return original.apply(window, a); };
        try { fn(); } finally { window.getComputedStyle = original; }
        return n;
    }

    it('hors salve, chaque appui résout le style — aucun cache', () => {
        for (let i = 0; i < 5; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });

        const premier = compterStyles(() => nav._findSpatialTarget(NavAction.RIGHT));
        const second = compterStyles(() => nav._findSpatialTarget(NavAction.RIGHT));

        expect(premier).toBeGreaterThan(0);
        expect(second).toBe(premier);   // rien n'est retenu d'un appui à l'autre
    });

    it('pendant une salve, le style n\'est résolu qu\'une fois', () => {
        for (let i = 0; i < 5; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});

        nav._startInputRepeat(NavAction.RIGHT);
        const premier = compterStyles(() => nav._findSpatialTarget(NavAction.RIGHT));
        const second = compterStyles(() => nav._findSpatialTarget(NavAction.RIGHT));
        nav._stopInputRepeat();

        expect(premier).toBeGreaterThan(0);
        expect(second).toBe(0);   // tout vient du cache
    });

    it('les rectangles restent recalculés à chaque appui', () => {
        // Non négociable : une salve fait défiler, donc les positions bougent.
        // Les cacher renverrait un focus qui saute.
        for (let i = 0; i < 5; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});

        // Les éléments de test redéfinissent getBoundingClientRect sur
        // l'INSTANCE : patcher le prototype n'intercepterait rien. On
        // instrumente donc chaque instance.
        let n = 0;
        for (const el of document.querySelectorAll('.sh-card')) {
            const original = el.getBoundingClientRect.bind(el);
            el.getBoundingClientRect = () => { n++; return original(); };
        }

        nav._startInputRepeat(NavAction.RIGHT);
        nav._findSpatialTarget(NavAction.RIGHT);
        const apresPremier = n;
        nav._findSpatialTarget(NavAction.RIGHT);
        const apresSecond = n;
        nav._stopInputRepeat();

        expect(apresPremier).toBeGreaterThan(0);
        expect(apresSecond - apresPremier).toBeGreaterThan(0);
    });

    it('le relâchement vide le cache', () => {
        for (let i = 0; i < 5; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});

        nav._startInputRepeat(NavAction.RIGHT);
        expect(nav._cacheVisibilite).toBeInstanceOf(Map);
        nav._stopInputRepeat();
        expect(nav._cacheVisibilite).toBeNull();
    });

    it('un redimensionnement vide le cache en cours de salve', () => {
        // La mise en page est refaite : le verdict retenu n'est plus fiable.
        for (let i = 0; i < 5; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});

        nav._startInputRepeat(NavAction.RIGHT);
        nav._findSpatialTarget(NavAction.RIGHT);
        expect(nav._cacheVisibilite.size).toBeGreaterThan(0);

        nav._handleResize();
        expect(nav._cacheVisibilite.size).toBe(0);
        nav._stopInputRepeat();
    });

    it('un élément passé en display:none reste écarté malgré le cache', () => {
        // Le rectangle est toujours recalculé : display:none donne un
        // rectangle nul, donc l'élément sort des candidats même si son
        // verdict de style est en cache.
        for (let i = 0; i < 4; i++) element(`c${i}`, { x: i * 250, y: 0 });
        nav.setFocus(document.getElementById('c0'), { silent: true, scroll: false });
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});

        nav._startInputRepeat(NavAction.RIGHT);
        expect(nav._findSpatialTarget(NavAction.RIGHT)?.id).toBe('c1');

        const c1 = document.getElementById('c1');
        c1.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0,
            width: 0, height: 0, x: 0, y: 0 });

        expect(nav._findSpatialTarget(NavAction.RIGHT)?.id).toBe('c2');
        nav._stopInputRepeat();
    });
});
