/**
 * @vitest-environment jsdom
 *
 * Segments médias — « Passer l'introduction » qui marche vraiment.
 *
 * L'ancienne détection lisait le NOM des chapitres et cherchait « intro »,
 * « opening », « générique ». Presque aucun fichier n'a de chapitre nommé
 * ainsi : les chapitres viennent du conteneur vidéo et s'appellent
 * « Chapter 1 », « Chapter 2 »… La fonctionnalité existait dans le code sans
 * jamais s'afficher à l'écran.
 *
 * Depuis Jellyfin 10.10, le serveur expose des segments TYPÉS. Ces tests
 * figent l'ordre de priorité : segment du serveur d'abord, chapitres ensuite,
 * et rien du tout plutôt qu'une devinette.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import VideoPlayer from '../jellyfin/player/VideoPlayer.js';

const TIC = 10000000;   // 1 seconde en « ticks » Jellyfin

function lecteurAvecAuth() {
    const p = new VideoPlayer();
    // `_auth` est un accesseur en lecture seule qui résout le registre de
    // services : on alimente le registre, on ne remplace pas la propriété.
    // C'est le vrai chemin, pas un contournement.
    window.SpaceHub = window.SpaceHub || {};
    window.SpaceHub.auth = {
        getServerUrl: () => 'http://nas:8096',
        getAuthHeaders: () => ({ Authorization: 'MediaBrowser Token="x"' }),
    };
    return p;
}

function reponse(items, ok = true) {
    return { ok, status: ok ? 200 : 404, json: async () => ({ Items: items }) };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Chargement des segments', () => {
    it('lit /MediaSegments et convertit les ticks en secondes', async () => {
        globalThis.fetch = vi.fn(async () => reponse([
            { Type: 'Intro', StartTicks: 12 * TIC, EndTicks: 105 * TIC },
            { Type: 'Outro', StartTicks: 2600 * TIC, EndTicks: 2700 * TIC },
        ]));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item-1');

        expect(globalThis.fetch.mock.calls[0][0]).toContain('/MediaSegments/item-1');
        expect(p._segment('intro')).toEqual({ start: 12, end: 105 });
        expect(p._segment('outro')).toEqual({ start: 2600, end: 2700 });
    });

    it('prend le segment du serveur plutôt que les chapitres', async () => {
        globalThis.fetch = vi.fn(async () => reponse([
            { Type: 'Intro', StartTicks: 30 * TIC, EndTicks: 90 * TIC },
        ]));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item-2');

        // Des chapitres qui diraient autre chose ne doivent pas l'emporter.
        const item = { Chapters: [
            { Name: 'Intro', StartPositionTicks: 0, EndPositionTicks: 5 * TIC },
        ] };
        expect(p._getIntroInterval(item)).toEqual({ start: 30, end: 90 });
    });

    it('retombe sur les chapitres quand le serveur ne connaît pas les segments', async () => {
        // Un serveur 10.9, ou sans greffon de détection, répond 404.
        globalThis.fetch = vi.fn(async () => reponse([], false));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item-3');

        expect(p._segmentsMedia).toEqual([]);
        const item = { Chapters: [
            { Name: 'Opening Credits', StartPositionTicks: 0, EndPositionTicks: 62 * TIC },
            { Name: 'Chapter 2', StartPositionTicks: 62 * TIC },
        ] };
        expect(p._getIntroInterval(item)).toEqual({ start: 0, end: 62 });
    });

    it('ne devine rien quand il n\'y a ni segment ni chapitre exploitable', async () => {
        globalThis.fetch = vi.fn(async () => reponse([]));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item-4');
        expect(p._getIntroInterval({ Chapters: [
            { Name: 'Chapter 1', StartPositionTicks: 0 },
            { Name: 'Chapter 2', StartPositionTicks: 90 * TIC },
        ] })).toBeNull();
    });

    it('écarte un segment dont la fin ne suit pas le début', async () => {
        globalThis.fetch = vi.fn(async () => reponse([
            { Type: 'Intro', StartTicks: 100 * TIC, EndTicks: 100 * TIC },
        ]));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item-5');
        expect(p._segment('intro')).toBeNull();
    });

    it('ignore une réponse arrivée après un changement de titre', async () => {
        let debloquer;
        globalThis.fetch = vi.fn(() => new Promise(r => { debloquer = () => r(reponse([
            { Type: 'Intro', StartTicks: 0, EndTicks: 60 * TIC },
        ])); }));
        const p = lecteurAvecAuth();
        const enCours = p._chargerSegmentsMedia('ancien');
        p._playGeneration += 1;                 // l'utilisateur a lancé autre chose
        debloquer();
        await enCours;
        expect(p._segmentsMedia).toBeNull();    // rien n'a été écrit
    });

    it('survit à un serveur injoignable sans lever', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
        const p = lecteurAvecAuth();
        await expect(p._chargerSegmentsMedia('item-6')).resolves.toBeUndefined();
        expect(p._segmentsMedia).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Au-delà de l\'introduction', () => {
    /** Prépare un lecteur avec des segments déjà chargés. */
    async function lecteurAvecSegments(segments) {
        globalThis.fetch = vi.fn(async () => reponse(segments));
        const p = lecteurAvecAuth();
        await p._chargerSegmentsMedia('item');
        p._intervalleIntro = p._getIntroInterval({});
        return p;
    }

    it('propose de passer le résumé, pas seulement l\'intro', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Recap', StartTicks: 5 * TIC, EndTicks: 95 * TIC },
        ]);
        const seg = p._segmentActionnableA(40);
        expect(seg).toBeTruthy();
        expect(seg.libelle).toBe('Passer le résumé');
        expect(seg.end).toBe(95);
    });

    it('propose de passer l\'aperçu du prochain épisode', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Preview', StartTicks: 10 * TIC, EndTicks: 40 * TIC },
        ]);
        expect(p._segmentActionnableA(20).libelle).toBe('Passer l\'aperçu');
    });

    it('ne propose rien hors des plages', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Intro', StartTicks: 10 * TIC, EndTicks: 70 * TIC },
        ]);
        expect(p._segmentActionnableA(5)).toBeNull();
        expect(p._segmentActionnableA(70), 'la borne de fin est exclue').toBeNull();
        expect(p._segmentActionnableA(69)).toBeTruthy();
    });

    it('donne la priorité au résumé quand il chevauche l\'introduction', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Intro', StartTicks: 0, EndTicks: 120 * TIC },
            { Type: 'Recap', StartTicks: 10 * TIC, EndTicks: 60 * TIC },
        ]);
        expect(p._segmentActionnableA(30).libelle).toBe('Passer le résumé');
        // Hors du résumé, l'introduction reprend la main.
        expect(p._segmentActionnableA(90).libelle).toBe('Passer l\'intro');
    });

    it('ne propose jamais de passer une coupure publicitaire', async () => {
        // Décider à la place de l'utilisateur ce qui est du contenu n'est pas
        // notre rôle : `commercial` est hors de la liste actionnable.
        const p = await lecteurAvecSegments([
            { Type: 'Commercial', StartTicks: 10 * TIC, EndTicks: 40 * TIC },
        ]);
        expect(p._segmentActionnableA(20)).toBeNull();
    });

    it('expose le générique de fin pour caler la carte « épisode suivant »', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Outro', StartTicks: 2600 * TIC, EndTicks: 2700 * TIC },
        ]);
        // C'est ce que lit `_onTimeUpdate` : le serveur sait où commence le
        // générique, bien mieux que « il reste 30 secondes ».
        expect(p._segment('outro')).toEqual({ start: 2600, end: 2700 });
        // Et l'outro n'est pas actionnable au bouton : elle déclenche la carte.
        expect(p._segmentActionnableA(2650)).toBeNull();
    });

    it('fait sauter la lecture à la fin du segment', async () => {
        const p = await lecteurAvecSegments([
            { Type: 'Intro', StartTicks: 10 * TIC, EndTicks: 88 * TIC },
        ]);
        p._video = { currentTime: 20, duration: 1500 };
        p._showFlashOSD = vi.fn();
        p._passerSegment(p._segmentActionnableA(20));
        expect(p._video.currentTime).toBe(88);
    });
});
