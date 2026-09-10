/**
 * SpaceHub — chaque règle de scripts/css-hygiene-check.mjs épinglée par une fixture
 * =================================================================================
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * Les règles du contrôle d'hygiène CSS protègent contre des défauts que rien
 * d'autre ne voit : un `!important` au milieu d'une déclaration ne fait
 * échouer aucun test de logique — il fait DISPARAÎTRE l'animation entière
 * (l'incident « vite 8 », les 47 transitions mortes). Une règle de syntaxe
 * que personne ne peut exercer sur une fixture finit par n'être qu'une sonde
 * manuelle, donc une règle qui dérive. Chaque règle du script est ici
 * confrontée à une fixture fautive (elle doit produire le diagnostic attendu)
 * et au cas sain (elle doit se taire).
 *
 * Les fixtures vivent sous tests/fixtures/css-hygiene/, hors des racines
 * balayées par le contrôle (core, ui, jellyfin, integrations, plugins) :
 * elles ne peuvent donc ni fausser le contrôle lui-même, ni être faussées
 * par lui.
 */

import { describe, it, expect } from 'vitest';
import { analyserCss, declarationsCss, MAX_BACKDROP } from '../scripts/css-hygiene-check.mjs';

const FIXTURES = 'tests/fixtures/css-hygiene';

/** Analyse une fixture isolée : seule sa racine est balayée. */
const analyser = (root) => analyserCss({ roots: [root], cwd: FIXTURES });

const contient = (problems, fragment) =>
    problems.some((p) => p.includes(fragment));

describe('Règle 1 — aucun bloc <style> embarqué dans le JS', () => {
    it('refuse une feuille créée par createElement dans une chaîne', () => {
        const { problems } = analyser('style-embarque');
        expect(problems).toHaveLength(1);
        expect(contient(problems, 'bloc <style> réintroduit dans le JS')).toBe(true);
    });
});

describe('Règle 2 — aucune feuille CSS orpheline', () => {
    it('refuse une feuille que rien n importe', () => {
        const { problems } = analyser('feuille-orpheline');
        expect(problems).toHaveLength(1);
        expect(contient(problems, 'jamais importé')).toBe(true);
    });
});

describe('Règle 3 — aucune ombre noire figée', () => {
    it('refuse box-shadow et text-shadow en rgba(0,0,0,…)', () => {
        const { problems } = analyser('ombre-figee');
        const ombres = problems.filter((p) => p.includes('ombre noire figée'));
        expect(ombres).toHaveLength(2);
        expect(ombres[0].includes('box-shadow')).toBe(true);
        expect(ombres[1].includes('text-shadow')).toBe(true);
    });
});

describe('Règle 4 — coût GPU plafonné', () => {
    it('refuse un plafond backdrop-filter dépassé', () => {
        const { problems } = analyser('gpu');
        expect(contient(problems, `backdrop-filter (plafond : ${MAX_BACKDROP})`)).toBe(true);
    });

    it('refuse « transition: all »', () => {
        const { problems } = analyser('gpu');
        expect(contient(problems, '« transition: all »')).toBe(true);
    });

    it('le plafond documenté reste 10', () => {
        expect(MAX_BACKDROP).toBe(10);
    });
});

describe('Règle 5 — images-clés orphelines et dupliquées', () => {
    it('refuse un @keyframes que plus rien n utilise', () => {
        const { problems } = analyser('keyframes');
        expect(contient(problems, "jeu(x) que plus rien n'utilise")).toBe(true);
        expect(contient(problems, '@keyframes sh-orphan-fade')).toBe(true);
    });

    it('refuse un nom @keyframes déclaré plusieurs fois', () => {
        const { problems } = analyser('keyframes');
        expect(contient(problems, 'nom(s) déclaré(s) plusieurs fois')).toBe(true);
        expect(contient(problems, '@keyframes sh-double-move')).toBe(true);
    });
});

describe('Règle 6 — boucles sur jetons de transition', () => {
    it('refuse une animation infinite mesurée en --sh-dur-*', () => {
        const { problems } = analyser('boucle');
        expect(contient(problems, 'animation « infinite » sur une durée de transition')).toBe(true);
        expect(contient(problems, 'Utilisez un jeton --sh-loop-*')).toBe(true);
    });
});

describe('Règle 7 — !important terminal dans TOUTE déclaration', () => {
    it('refuse une priorité au milieu d une déclaration non-transition', () => {
        const { problems } = analyser('important');
        const margin = problems.filter((p) => p.includes('dans « margin »'));
        expect(margin).toHaveLength(1);
        expect(margin[0].includes('Une priorité CSS ne peut apparaître qu\'à la fin')).toBe(true);
    });

    it('refuse toujours le cas transition (régression #17/#23), même à un seul !important au milieu', () => {
        const { problems } = analyser('important');
        const transitions = problems.filter((p) => p.includes('dans « transition »'));
        // .sh-b (deux !important, le premier au milieu) et .sh-c (un seul au milieu).
        expect(transitions).toHaveLength(2);
        for (const diagnostic of transitions) {
            expect(contient([diagnostic], 'Rolldown (vite 8) rejette la déclaration transition entière')).toBe(true);
        }
    });

    it('tolère les priorités terminales et celles entre guillemets', () => {
        const { problems } = analyser('important');
        // Seules les trois priorités fautives sont signalées — jamais
        // « transition: none !important » (terminale) ni « content: "!important" ».
        const signales = problems.filter((p) => p.includes('« !important » non terminal'));
        expect(signales).toHaveLength(3);
    });

    it('ne découpe pas une déclaration sur un « ; » entre guillemets (data: URL)', () => {
        const { problems } = analyser('important');
        expect(contient(problems, 'dans « background »')).toBe(false);
    });
});

describe('Le cas sain — aucune règle ne doit se déclencher', () => {
    it('accepte une feuille et son import sans aucun diagnostic', () => {
        const { problems } = analyser('sain');
        expect(problems).toEqual([]);
    });

    it('préserve les exceptions documentées (domUtils.js, ThemeManager.js)', () => {
        // La fixture reproduit le chemin EXACT de l'exception : le helper
        // générique dont le CSS est un paramètre reste licite malgré son
        // bloc <style>.
        const { problems } = analyserCss({ roots: ['core'], cwd: FIXTURES });
        expect(problems).toEqual([]);
    });
});

describe('Découpage des déclarations (API importable)', () => {
    it('neutralise les commentaires : une citation fautive n est pas un diagnostic', () => {
        const source = [
            '.a { color: red; }',
            '/* mauvais exemple : margin: 0 !important 10px; */',
            '.b { margin: 0 !important; }',
        ].join('\n');
        const segments = [...declarationsCss(source)]
            .map((d) => d.clean.trim())
            .filter(Boolean);
        expect(segments).toEqual(['color: red', 'margin: 0 !important']);
    });

    it('ne coupe pas une data: URL ni un contenu entre guillemets', () => {
        const source = '.c { background: url("data:image/svg+xml;utf8,<svg/>"); content: "a;b"; }';
        const segments = [...declarationsCss(source)]
            .map((d) => d.clean.trim())
            .filter(Boolean);
        // Deux déclarations entières : le « ; » de la data: URL et celui du
        // contenu entre guillemets ne doivent découper ni l'une ni l'autre.
        expect(segments).toHaveLength(2);
        expect(segments[0]).toMatch(/^background: url\(/);
        expect(segments[0]).not.toContain(';');
        expect(segments[1]).toMatch(/^content:/);
        expect(segments[1]).not.toContain('url');
    });
});