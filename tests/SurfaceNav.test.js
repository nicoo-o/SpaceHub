/**
 * La sonde de surface du moteur de navigation — la moitié STATIQUE, et la
 * preuve que l'instrument mord.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * `scripts/sonde-surface-nav.mjs` mesure pendant la course e2e ce qui est
 * réellement ATTEINT (17/23 méthodes publiques aujourd'hui). C'est la bonne
 * mesure — un vrai navigateur, de vrais gestes — mais elle vit dans la course
 * lente : elle ne dit rien au développeur qui vient d'ajouter une méthode
 * publique que personne n'appellera jamais.
 *
 * Cette moitié-ci est statique, donc éligible à la chaîne rapide : elle lit les
 * sources, classe chaque membre public en atteint-de-fait / mort-toléré /
 * mort-nouveau, et refuse un nouveau membre mort. Ajouter du vide public doit
 * être une décision committée, jamais un effet de bord.
 *
 * LA SECONDE MOITIÉ, ET C'EST LA PLUS IMPORTANTE
 * ---------------------------------------------
 * Un contrôle qui ne peut pas échouer ne contrôle rien — la leçon la plus chère
 * de ce dépôt. Les cas « l'instrument mord » fabriquent donc un corps de
 * sources où le verdict DOIT signaler un trou, un privé de fait, un manquant et
 * un mort nouveau. C'est ce qui distingue cette sonde d'un rapport.
 *
 * Peau 0 de l'approfondissement de SpatialNavigation
 * (docs/DECOMPOSITION_SPATIALNAVIGATION.md).
 */

import { describe, it, expect } from 'vitest';

import { MEMBRES_APPELABLES } from '../core/ContratSpatialNavigation.js';
import {
    EXEMPTIONS,
    MORTS_TOLERES,
    inventaireReferences,
    membresJamaisReferencés,
    membresPublicsMoteur,
    verdictSurface,
} from '../scripts/sonde-surface-nav.mjs';

/** La surface publique du moteur au 12 septembre 2026, figée comme cliquet. */
const SURFACE_PUBLIQUE = Object.freeze([
    'activateFocused', 'activerDiagnostic', 'clearFocus', 'demandeRetour',
    'dernierDiagnostic', 'destroy', 'extendFocusables', 'focusFirst',
    'getFocusables', 'getFocusedElement', 'getGamepad', 'handleAction',
    'onLayerClosed', 'onModalClosed', 'onModalOpened', 'popFocus', 'pushFocus',
    'pushLayer', 'registerFocusables', 'restorePreviousFocus', 'setFocus',
    'unextendFocusables', 'unregisterFocusables',
]);

/** Un relevé où tout ce qui est public a été atteint au moins une fois. */
const releveComplet = publics => ({
    appels: Object.fromEntries(publics.map(m => [m, 1])),
    premierNiveau: Object.fromEntries(publics.map(m => [m, 1])),
});

describe('La surface publique du moteur, lue dans sa source', () => {
    it('est exactement celle qui a été mesurée et auditée', () => {
        // Si cette liste change, ce n'est pas un test à mettre à jour : c'est
        // une décision — nouvelle API publique, ou membre retiré — à écrire
        // dans le contrat (core/ContratSpatialNavigation.js) et dans le
        // registre. Le test la rend visible, il ne la juge pas.
        expect(membresPublicsMoteur()).toEqual([...SURFACE_PUBLIQUE]);
    });

    it('ne compte jamais un interne, ni le constructeur', () => {
        for (const membre of membresPublicsMoteur()) {
            expect(membre.startsWith('_'), `interne compté comme public : ${membre}`).toBe(false);
            expect(membre).not.toBe('constructor');
        }
    });
});

describe('Les références statiques — le croisement qui rend la sonde honnête', () => {
    it('voit la forme `svc.nav().membre`, pas seulement `nav.membre`', () => {
        // La forme chaînée est celle par laquelle le search atteint `pushLayer`,
        // `onLayerClosed` et `pushFocus`. Sans elle, trois membres VIVANTS
        // passaient pour morts — et une extraction les aurait privatisés.
        const references = inventaireReferences();
        for (const vivant of ['pushLayer', 'onLayerClosed', 'pushFocus']) {
            expect(references.get(vivant)?.length, `forme chaînée non vue : ${vivant}`).toBeGreaterThan(0);
        }
    });

    it('ne compte pas les commentaires comme des appels', () => {
        // Un membre cité dans une explication n'est pas un appelant. Le
        // balayage neutralise les commentaires AVANT de référencer.
        const references = inventaireReferences();
        for (const [membre, sites] of references) {
            for (const site of sites) {
                expect(site, `site sans ligne pour ${membre}`).toMatch(/:\d+$/);
            }
        }
    });
});

