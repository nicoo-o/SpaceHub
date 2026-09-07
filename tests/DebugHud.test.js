/**
 * @vitest-environment jsdom
 *
 * HUD de diagnostic — et surtout ce qu'il ne doit pas faire.
 *
 * Un outil de diagnostic a une exigence particulière : il doit être
 * rigoureusement invisible pour ce qu'il observe. Un HUD qui devient une cible
 * de navigation, qui capte le focus, ou qui continue de mesurer une fois
 * éteint, fausse exactement la mesure qu'on lui demande.
 *
 * Ces tests portent donc autant sur son innocuité que sur son contenu.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebugHud } from '../core/dev/DebugHud.js';

/** Faux moteur : on vérifie le HUD, pas la navigation. */
function moteur({ diagnosticActif = false } = {}) {
    let diag = diagnosticActif ? {} : null;
    return {
        activerDiagnostic: vi.fn((actif) => { diag = actif ? { voie: null } : null; }),
        dernierDiagnostic: () => diag,
        getFocusedElement: () => document.querySelector('.sh-card'),
        _state: { scope: 'dashboard' },
        _poser: (d) => { diag = d; },
    };
}

let nav;
beforeEach(() => {
    document.body.innerHTML = '<div class="sh-card" tabindex="0">Interstellar</div>';
    nav = moteur();
    // `svc.nav()` résout 'nav.spatial' dans le registre, puis retombe sur
    // SpaceHub.core.spatialNavigation — on alimente le vrai chemin.
    window.SpaceHub = {
        core: {
            eventBus: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
            spatialNavigation: nav,
        },
    };
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Innocuité', () => {
    it('n\'est jamais une cible de navigation', () => {
        const hud = new DebugHud();
        hud.allumer();
        const el = document.getElementById('sh-debug-hud');
        expect(el, 'le HUD ne s\'est pas construit').toBeTruthy();

        // `inert` retire tout le sous-arbre du parcours de focus ET de l'arbre
        // d'accessibilité. Sans lui, une flèche pourrait atterrir sur le HUD.
        expect(el.hasAttribute('inert')).toBe(true);
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.getAttribute('data-nav-focusable')).toBeNull();
        expect(el.style.pointerEvents).toBe('none');
        hud.eteindre();
    });

    it('coupe la consignation du moteur en s\'éteignant', () => {
        const hud = new DebugHud();
        hud.allumer();
        expect(nav.activerDiagnostic).toHaveBeenCalledWith(true);

        hud.eteindre();
        expect(nav.activerDiagnostic).toHaveBeenLastCalledWith(false);
        // Un diagnostic qui resterait allumé coûterait sur chaque appui de
        // touche, indéfiniment, sans que personne ne regarde.
    });

    it('n\'arrête plus le minuteur qu\'une fois, et sans lever', () => {
        const hud = new DebugHud();
        hud.allumer();
        expect(hud.eteindre()).toBe(true);
        expect(hud.eteindre(), 'un second arrêt devrait être sans effet').toBe(false);
        expect(document.getElementById('sh-debug-hud')).toBeNull();
    });

    it('ne se construit pas deux fois', () => {
        const hud = new DebugHud();
        hud.allumer();
        hud.allumer();
        expect(document.querySelectorAll('#sh-debug-hud').length).toBe(1);
        hud.eteindre();
    });

    it('refuse de s\'allumer sans moteur, sans lever', () => {
        window.SpaceHub.core.spatialNavigation = null;
        const hud = new DebugHud();
        expect(hud.allumer()).toBe(false);
        expect(document.getElementById('sh-debug-hud')).toBeNull();
    });
});

describe('Contenu', () => {
    it('affiche la décision telle que le moteur l\'a prise', () => {
        vi.useFakeTimers();
        const hud = new DebugHud();
        hud.allumer();

        // Le HUD ne recalcule RIEN : il lit ce que le moteur a consigné.
        nav._poser({
            direction: 'RIGHT', scope: 'library', candidats: 14,
            voie: 'carrousel', score: 4210, latence: 1.83,
        });
        vi.advanceTimersByTime(200);

        const texte = document.getElementById('sh-debug-hud').textContent;
        expect(texte).toContain('RIGHT');
        expect(texte).toContain('library');
        expect(texte).toContain('14');
        expect(texte).toContain('carrousel');
        expect(texte).toContain('4210');
        expect(texte).toContain('1.83 ms');
        hud.eteindre();
    });

    it('montre la modalité d\'entrée en cours', () => {
        vi.useFakeTimers();
        document.documentElement.classList.add('sh-entree-directionnelle');
        const hud = new DebugHud();
        hud.allumer();
        vi.advanceTimersByTime(200);
        expect(document.getElementById('sh-debug-hud').textContent).toContain('directionnel');
        document.documentElement.classList.remove('sh-entree-directionnelle');
        hud.eteindre();
    });

    it('n\'interprète jamais son contenu comme du HTML', () => {
        vi.useFakeTimers();
        // Les titres de médias viennent du serveur : ils passent par ce HUD.
        document.body.innerHTML = '<div class="sh-card" tabindex="0">&lt;img src=x onerror=alert(1)&gt;</div>';
        const hud = new DebugHud();
        hud.allumer();
        vi.advanceTimersByTime(200);
        const el = document.getElementById('sh-debug-hud');
        expect(el.querySelector('img'), 'le HUD a interprété du HTML').toBeNull();
        expect(el.innerHTML).not.toContain('<img');
        hud.eteindre();
    });

    it('supporte un diagnostic vide sans afficher « undefined »', () => {
        vi.useFakeTimers();
        const hud = new DebugHud();
        hud.allumer();
        nav._poser(null);
        vi.advanceTimersByTime(200);
        expect(document.getElementById('sh-debug-hud').textContent).not.toContain('undefined');
        hud.eteindre();
    });
});
