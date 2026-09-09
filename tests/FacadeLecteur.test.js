/**
 * Segments médias — le contrat de façade du lecteur, séparé de la logique.
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * `SegmentsMedia.test.js` fige la LOGIQUE des segments (priorités, replis,
 * conversions). Celui-ci fige la FRONTIÈRE : la liste exacte des membres de
 * `VideoPlayer` que le monde extérieur a le droit d'appeler — modules frères,
 * tests existants, greffons. C'est le filet de la décomposition du monolithe :
 * après chaque « peau » extraite vers un module, tout membre délégué doit
 * encore exister et répondre.
 *
 * Si ce test échoue après un refactoring, un appelant réel a perdu sa cible.
 * Ajouter un membre est une évolution légitime ; en supprimer un exige
 * d'avoir prouvé qu'aucun appelant ne l'appelle plus.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import VideoPlayer from '../jellyfin/player/VideoPlayer.js';

describe('Le contrat de façade de VideoPlayer', () => {
    it('expose tous les membres appelés de l extérieur', () => {
        const p = new VideoPlayer();

        // Modules frères et temps réel (CibleDistante, SpatialNavigation…).
        const membresInternes = [
            'play', 'close', 'handleNavAction',
            '_togglePlayPause', '_seekRelative', '_executerActionMedia',
            '_showControls', '_reloadCurrentSourceWithOptions', '_toggleFullscreen',
            '_brancherSessionMedia', '_publierPosition',
        ];

        // La logique segments, unitairement testée par SegmentsMedia.test.js.
        const membresSegments = [
            '_chargerSegmentsMedia', '_segment', '_getIntroInterval',
            '_segmentActionnableA', '_passerSegment', '_performSkipIntro',
        ];

        for (const membre of [...membresInternes, ...membresSegments]) {
            expect(typeof p[membre], `membre manquant : ${membre}`).toBe('function');
        }
    });

    it('garde SEGMENTS_ACTIONNABLES lisible depuis la classe', () => {
        // Les libellés alimentent l'interface ; la liste est un contrat public.
        const types = VideoPlayer.SEGMENTS_ACTIONNABLES.map(s => s.type);
        expect(types).toEqual(['recap', 'intro', 'preview']);
    });

    it('garde les champs d état des segments présents sur une instance neuve', () => {
        // `_segmentsMedia` distingue « pas encore interrogé » (null) de
        // « serveur consulté, rien » ([]) — un appelant peut dépendre de
        // cette distinction, le test la fige.
        const p = new VideoPlayer();
        expect(p._segmentsMedia).toBeNull();
        expect(p._segmentsPourItem).toBeNull();
        expect(p._intervalleIntro).toBeUndefined();
        expect(p._segmentCourant).toBeNull();
    });
});
