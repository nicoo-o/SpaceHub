/**
 * @vitest-environment jsdom
 *
 * Le dock supérieur et le hero, atteints depuis la vue.
 *
 * Troisième leçon de la même famille que `NavigationDeplacementReel` et
 * `GabaritsContexte` : un test qui n'assemble pas le DOM RÉEL ne voit pas les
 * défauts d'assemblage.
 *
 * Le défaut ici était structurel, et invisible à tout test de sélecteur :
 *
 *   - le dock (`.sh-dynamic-island`) est un FRÈRE de la vue, pas un descendant :
 *     il vit dans `.sh-app-shell`, à côté de `.sh-dashboard` ;
 *   - or sept composants réenregistraient « leur » scope avec `{ force: true }`
 *     en enracinant la requête sur LEUR sous-arbre — `.sh-dashboard`,
 *     `.sh-library-view`, `.sh-downloads-view`…
 *
 * Le sélecteur `.sh-dynamic-island .sh-nav-tab-btn` figurait bien dans la liste
 * du tableau de bord. Il ne pouvait simplement jamais correspondre : la racine
 * de la requête excluait le dock. Les boutons étaient déclarés atteignables et
 * ne l'étaient pas — le clavier ne montait jamais dans le menu.
 *
 * S'ajoutait un second verrou : replié, le dock met sa vue déployée en
 * `visibility: hidden`, donc ses onglets sont filtrés comme invisibles. Il
 * fallait donc qu'il soit déjà déployé pour être atteignable, et déjà atteint
 * pour être déployé. La pastille compacte — elle, toujours visible — est
 * devenue le point d'entrée : la focaliser déploie le dock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavAction } from '../core/InputMapper.js';
import { CHROME_PERSISTANT } from '../core/DomContracts.js';

navigator.getGamepads = () => [];
// jsdom n'implémente aucun défilement : le moteur en déclenche à chaque focus.
window.scrollTo = () => {};
Element.prototype.scrollTo = function () {};
Element.prototype.scrollBy = function () {};
Element.prototype.scrollIntoView = function () {};
const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

/**
 * Le squelette réel de l'application, réduit à ce qui compte pour la
 * navigation : un dock FRÈRE de la vue, un hero, une barre de genres, des
 * cartes. Les géométries sont celles d'un écran 1920×1080.
 *
 * jsdom ne charge pas les feuilles de style : la règle qui masque la vue
 * déployée du dock en mode compact est reproduite en style en ligne. C'est la
 * seule tricherie, et elle est fidèle — `visibility: hidden` hérité, exactement
 * ce que produit `.sh-island--compact .sh-island-full-view`.
 */
function monterApplication() {
    document.body.innerHTML = `
        <div class="sh-app-shell">
            <div class="sh-island-nav-wrapper">
                <nav class="sh-dynamic-island sh-island--compact" id="sh-dynamic-island">
                    <div class="sh-island-compact-view" role="button" tabindex="0"
                         data-nav-focusable="true" aria-label="Ouvrir le menu"></div>
                    <div class="sh-island-full-view" style="visibility:hidden">
                        <div class="sh-nav-tabs">
                            <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island"
                                    class="sh-nav-tab-btn" id="tab-accueil" data-view="dashboard"></button>
                            <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island"
                                    class="sh-nav-tab-btn" id="tab-biblio" data-view="library"></button>
                        </div>
                    </div>
                </nav>
            </div>
            <div class="sh-dashboard">
                <div id="sh-dashboard-hero">
                    <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-play" id="sh-hero-btn-play"></button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-glass" id="sh-hero-btn-trailer"></button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-glass" id="sh-hero-btn-details"></button>
                </div>
                <div class="sh-dashboard-body">
                    <div class="sh-genre-chips-container">
                        <div class="sh-genre-bar-track">
                            <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" id="chip-tous"></button>
                        </div>
                    </div>
                    <div class="sh-dashboard__grid">
                        <div class="sh-card" tabindex="0" id="carte-1"></div>
                        <div class="sh-card" tabindex="0" id="carte-2"></div>
                    </div>
                </div>
            </div>
        </div>`;

    // Géométrie : dock en haut, hero au milieu, contenu dessous.
    const poser = (id, x, y, l, h) => {
        const el = document.getElementById(id);
        el.getBoundingClientRect = () => ({
            left: x, top: y, right: x + l, bottom: y + h, width: l, height: h, x, y,
        });
        return el;
    };
    poser('sh-dynamic-island', 858, 12, 204, 38);
    document.querySelector('.sh-island-compact-view').getBoundingClientRect =
        () => ({ left: 870, top: 18, right: 1050, bottom: 44, width: 180, height: 26, x: 870, y: 18 });
    poser('tab-accueil', 800, 18, 90, 26);
    poser('tab-biblio', 900, 18, 110, 26);
    poser('sh-hero-btn-play', 120, 600, 150, 48);
    poser('sh-hero-btn-trailer', 290, 600, 190, 48);
    poser('sh-hero-btn-details', 500, 600, 160, 48);
    poser('chip-tous', 120, 820, 160, 36);
    poser('carte-1', 120, 900, 200, 300);
    poser('carte-2', 340, 900, 200, 300);
}

