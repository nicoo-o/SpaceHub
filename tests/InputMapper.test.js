/**
 * InputMapper — la table de correspondance des touches.
 *
 * C'est le module le plus simple de l'application et le plus exposé : toutes
 * les télécommandes de téléviseur passent par lui, et chacune envoie ses
 * propres noms de touches. Une entrée manquante ne provoque pas d'erreur —
 * elle rend une touche silencieuse sur un appareil que l'on ne possède pas.
 * D'où ces tests : ils figent la table, appareil par appareil.
 */

import { describe, it, expect } from 'vitest';
import { NavAction, mapKeyboardEvent, isDirectionAction } from '../core/InputMapper.js';

/** Fabrique un faux KeyboardEvent — seul `key` est lu par le mappeur. */
const touche = (key) => ({ key });

describe('mapKeyboardEvent — clavier de bureau', () => {
    it('associe les quatre flèches aux quatre directions', () => {
        expect(mapKeyboardEvent(touche('ArrowUp'))).toBe(NavAction.UP);
        expect(mapKeyboardEvent(touche('ArrowDown'))).toBe(NavAction.DOWN);
        expect(mapKeyboardEvent(touche('ArrowLeft'))).toBe(NavAction.LEFT);
        expect(mapKeyboardEvent(touche('ArrowRight'))).toBe(NavAction.RIGHT);
    });

    it('Entrée valide, Échap revient en arrière', () => {
        expect(mapKeyboardEvent(touche('Enter'))).toBe(NavAction.SELECT);
        expect(mapKeyboardEvent(touche('Escape'))).toBe(NavAction.BACK);
    });

    it('Retour arrière est un « retour », pas une saisie', () => {
        // Sur téléviseur il n'y a pas de champ texte au premier plan : la
        // touche Retour arrière des télécommandes sert de bouton « retour ».
        expect(mapKeyboardEvent(touche('Backspace'))).toBe(NavAction.BACK);
    });
});

describe('mapKeyboardEvent — télécommandes de téléviseur', () => {
    // Les noms courts (Up, Down, Left, Right) sont ceux des anciens
    // téléviseurs, antérieurs à la normalisation de KeyboardEvent.key.
    it('accepte les noms courts des anciens téléviseurs', () => {
        expect(mapKeyboardEvent(touche('Up'))).toBe(NavAction.UP);
        expect(mapKeyboardEvent(touche('Down'))).toBe(NavAction.DOWN);
        expect(mapKeyboardEvent(touche('Left'))).toBe(NavAction.LEFT);
        expect(mapKeyboardEvent(touche('Right'))).toBe(NavAction.RIGHT);
    });

    it('« Accept » vaut Entrée (télécommandes Samsung/LG)', () => {
        expect(mapKeyboardEvent(touche('Accept'))).toBe(NavAction.SELECT);
    });

    it('« BrowserBack » vaut Échap', () => {
        expect(mapKeyboardEvent(touche('BrowserBack'))).toBe(NavAction.BACK);
    });

    it('les quatre noms de touche menu mènent au même menu', () => {
        for (const nom of ['ContextMenu', 'Menu', 'F10', 'Apps', 'Guide']) {
            expect(mapKeyboardEvent(touche(nom))).toBe(NavAction.MENU);
        }
    });

    it('lecture/pause : trois noms, une action', () => {
        for (const nom of ['MediaPlayPause', 'Play', 'Pause']) {
            expect(mapKeyboardEvent(touche(nom))).toBe(NavAction.PLAY_PAUSE);
        }
    });

    it('les touches de chaîne servent de page précédente/suivante', () => {
        expect(mapKeyboardEvent(touche('ChannelUp'))).toBe(NavAction.PAGE_UP);
        expect(mapKeyboardEvent(touche('ChannelDown'))).toBe(NavAction.PAGE_DOWN);
        expect(mapKeyboardEvent(touche('PageUp'))).toBe(NavAction.PAGE_UP);
        expect(mapKeyboardEvent(touche('PageDown'))).toBe(NavAction.PAGE_DOWN);
    });
});

describe('mapKeyboardEvent — entrées non reconnues', () => {
    it('rend null plutôt que de lever une erreur', () => {
        // Important : le gestionnaire appelle ceci sur CHAQUE frappe, y
        // compris pendant une saisie de texte. Lever ici bloquerait la saisie.
        expect(mapKeyboardEvent(touche('a'))).toBeNull();
        expect(mapKeyboardEvent(touche('F5'))).toBeNull();
        expect(mapKeyboardEvent(touche(' '))).toBeNull();
    });

    it('supporte un événement absent ou vide', () => {
        expect(mapKeyboardEvent(null)).toBeNull();
        expect(mapKeyboardEvent(undefined)).toBeNull();
        expect(mapKeyboardEvent({})).toBeNull();
        expect(mapKeyboardEvent(touche(''))).toBeNull();
    });

    it('distingue les majuscules — « escape » n\'est pas « Escape »', () => {
        // KeyboardEvent.key est normalisé par le navigateur ; accepter les
        // deux casses masquerait un vrai bogue de mappage ailleurs.
        expect(mapKeyboardEvent(touche('escape'))).toBeNull();
    });
});

describe('isDirectionAction', () => {
    it('vrai pour les quatre directions, faux pour tout le reste', () => {
        expect(isDirectionAction(NavAction.UP)).toBe(true);
        expect(isDirectionAction(NavAction.DOWN)).toBe(true);
        expect(isDirectionAction(NavAction.LEFT)).toBe(true);
        expect(isDirectionAction(NavAction.RIGHT)).toBe(true);

        for (const a of [NavAction.SELECT, NavAction.BACK, NavAction.MENU,
            NavAction.PLAY_PAUSE, NavAction.PAGE_UP, NavAction.PAGE_DOWN]) {
            expect(isDirectionAction(a)).toBe(false);
        }
    });

    it('faux pour null et pour une chaîne inconnue', () => {
        // C'est la garde qui évite de lancer le moteur de répétition sur une
        // action non directionnelle (cf. SpatialNavigation._startInputRepeat).
        expect(isDirectionAction(null)).toBe(false);
        expect(isDirectionAction('haut')).toBe(false);
    });
});

describe('NavAction — le contrat', () => {
    it('les dix actions sont des chaînes distinctes', () => {
        const valeurs = Object.values(NavAction);
        expect(valeurs).toHaveLength(10);
        expect(new Set(valeurs).size).toBe(10);
        for (const v of valeurs) expect(typeof v).toBe('string');
    });
});
