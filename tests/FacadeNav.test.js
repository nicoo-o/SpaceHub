/**
 * SpatialNavigation — le contrat de façade, côté classe.
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * L'audit des monolithes (docs/AUDIT_MONOLITHES.md) a figé la surface
 * EXACTE que le monde extérieur touche sur le moteur : méthodes publiques
 * réellement appelées et internes réellement atteints par les harnais
 * (NavTestHarness, e2e). Ce test vérifie que chaque membre du contrat
 * existe encore sur une instance neuve — si une extraction future retire
 * ou renomme un membre, le filet le dit avant que le harnais ne casse.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MEMBRES_APPELABLES, CHAMPS_ATTEINTS } from '../core/ContratSpatialNavigation.js';
import { default as SpatialNavigation } from '../core/SpatialNavigation.js';

let nav;

beforeEach(() => {
    document.body.innerHTML = '';
    window.SpaceHub = {};
    nav = new SpatialNavigation();
});

afterEach(() => {
    nav._stopInputRepeat?.();
    delete window.SpaceHub;
});

describe('Le contrat de façade de SpatialNavigation', () => {
    it('expose toutes les méthodes publiques réellement appelées', () => {
        for (const membre of MEMBRES_APPELABLES) {
            expect(typeof nav[membre], `membre manquant : ${membre}`).toBe('function');
        }
    });

    it('garde les internes atteints par les harnais', () => {
        // Les harnais (NavTestHarness, e2e) pilotent le moteur par ces
        // membres : leur disparition casserait les filets, pas seulement
        // un appelant applicatif.
        for (const membre of CHAMPS_ATTEINTS) {
            expect(membre in nav, `membre manquant : ${membre}`).toBe(true);
        }
    });
});