/**
 * HistoriqueVues — ce que le bouton retour système peut défaire.
 *
 * Le pont Android appelait jusqu'ici deux choses : le pipeline de couches
 * (SpatialNavigation) puis la sortie. Sur un téléphone, « Retour » depuis
 * l'onglet Flux ramenait donc à l'écran de confirmation de sortie alors que
 * l'utilisateur voulait revenir à sa bibliothèque — le geste le plus utilisé
 * d'Android, et le seul qui n'avait aucune mémoire.
 *
 * Ce module est la mémoire. Il est PUR (aucun DOM, aucun service) parce que
 * c'est la seule façon de le tester sans monter l'application entière.
 */

import { describe, it, expect } from 'vitest';
import { creerHistoriqueVues } from '../core/HistoriqueVues.js';

describe('HistoriqueVues', () => {
    it('sans navigation, precedente() ne renvoie rien (il n\'y a rien à défaire)', () => {
        const h = creerHistoriqueVues();
        expect(h.precedente()).toBe(null);
    });

    it('après un aller simple, precedente() rend la vue de départ', () => {
        const h = creerHistoriqueVues();
        h.enregistrer('dashboard');
        h.enregistrer('library');
        expect(h.precedente()).toBe('dashboard');
    });

    it('deux retours d\'affilée épuisent la piste puis cessent de répondre', () => {
        const h = creerHistoriqueVues();
        h.enregistrer('dashboard');
        h.enregistrer('library');
        h.enregistrer('flux');
        expect(h.precedente()).toBe('library');
        expect(h.precedente()).toBe('dashboard');
        expect(h.precedente()).toBe(null);
    });

    it('la navigation déclenchée par le retour n\'est PAS réenregistrée', () => {
        // Sans cette règle, un aller-retour entre deux onglets se réenregistre
        // à chaque retour : appuyer sur Retour oscille indéfiniment entre les
        // deux onglets et ne propose plus jamais de sortir.
        const h = creerHistoriqueVues();
        h.enregistrer('dashboard');
        h.enregistrer('library');

        expect(h.precedente()).toBe('dashboard');
        h.enregistrer('dashboard');     // la navigation de retour

        expect(h.precedente()).toBe(null);
    });

    it('un nouvel onglet après un retour tronque la branche abandonnée', () => {
        const h = creerHistoriqueVues();
        h.enregistrer('dashboard');
        h.enregistrer('library');
        h.enregistrer('flux');

        expect(h.precedente()).toBe('library');  // la position recule
        h.enregistrer('library');       // … et la navigation de retour s'achève
        h.enregistrer('flux');          // PENDANT ce temps il retape Flux à la main
        h.enregistrer('dashboard');

        expect(h.precedente()).toBe('flux');
        expect(h.precedente()).toBe('library');
        expect(h.precedente()).toBe('dashboard');
        expect(h.precedente()).toBe(null);
    });

    it('réenregistrer la vue courante ne crée pas de doublon', () => {
        const h = creerHistoriqueVues();
        h.enregistrer('dashboard');
        h.enregistrer('dashboard');
        expect(h.precedente()).toBe(null);
    });

    it('la piste est bornée : une session de plusieurs heures ne grossit pas sans fin', () => {
        const h = creerHistoriqueVues({ limite: 3 });
        for (const v of ['a', 'b', 'c', 'd', 'e']) h.enregistrer(v);
        expect(h.profondeur()).toBe(3);
        expect(h.precedente()).toBe('d');
        expect(h.precedente()).toBe('c');
        expect(h.precedente()).toBe(null);
    });
});
