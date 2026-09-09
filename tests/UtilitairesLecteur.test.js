/**
 * UtilitairesLecteur — la logique extraite par la peau 2, testée isolément.
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * La peau 2 a déplacé quatre helpers purs hors de VideoPlayer. Les talons
 * du lecteur garantissent que ses appelants ne voient aucun changement ;
 * ceux-ci garantissent que la LOGIQUE extraite reste exacte — c'est la
 * même séparation que SegmentsMedia.test.js (logique) vs FacadeLecteur
 * (frontière).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
    formaterTemps,
    echapperHtml,
    echapperUrl,
    ressortirBouton,
} from '../jellyfin/player/UtilitairesLecteur.js';

describe('formaterTemps', () => {
    it('forme HH:MM:SS zéro-paddé', () => {
        expect(formaterTemps(0)).toBe('00:00:00');
        expect(formaterTemps(59)).toBe('00:00:59');
        expect(formaterTemps(3661)).toBe('01:01:01');
        expect(formaterTemps(36000)).toBe('10:00:00');
    });

    it('tronque les fractions de seconde sans les arrondir', () => {
        expect(formaterTemps(59.9)).toBe('00:00:59');
    });

    it('rend 00:00:00 pour NaN et les négatifs, jamais NaN:NaN', () => {
        expect(formaterTemps(NaN)).toBe('00:00:00');
        expect(formaterTemps(-5)).toBe('00:00:00');
    });
});

describe('echapperHtml', () => {
    it('échappe esperluettes, chevrons et guillemets droits', () => {
        expect(echapperHtml('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
    });

    it('rend une chaîne vide pour vide/null/undefined', () => {
        expect(echapperHtml('')).toBe('');
        expect(echapperHtml(null)).toBe('');
        expect(echapperHtml(undefined)).toBe('');
    });
});

describe('echapperUrl', () => {
    it('conserve une URL http(s) et échappe guillemets et antislashs', () => {
        const sortie = echapperUrl('https://serveur.test/a?b="1"');
        expect(sortie.startsWith('https://serveur.test/')).toBe(true);
        expect(sortie).not.toContain('"');
    });

    it('accepte une URL relative et la résout en http(s)', () => {
        const sortie = echapperUrl('/Images/x.jpg');
        expect(sortie.startsWith('http')).toBe(true);
    });

    it('refuse les protocoles non http(s) — javascript:, data:', () => {
        expect(echapperUrl('javascript:alert(1)')).toBe('');
        expect(echapperUrl('data:text/html,<b>x</b>')).toBe('');
        expect(echapperUrl('ftp://serveur/fichier')).toBe('');
    });

    it('rend vide pour vide ou URL vraiment impropre', () => {
        expect(echapperUrl('')).toBe('');
        expect(echapperUrl(null)).toBe('');
        // Une chaîne exotique mais analysable comme chemin relatif est
        // résolue (comportement historique, conservé) ; seul un échec du
        // parseur rend la chaîne vide.
        expect(echapperUrl('http://[')).toBe('');
    });
});

describe('ressortirBouton', () => {
    it('réarme la classe spring-bounce via un reflow forcé', () => {
        const btn = document.createElement('button');
        btn.classList.add('spring-bounce');
        ressortirBouton(btn);
        expect(btn.classList.contains('spring-bounce')).toBe(true);
    });

    it('ne lève pas sur un nœud absent', () => {
        expect(() => ressortirBouton(null)).not.toThrow();
    });
});
