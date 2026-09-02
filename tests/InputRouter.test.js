/**
 * @vitest-environment jsdom
 *
 * InputRouter — l'ordre de distribution du clavier.
 *
 * Tout l'intérêt du module est que cet ordre soit une donnée vérifiable et non
 * un effet de bord du démarrage. Ces tests sont donc la raison d'être du
 * module autant que sa vérification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputRouter, PRIORITES } from '../core/InputRouter.js';

let routeur;

beforeEach(() => { routeur = new InputRouter(); });
afterEach(() => { routeur.destroy(); });

/** Envoie une vraie touche dans le DOM, pour tester le branchement réel. */
function frapper(key, type = 'keydown') {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

describe('Ordre de distribution', () => {
    it('distribue par priorité décroissante, quel que soit l\'ordre d\'inscription', () => {
        // C'est précisément le point : avant, l'ordre d'inscription faisait loi.
        const vus = [];
        routeur.inscrire('navigation', () => { vus.push('navigation'); }, { priorite: PRIORITES.navigation });
        routeur.inscrire('search', () => { vus.push('search'); }, { priorite: PRIORITES.search });
        routeur.inscrire('router', () => { vus.push('router'); }, { priorite: PRIORITES.router });

        frapper('a');
        expect(vus).toEqual(['search', 'router', 'navigation']);
    });

    it('départage deux priorités égales par l\'ordre d\'inscription', () => {
        const vus = [];
        routeur.inscrire('premier', () => { vus.push('premier'); }, { priorite: 50 });
        routeur.inscrire('second', () => { vus.push('second'); }, { priorite: 50 });
        frapper('a');
        expect(vus).toEqual(['premier', 'second']);
    });

    it('expose l\'ordre pour diagnostic', () => {
        routeur.inscrire('navigation', () => {}, { priorite: PRIORITES.navigation });
        routeur.inscrire('player', () => {}, { priorite: PRIORITES.player });
        expect(routeur.ordreDeDistribution()).toEqual(['player', 'navigation']);
    });
});

describe('Consommation', () => {
    it('un gestionnaire qui renvoie true arrête la distribution', () => {
        const bas = vi.fn();
        routeur.inscrire('haut', () => true, { priorite: 100 });
        routeur.inscrire('bas', bas, { priorite: 10 });
        frapper('Escape');
        expect(bas).not.toHaveBeenCalled();
    });

    it('renvoyer undefined laisse passer', () => {
        const bas = vi.fn();
        routeur.inscrire('haut', () => { /* ne renvoie rien */ }, { priorite: 100 });
        routeur.inscrire('bas', bas, { priorite: 10 });
        frapper('Escape');
        expect(bas).toHaveBeenCalled();
    });

    it('renvoyer une valeur vraie mais non true laisse passer', () => {
        // Volontairement strict : `return this._close()` renvoyant un objet ne
        // doit pas couper le clavier par accident.
        const bas = vi.fn();
        routeur.inscrire('haut', () => ({ ferme: true }), { priorite: 100 });
        routeur.inscrire('bas', bas, { priorite: 10 });
        frapper('Escape');
        expect(bas).toHaveBeenCalled();
    });
});

describe('Isolation des pannes', () => {
    it('une exception dans un gestionnaire ne prive pas les suivants de clavier', () => {
        // Avec treize écouteurs séparés, une exception restait locale. Avec un
        // écouteur unique, sans cette garde, elle couperait toute la navigation.
        const bas = vi.fn();
        routeur.inscrire('cassé', () => { throw new Error('boum'); }, { priorite: 100 });
        routeur.inscrire('bas', bas, { priorite: 10 });
        expect(() => frapper('ArrowDown')).not.toThrow();
        expect(bas).toHaveBeenCalled();
    });
});

describe('Inscription et désinscription', () => {
    it('la fonction renvoyée désinscrit', () => {
        const g = vi.fn();
        const retirer = routeur.inscrire('x', g, { priorite: 10 });
        frapper('a');
        expect(g).toHaveBeenCalledTimes(1);
        retirer();
        frapper('a');
        expect(g).toHaveBeenCalledTimes(1);
    });

    it('réinscrire sous le même nom remplace au lieu d\'empiler', () => {
        // Un composant rouvert dix fois traiterait sinon chaque touche dix fois.
        const g = vi.fn();
        routeur.inscrire('modal', g, { priorite: 90 });
        routeur.inscrire('modal', g, { priorite: 90 });
        routeur.inscrire('modal', g, { priorite: 90 });
        frapper('Tab');
        expect(g).toHaveBeenCalledTimes(1);
    });

    it('désinscrire un nom inconnu ne lève pas', () => {
        expect(() => routeur.desinscrire('inexistant')).not.toThrow();
    });

    it('refuse un gestionnaire qui n\'est pas une fonction', () => {
        expect(() => routeur.inscrire('mauvais', 'coucou')).not.toThrow();
        expect(routeur.ordreDeDistribution()).toEqual([]);
    });
});

describe('Séparation keydown / keyup', () => {
    it('un gestionnaire keyup n\'est pas appelé sur keydown', () => {
        const bas = vi.fn();
        const haut = vi.fn();
        routeur.inscrire('bas', bas, { sur: 'keydown' });
        routeur.inscrire('haut', haut, { sur: 'keyup' });

        frapper('ArrowUp', 'keydown');
        expect(bas).toHaveBeenCalledTimes(1);
        expect(haut).not.toHaveBeenCalled();

        frapper('ArrowUp', 'keyup');
        expect(haut).toHaveBeenCalledTimes(1);
        expect(bas).toHaveBeenCalledTimes(1);
    });
});

describe('destroy()', () => {
    it('détache l\'écouteur et vide la liste', () => {
        const g = vi.fn();
        routeur.inscrire('x', g);
        routeur.destroy();
        frapper('a');
        expect(g).not.toHaveBeenCalled();
        expect(routeur.ordreDeDistribution()).toEqual([]);
    });
});

describe('Table des priorités', () => {
    it('la navigation spatiale est strictement la dernière', () => {
        // Elle est le repli : toute autre couche doit pouvoir la devancer.
        const valeurs = Object.values(PRIORITES);
        expect(PRIORITES.navigation).toBe(Math.min(...valeurs));
    });

    it('la recherche est strictement la première', () => {
        // Ctrl+K doit fonctionner par-dessus n'importe quelle couche ouverte.
        const valeurs = Object.values(PRIORITES);
        expect(PRIORITES.search).toBe(Math.max(...valeurs));
    });

    it('aucune priorité n\'est en double', () => {
        const valeurs = Object.values(PRIORITES);
        expect(new Set(valeurs).size).toBe(valeurs.length);
    });
});
