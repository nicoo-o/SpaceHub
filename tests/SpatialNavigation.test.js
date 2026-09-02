/**
 * @vitest-environment jsdom
 *
 * SpatialNavigation — la pile de calques et le moteur de répétition.
 *
 * Ces deux mécanismes sont à l'origine des deux bogues les plus coûteux de la
 * session : « Retour » fermait la mauvaise couche quand deux se superposaient,
 * et la parité clavier/manette n'était pas établie. Aucun des deux n'était
 * visible à la lecture du code ; les deux se voient immédiatement en test.
 *
 * Le module est instancié pour de vrai (pas de doublure) : c'est justement son
 * interaction avec le DOM qui est en cause.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LAYERS, BACK_ORDER } from '../core/DomContracts.js';
import { NavAction } from '../core/InputMapper.js';

/**
 * L'API des manettes n'existe pas dans jsdom, et SpatialNavigation instancie
 * GamepadInput dans son constructeur. On fournit le strict minimum.
 */
navigator.getGamepads = () => [];

const { default: SpatialNavigation } = await import('../core/SpatialNavigation.js');

/** Ouvre une couche dans le DOM en respectant son sélecteur déclaré. */
function ouvrirCouche(nom) {
    const el = document.createElement('div');
    if (nom === 'settings') { el.id = 'sh-modal-spacehub-settings'; el.className = 'sh-modal--open'; }
    else if (nom === 'search') { el.className = 'sh-spotlight-overlay open'; }
    else if (nom === 'sidebar') { el.id = 'sh-sidebar-panel'; el.className = 'open'; }
    else if (nom === 'slideUpSheet') { el.className = 'sh-slideup-sheet--open'; }
    else throw new Error(`couche non gérée par ce test : ${nom}`);
    document.body.appendChild(el);
    return el;
}

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
});

afterEach(() => {
    nav._stopInputRepeat?.();
    vi.restoreAllMocks();
    delete window.SpaceHub;
});

describe('Pile de calques — l\'ordre d\'ouverture prime sur l\'ordre déclaré', () => {
    it('« Retour » ferme la couche ouverte en DERNIER, pas la première de BACK_ORDER', () => {
        // Le bogue historique : BACK_ORDER liste « settings » avant « search ».
        // Si l'utilisateur ouvre les réglages PUIS la recherche, Retour fermait
        // les réglages — la recherche restait, sans que rien ne semble bouger.
        ouvrirCouche('settings');
        ouvrirCouche('search');
        nav.pushLayer('settings');
        nav.pushLayer('search');

        const fermees = [];
        vi.spyOn(nav, '_closeLayer').mockImplementation((couche) => fermees.push(couche));

        nav._handleBack({ preventDefault() {} });
        expect(fermees).toEqual(['search']);

        nav._handleBack({ preventDefault() {} });
        expect(fermees).toEqual(['search', 'settings']);
    });

    it('respecte l\'ordre inverse quand la recherche est ouverte en premier', () => {
        ouvrirCouche('search');
        ouvrirCouche('settings');
        nav.pushLayer('search');
        nav.pushLayer('settings');

        const fermees = [];
        vi.spyOn(nav, '_closeLayer').mockImplementation((couche) => fermees.push(couche));

        nav._handleBack({});
        nav._handleBack({});
        expect(fermees).toEqual(['settings', 'search']);
    });

    it('une couche réempilée remonte au sommet sans être dupliquée', () => {
        nav.pushLayer('settings');
        nav.pushLayer('search');
        nav.pushLayer('settings');
        expect(nav._layerStack).toEqual(['search', 'settings']);
    });

    it('ignore une couche inconnue de LAYERS', () => {
        nav.pushLayer('inventee');
        expect(nav._layerStack).toEqual([]);
    });

    it('oublie une couche disparue du DOM sans jamais la « fermer »', () => {
        // Une couche fermée par son propre bouton « X » quitte le DOM sans
        // passer par Retour. Elle reste alors dans la pile jusqu'au prochain
        // Retour, qui la purge au passage : la purge est PARESSEUSE, faite en
        // remontant la pile, et non à chaque disparition. Ce qui compte est
        // qu'elle ne soit jamais fermée une seconde fois — fermer une couche
        // absente rappellerait l'API du composant pour rien.
        nav.pushLayer('settings');          // couche jamais présente dans le DOM
        ouvrirCouche('search');
        nav.pushLayer('search');

        const fermees = [];
        // La doublure retire aussi l'élément : une vraie fermeture le fait, et
        // sans cela le repli BACK_ORDER retrouverait la couche au tour suivant.
        vi.spyOn(nav, '_closeLayer').mockImplementation((couche, el) => {
            fermees.push(couche);
            el?.remove();
        });

        nav._handleBack({});
        // Le premier Retour s'arrête au sommet : « settings » n'a pas été vue.
        expect(fermees).toEqual(['search']);
        expect(nav._layerStack).toEqual(['settings']);

        nav._handleBack({});
        // Le second la trouve absente du DOM, la retire, et ne la ferme pas.
        expect(fermees).toEqual(['search']);
        expect(nav._layerStack).toEqual([]);
    });
});