describe('Le gisement — les membres publics que rien n’atteint', () => {
    it('se limite aux quatre morts tolérés', () => {
        const morts = membresJamaisReferencés();
        expect(morts.sort()).toEqual(Object.keys(MORTS_TOLERES).sort());
    });

    it('est un cliquet dans les deux sens : un mort NOUVEAU échoue', () => {
        const verdict = verdictSurface(releveComplet(SURFACE_PUBLIQUE), {
            publics: [...SURFACE_PUBLIQUE, 'methodeFantome'],
            references: new Map(),
            morts: [...Object.keys(MORTS_TOLERES), 'methodeFantome'],
        });
        expect(verdict.mortsNouveaux).toEqual(['methodeFantome']);
    });

    it('et un membre mort NOUVEAU échoue aussi dans le verdict réel', () => {
        // La même règle, sans injection : si quelqu'un ajoute demain une
        // méthode publique que rien ne référence, ce test la nomme.
        const verdict = verdictSurface(releveComplet(SURFACE_PUBLIQUE));
        expect(verdict.mortsNouveaux, `membre public mort : ${verdict.mortsNouveaux.join(', ')}`).toEqual([]);
    });

    it('est un cliquet dans les deux sens : un mort RÉPARÉ doit sortir de la liste', () => {
        // `clearFocus` repris par un appelant : la ligne de MORTS_TOLERES est
        // désormais un mensonge, et la sonde le dit.
        const verdict = verdictSurface(releveComplet(SURFACE_PUBLIQUE), {
            publics: SURFACE_PUBLIQUE,
            references: new Map([['clearFocus', ['ui/Exemple.js:12']]]),
            morts: Object.keys(MORTS_TOLERES).filter(m => m !== 'clearFocus'),
        });
        expect(verdict.mortsReparés).toEqual(['clearFocus']);
    });
});

describe('Le contrat — ce qu’il promet, et qui doit exister', () => {
    it('ne déclare que des méthodes réellement portées par le moteur', () => {
        const publics = membresPublicsMoteur();
        for (const membre of MEMBRES_APPELABLES) {
            expect(publics, `le contrat promet une surface absente du moteur : ${membre}`).toContain(membre);
        }
    });

    it('n’exempte que des membres qu’il déclare vraiment', () => {
        // Une exemption orpheline est un mensonge silencieux : elle excuse un
        // membre qui n'est même plus au contrat.
        for (const membre of Object.keys(EXEMPTIONS)) {
            expect(MEMBRES_APPELABLES, `exemption sans membre au contrat : ${membre}`).toContain(membre);
        }
    });

    it('n’exempte jamais un membre mort : une exemption dit POURQUOI, pas « on ne sait pas »', () => {
        const morts = membresJamaisReferencés();
        for (const membre of Object.keys(EXEMPTIONS)) {
            expect(morts, `exempté et mort : ${membre}`).not.toContain(membre);
        }
    });
});

describe('L’instrument mord — la moitié qu’un rapport ne donne pas', () => {
    it('signale un TROU : atteint, référencé, absent du contrat', () => {
        const verdict = verdictSurface(
            { appels: { setFocus: 3, methodeOrpheline: 2 }, premierNiveau: {} },
            {
                publics: [...SURFACE_PUBLIQUE, 'methodeOrpheline'],
                references: new Map([['methodeOrpheline', ['ui/Exemple.js:40']]]),
                morts: Object.keys(MORTS_TOLERES),
            }
        );
        expect(verdict.trous).toEqual(['methodeOrpheline']);
    });

    it('ne confond pas un TROU avec un privé de fait : appel différé du moteur', () => {
        // `popFocus` est atteint 7 fois dans la course, et référencé nulle part
        // dans les sources : c'est le moteur qui se rappelle lui-même, par
        // `requestAnimationFrame`. Le compter comme appelant ferait crier au
        // trou, et on élargirait le contrat pour rien.
        const verdict = verdictSurface(
            { appels: { setFocus: 3, popFocus: 7 }, premierNiveau: { setFocus: 3 } },
            {
                publics: SURFACE_PUBLIQUE,
                references: new Map(),
                morts: Object.keys(MORTS_TOLERES),
            }
        );
        expect(verdict.prives).toContain('popFocus');
        expect(verdict.trous).not.toContain('popFocus');
    });

    it('signale un MANQUANT : déclaré, jamais atteint, sans exemption', () => {
        const verdict = verdictSurface(
            { appels: {}, premierNiveau: {} },
            {
                publics: SURFACE_PUBLIQUE,
                references: new Map(MEMBRES_APPELABLES.map(m => [m, ['ui/Exemple.js:1']])),
                morts: Object.keys(MORTS_TOLERES),
            }
        );
        // Toute la surface déclarée manque, sauf les deux exemptions décidées.
        expect(verdict.manquants).toEqual([...MEMBRES_APPELABLES].filter(m => !EXEMPTIONS[m]));
    });

    it('rend un verdict vert quand la mesure réelle est complète', () => {
        const verdict = verdictSurface(releveComplet(SURFACE_PUBLIQUE));
        expect(verdict.trous).toEqual([]);
        expect(verdict.manquants).toEqual([]);
        expect(verdict.mortsNouveaux).toEqual([]);
        expect(verdict.mortsReparés).toEqual([]);
    });
});
