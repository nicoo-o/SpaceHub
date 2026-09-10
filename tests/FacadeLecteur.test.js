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
import { MEMBRES_APPELABLES, CHAMPS_TOLERES, PROPRIETES_PUBLIQUES } from '../jellyfin/player/ContratFacade.js';

describe('Le contrat de façade de VideoPlayer', () => {
    it('expose tous les membres appelés de l extérieur', () => {
        const p = new VideoPlayer();

        // La liste vit dans jellyfin/player/ContratFacade.js — source de
        // vérité unique partagée avec le contrôle côté appelants
        // (scripts/facade-appelants-check.mjs).
        for (const membre of MEMBRES_APPELABLES) {
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

    it('ne tolère aucun champ hors contrat dans la liste des champs', () => {
        // Garde-fou méta : CHAMPS_TOLERES ne doit lister que des champs qui
        // existent réellement sur une instance neuve — sinon la liste dérive
        // du code et les deux gardiens protègent une fiction.
        const p = new VideoPlayer();
        for (const champ of CHAMPS_TOLERES) {
            expect(champ in p, `champ introuvable sur l'instance : ${champ}`).toBe(true);
        }
    });

    it('garde la file d attente hors des champs construits, mais accessible par l API publique', () => {
        // `_queue` n'existe pas sur une instance neuve : la paire d'accesseurs
        // publique `queue` (get/set) est l'API — SpaceHub l'alimente au
        // démarrage, le miroir `_queue` a disparu.
        const p = new VideoPlayer();
        expect('_queue' in p).toBe(false);
        expect('queue' in p).toBe(true);
        p.queue = { marque: 'file-de-test' };
        expect(p.queue.marque).toBe('file-de-test');
    });

    it('expose l élément vidéo par l accesseur public videoElement, en lecture seule', () => {
        // `_video` n'est plus toléré : l'élément <video> se lit par l'API
        // publique `videoElement` — jamais par un champ underscore.
        const p = new VideoPlayer();
        expect('videoElement' in p).toBe(true);
        expect(p.videoElement).toBeNull();
    });

    it('déclare dans le contrat les propriétés publiques qu il possède', () => {
        // Méta-garde : PROPRIETES_PUBLIQUES ne doit lister que des propriétés
        // réellement portées par l'instance — sinon le contrat protège une
        // fiction.
        const p = new VideoPlayer();
        for (const propriete of PROPRIETES_PUBLIQUES) {
            expect(propriete in p, `propriété introuvable : ${propriete}`).toBe(true);
        }
    });
});