describe('onLayerClosed', () => {
    it('accepte un nom de couche', () => {
        nav.pushLayer('search');
        nav.onLayerClosed('search');
        expect(nav._layerStack).toEqual([]);
    });

    it('accepte un élément du DOM et retrouve sa couche', () => {
        const el = ouvrirCouche('settings');
        nav.pushLayer('settings');
        nav.onLayerClosed(el);
        expect(nav._layerStack).toEqual([]);
    });

    it('ne fait rien pour une couche absente de la pile', () => {
        nav.pushLayer('search');
        nav.onLayerClosed('settings');
        expect(nav._layerStack).toEqual(['search']);
    });
});

describe('Repli sur BACK_ORDER', () => {
    it('ferme selon l\'ordre déclaré quand la pile est vide', () => {
        // Cas d'une couche ouverte par du code qui n'a pas prévenu la pile.
        ouvrirCouche('sidebar');
        const fermees = [];
        vi.spyOn(nav, '_closeLayer').mockImplementation((c) => fermees.push(c));
        nav._handleBack({});
        expect(fermees).toEqual(['sidebar']);
    });

    it('ne ferme rien quand aucune couche n\'est ouverte', () => {
        const ferme = vi.spyOn(nav, '_closeLayer').mockImplementation(() => {});
        nav._handleBack({});
        expect(ferme).not.toHaveBeenCalled();
    });

    it('BACK_ORDER ne référence que des couches déclarées dans LAYERS', () => {
        // Une entrée orpheline rendrait le repli silencieusement inopérant.
        for (const couche of BACK_ORDER) expect(LAYERS[couche]).toBeDefined();
    });
});

describe('Parité clavier / manette — le point §6 de l\'audit', () => {
    it('la manette entre dans le MÊME moteur de répétition que le clavier', () => {
        // C'est la vérification que l'audit demandait. Si un jour GamepadInput
        // se remet à cadencer lui-même, ce test tombe.
        const demarre = vi.spyOn(nav, '_startInputRepeat').mockImplementation(() => {});
        vi.spyOn(nav, '_detectCurrentScope').mockReturnValue('dashboard');

        nav._onGamepadDirectionStart(NavAction.RIGHT);
        expect(demarre).toHaveBeenCalledWith(NavAction.RIGHT);
    });

    it('le clavier entre dans le même moteur, une seule fois par pression', () => {
        const demarre = vi.spyOn(nav, '_startInputRepeat').mockImplementation(() => {});
        vi.spyOn(nav, '_detectCurrentScope').mockReturnValue('dashboard');

        nav._handleKeyDown({ key: 'ArrowRight', repeat: false, preventDefault() {}, target: document.body });
        expect(demarre).toHaveBeenCalledWith(NavAction.RIGHT);

        // La répétition native du navigateur ne doit PAS relancer le moteur :
        // deux cadences superposées feraient défiler deux fois trop vite.
        demarre.mockClear();
        nav._handleKeyDown({ key: 'ArrowRight', repeat: true, preventDefault() {}, target: document.body });
        expect(demarre).not.toHaveBeenCalled();
    });

    it('relâcher une direction arrête le moteur, au clavier comme à la manette', () => {
        const arrete = vi.spyOn(nav, '_stopInputRepeat');
        nav._handleKeyUp({ key: 'ArrowRight' });
        expect(arrete).toHaveBeenCalled();

        arrete.mockClear();
        nav._onGamepadDirectionEnd();
        expect(arrete).toHaveBeenCalled();
    });

    it('une touche non directionnelle n\'arrête pas le moteur', () => {
        const arrete = vi.spyOn(nav, '_stopInputRepeat');
        nav._handleKeyUp({ key: 'Enter' });
        expect(arrete).not.toHaveBeenCalled();
    });
});

describe('Moteur de répétition — cadence', () => {
    it('démarre à 180 ms et sans défilement rapide', () => {
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});
        nav._startInputRepeat(NavAction.DOWN);
        expect(nav._repeatState.activeAction).toBe(NavAction.DOWN);
        expect(nav._repeatState.cadence).toBe(180);
        expect(nav._repeatState.isFastScrolling).toBe(false);
        nav._stopInputRepeat();
    });

    it('ignore une seconde demande pour la même direction', () => {
        // Sinon chaque événement de répétition remettrait la cadence à 180 ms
        // et l'accélération n'arriverait jamais.
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});
        nav._startInputRepeat(NavAction.DOWN);
        const debut = nav._repeatState.pressStartTime;
        nav._startInputRepeat(NavAction.DOWN);
        expect(nav._repeatState.pressStartTime).toBe(debut);
        nav._stopInputRepeat();
    });

    it('_stopInputRepeat remet l\'état à zéro', () => {
        vi.spyOn(nav, '_executeNavStep').mockImplementation(() => {});
        nav._startInputRepeat(NavAction.UP);
        nav._stopInputRepeat();
        expect(nav._repeatState.activeAction).toBeNull();
        expect(nav._repeatState.timerId).toBeNull();
    });
});