/** Déploie le dock comme le fait AppLayout au focus. */
function deployerDock() {
    const island = document.getElementById('sh-dynamic-island');
    island.classList.remove('sh-island--compact');
    island.classList.add('sh-island--expanded');
    document.querySelector('.sh-island-full-view').style.visibility = 'visible';
    document.querySelector('.sh-island-compact-view').style.visibility = 'hidden';
}

let nav;

beforeEach(() => {
    window.SpaceHub = {};
    monterApplication();
    nav = new SpatialNavigation();
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
    document.body.innerHTML = '';
});

describe('Le dock supérieur fait partie du plan de navigation de la vue', () => {
    it('la pastille compacte est un candidat du scope de la vue', () => {
        const candidats = nav.getFocusables('dashboard');
        const pastille = document.querySelector('.sh-island-compact-view');
        expect(candidats).toContain(pastille);
    });

    it('les onglets du dock déployé sont des candidats du scope de la vue', () => {
        deployerDock();
        const candidats = nav.getFocusables('dashboard');
        expect(candidats).toContain(document.getElementById('tab-accueil'));
        expect(candidats).toContain(document.getElementById('tab-biblio'));
    });

    it('replié, ses onglets sont invisibles et donc écartés — la pastille prend le relais', () => {
        const candidats = nav.getFocusables('dashboard');
        expect(candidats).not.toContain(document.getElementById('tab-accueil'));
        expect(candidats).toContain(document.querySelector('.sh-island-compact-view'));
    });

    it('monter depuis le hero atteint le dock', () => {
        nav.setFocus(document.getElementById('sh-hero-btn-play'), { silent: true, scroll: false });
        nav._executeNavStep(NavAction.UP, false);
        const atteint = nav._state.focusedElement;
        expect(atteint?.closest('.sh-dynamic-island'), 'le focus doit être dans le dock').toBeTruthy();
    });

    it('redescendre depuis le dock déployé revient dans la vue', () => {
        deployerDock();
        nav.setFocus(document.getElementById('tab-accueil'), { silent: true, scroll: false });
        nav._executeNavStep(NavAction.DOWN, false);
        const atteint = nav._state.focusedElement;
        expect(atteint?.closest('.sh-dynamic-island'), 'le dock ne doit pas piéger le focus').toBeFalsy();
        expect(atteint?.closest('.sh-dashboard')).toBeTruthy();
    });

    it('le dock est atteignable depuis TOUTES les vues, pas seulement le tableau de bord', () => {
        // Le dock est une barre permanente : un scope de vue qui ne le voit pas
        // rend le menu inatteignable dans cette vue-là.
        for (const scope of ['dashboard', 'library', 'downloads', 'jellyseerr']) {
            const candidats = nav.getFocusables(scope);
            const duChrome = candidats.filter(el => el.matches(CHROME_PERSISTANT));
            expect(duChrome.length, `scope « ${scope} »`).toBeGreaterThan(0);
        }
    });
});

describe('Le hero est traversable', () => {
    it('ses trois boutons sont des candidats', () => {
        const candidats = nav.getFocusables('dashboard');
        for (const id of ['sh-hero-btn-play', 'sh-hero-btn-trailer', 'sh-hero-btn-details']) {
            expect(candidats, id).toContain(document.getElementById(id));
        }
    });

    it('on circule de gauche à droite entre les trois', () => {
        nav.setFocus(document.getElementById('sh-hero-btn-play'), { silent: true, scroll: false });
        nav._executeNavStep(NavAction.RIGHT, false);
        expect(nav._state.focusedElement?.id).toBe('sh-hero-btn-trailer');
        nav._executeNavStep(NavAction.RIGHT, false);
        expect(nav._state.focusedElement?.id).toBe('sh-hero-btn-details');
    });

    it('descendre du hero mène au contenu, pas au néant', () => {
        nav.setFocus(document.getElementById('sh-hero-btn-play'), { silent: true, scroll: false });
        nav._executeNavStep(NavAction.DOWN, false);
        expect(nav._state.focusedElement?.closest('.sh-dashboard-body')).toBeTruthy();
    });
});

describe('Le focus de départ ne se pose jamais sur le dock', () => {
    it('focusFirst choisit le contenu de la vue, pas la barre permanente', () => {
        // Le dock PRÉCÈDE la vue dans l'ordre du DOM : sans règle explicite,
        // `focusFirst` le choisirait — et l'application s'ouvrirait avec le
        // menu déployé, exactement le défaut de l'anneau blanc au démarrage.
        nav.focusFirst('dashboard');
        const premier = nav._state.focusedElement;
        expect(premier?.closest('.sh-dynamic-island')).toBeFalsy();
        expect(premier?.closest('.sh-dashboard')).toBeTruthy();
    });
});
