/**
 * Compte à rebours « épisode suivant » — la peau 3 de la décomposition du lecteur.
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * La mécanique du minuteur (départ à 5, décrément par seconde, passage
 * automatique à zéro, annulation, redémarrage sans minuteur fantôme) était
 * noyée dans VideoPlayer.js, entre le DOM et la lecture — impossible à
 * exercer sans monter tout le lecteur. Extraite dans
 * CompteAReboursEpisode.js avec des injections étroites (surTick, surZero,
 * setIntervalFn/clearIntervalFn), elle se teste ici sur une horloge FAUSSE :
 * les ticks sont déclenchés à la main, aucune seconde réelle n'est attendue.
 *
 * Le contrat de façade (tests/FacadeLecteur.test.js) garantit que les quatre
 * talons de la classe (`_showNextEpCard`, `_startNextEpCountdown`,
 * `_cancelNextEpCountdown`, `_hideNextEpCard`) existent toujours.
 */

import { describe, it, expect } from 'vitest';
import { formaterTitreEpisode, creerCompteARebours } from '../jellyfin/player/CompteAReboursEpisode.js';

/**
 * Horloge fausse : les intervalles ne tournent que lorsqu'on les fait ticquer.
 * Le test pilote le temps ; le module ne le voit jamais.
 */
function creerHorloge() {
    const intervalles = new Map();
    let prochainId = 1;
    return {
        setIntervalFn(fn, ms) {
            const id = prochainId++;
            intervalles.set(id, { fn, ms });
            return id;
        },
        clearIntervalFn(id) {
            intervalles.delete(id);
        },
        actifs() {
            return intervalles.size;
        },
        dureeDuSeulIntervalle() {
            const durees = [...intervalles.values()].map((i) => i.ms);
            return durees.length === 1 ? durees[0] : null;
        },
        tic() {
            for (const { fn } of [...intervalles.values()]) fn();
        },
    };
}

function creerCompteur(options = {}) {
    const horloge = creerHorloge();
    const evenements = [];
    const compteur = creerCompteARebours({
        surTick: (restant) => evenements.push(`t${restant}`),
        surZero: () => evenements.push('zero'),
        setIntervalFn: horloge.setIntervalFn,
        clearIntervalFn: horloge.clearIntervalFn,
        ...options,
    });
    return { horloge, evenements, compteur };
}

describe('formaterTitreEpisode — le titre de la carte', () => {
    it('formate saison et numéro sur deux chiffres', () => {
        expect(formaterTitreEpisode({ ParentIndexNumber: 2, IndexNumber: 7, Name: 'Le réveil' }))
            .toBe('S02E07 · « Le réveil »');
    });

    it('retombe sur 01 quand saison ou numéro manquent', () => {
        expect(formaterTitreEpisode({ Name: 'Seul' }))
            .toBe('S01E01 · « Seul »');
    });

    it('retombe sur « Épisode suivant » quand le nom manque', () => {
        expect(formaterTitreEpisode({ ParentIndexNumber: 3, IndexNumber: 12 }))
            .toBe('S03E12 · « Épisode suivant »');
    });
});

describe('creerCompteARebours — la mécanique du minuteur', () => {
    it('affiche 5 dès le démarrage, puis décrémente à chaque tic', () => {
        const { horloge, evenements, compteur } = creerCompteur();
        compteur.demarrer();
        expect(evenements).toEqual(['t5']);
        expect(compteur.restant).toBe(5);

        horloge.tic();
        expect(evenements).toEqual(['t5', 't4']);
        horloge.tic();
        horloge.tic();
        expect(evenements).toEqual(['t5', 't4', 't3', 't2']);
    });

    it('passe à zéro UNE fois, puis s arrête sans intervalle vivant', () => {
        const { horloge, evenements, compteur } = creerCompteur();
        compteur.demarrer();
        for (let i = 0; i < 5; i++) horloge.tic();

        expect(evenements).toEqual(['t5', 't4', 't3', 't2', 't1', 't0', 'zero']);
        expect(compteur.actif).toBe(false);
        expect(compteur.restant).toBe(0);
        expect(horloge.actifs()).toBe(0);

        // Un tic après la fin ne produit plus rien.
        horloge.tic();
        expect(evenements).toEqual(['t5', 't4', 't3', 't2', 't1', 't0', 'zero']);
    });

    it('arreter stoppe le minuteur sans déclencher le passage', () => {
        const { horloge, evenements, compteur } = creerCompteur();
        compteur.demarrer();
        horloge.tic();
        compteur.arreter();

        expect(compteur.actif).toBe(false);
        expect(horloge.actifs()).toBe(0);
        horloge.tic();
        expect(evenements).toEqual(['t5', 't4']);
    });

    it('demarrer repart de zéro et tue l ancien intervalle', () => {
        const { horloge, evenements, compteur } = creerCompteur();
        compteur.demarrer();
        horloge.tic();
        compteur.demarrer();

        expect(horloge.actifs()).toBe(1);
        expect(evenements).toEqual(['t5', 't4', 't5']);
        horloge.tic();
        expect(evenements).toEqual(['t5', 't4', 't5', 't4']);
    });

    it('respecte la durée de pas fournie (1000 ms par défaut)', () => {
        const { horloge, compteur } = creerCompteur();
        compteur.demarrer();
        expect(horloge.dureeDuSeulIntervalle()).toBe(1000);

        const autre = creerCompteur({ dureeMs: 250 });
        autre.compteur.demarrer();
        expect(autre.horloge.dureeDuSeulIntervalle()).toBe(250);
    });

    it('surZero n est pas appelé si l on n atteint jamais zéro', () => {
        const { horloge, evenements, compteur } = creerCompteur();
        compteur.demarrer();
        compteur.arreter();
        for (let i = 0; i < 10; i++) horloge.tic();
        expect(evenements).toEqual(['t5']);
    });
});