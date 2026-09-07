/**
 * @vitest-environment jsdom
 *
 * Vignettes de prévisualisation et touches de télécommande.
 *
 * Deux fonctionnalités sans rapport apparent, réunies par ce qu'elles ont en
 * commun : toutes deux échouent SILENCIEUSEMENT quand on se trompe.
 *
 * Le trickplay renvoie un 404 si l'on omet `mediaSourceId` — l'erreur la plus
 * rapportée sur cette API — et l'aperçu reste simplement vide. Les touches de
 * télécommande, sur Samsung, n'arrivent jamais si `registerKeyBatch` n'a pas
 * été appelé : l'application écoute un événement qui ne viendra pas.
 *
 * Dans les deux cas, rien ne plante et rien n'apparaît dans une console. Seul
 * un test qui vérifie la valeur peut les attraper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Trickplay from '../jellyfin/player/Trickplay.js';
import { actionMedia, enregistrerTouches, detecterPlateforme, ActionMedia, TOUCHES_TIZEN } from '../core/TelecommandeTv.js';

/** Réponse serveur type : 519 vignettes, une toutes les 10 s, planches 10×10. */
function itemAvecVignettes(sourceId = 'src-1') {
    return {
        Id: 'film-42',
        Trickplay: {
            [sourceId]: {
                320: { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 519, Interval: 10000 },
            },
        },
    };
}

const fabrique = () => new Trickplay({ serveur: () => 'http://nas:8096', jeton: () => 'jeton-x' });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); delete window.tizen; });

// ─────────────────────────────────────────────────────────────────────────────
describe('Trickplay — le calcul d\'index', () => {
    it('place correctement une vignette dans sa planche', () => {
        const t = fabrique();
        expect(t.preparer(itemAvecVignettes(), 'src-1')).toBe(true);

        // t = 0 → toute première vignette.
        expect(t.positionner(0)).toEqual({ tuile: 0, colonne: 0, ligne: 0 });
        // t = 35 s → index 3 (une vignette toutes les 10 s), donc 4e colonne.
        expect(t.positionner(35)).toEqual({ tuile: 0, colonne: 3, ligne: 0 });
        // t = 105 s → index 10 → deuxième ligne de la première planche.
        expect(t.positionner(105)).toEqual({ tuile: 0, colonne: 0, ligne: 1 });
        // t = 1000 s → index 100 → première vignette de la DEUXIÈME planche.
        expect(t.positionner(1000)).toEqual({ tuile: 1, colonne: 0, ligne: 0 });
    });

    it('refuse une position hors du média', () => {
        const t = fabrique();
        t.preparer(itemAvecVignettes(), 'src-1');
        // 519 vignettes × 10 s = 5190 s de couverture.
        expect(t.positionner(5190)).toBeNull();
        expect(t.positionner(99999)).toBeNull();
        expect(t.positionner(-5)).toBeNull();
    });
});

describe('Trickplay — l\'URL', () => {
    it('porte TOUJOURS mediaSourceId', () => {
        // C'est l'erreur la plus rapportée sur cette API : sans ce paramètre,
        // le serveur répond 404 et l'aperçu reste vide sans rien dire.
        const t = fabrique();
        t.preparer(itemAvecVignettes('abc-123'), 'abc-123');
        const url = t.urlPlanche(2);
        expect(url).toContain('mediaSourceId=abc-123');
        expect(url).toContain('/Videos/film-42/Trickplay/320/2.jpg');
    });

    it('choisit la largeur la plus proche de la cible sans la dépasser inutilement', () => {
        const t = fabrique();
        t.preparer({
            Id: 'f', Trickplay: { s: {
                160: { Width: 160, Height: 90, TileWidth: 10, TileHeight: 10, ThumbnailCount: 10, Interval: 10000 },
                320: { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 10, Interval: 10000 },
                640: { Width: 640, Height: 360, TileWidth: 10, TileHeight: 10, ThumbnailCount: 10, Interval: 10000 },
            } },
        }, 's');
        // Une planche 640 px pèse quatre fois plus qu'une 320 px pour un gain
        // invisible sur la barre de progression.
        expect(t.urlPlanche(0)).toContain('/Trickplay/320/');
    });
});

describe('Trickplay — ce qui ne doit pas casser', () => {
    it('se déclare indisponible sans planter quand le serveur n\'a rien généré', () => {
        const t = fabrique();
        expect(t.preparer({ Id: 'f' }, 's')).toBe(false);
        expect(t.disponible).toBe(false);
        expect(t.positionner(10)).toBeNull();
        expect(t.dimensions).toBeNull();
    });

    it('accepte une source inconnue plutôt que de tout abandonner', () => {
        // Des versions de durées identiques donnent des vignettes légèrement
        // décalées — préférable à pas de vignettes du tout.
        const t = fabrique();
        expect(t.preparer(itemAvecVignettes('autre-source'), 'source-absente')).toBe(true);
    });

    it('refuse une configuration incomplète', () => {
        const t = fabrique();
        expect(t.preparer({ Id: 'f', Trickplay: { s: { 320: { Width: 320 } } } }, 's')).toBe(false);
    });

    it('borne le nombre de planches gardées en mémoire', async () => {
        // Une planche 10×10 en 320 px pèse 200 à 400 ko. En garder vingt sur un
        // téléviseur reproduirait, pour les vignettes, le défaut qu'on vient de
        // corriger sur le tampon HLS.
        //
        // jsdom ne charge pas les images : on remplace `Image` par un double
        // qui déclenche `onload` immédiatement, sinon la promesse ne se résout
        // jamais et le test expire.
        const vraieImage = globalThis.Image;
        globalThis.Image = class {
            set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); }
            get src() { return this._src; }
        };
        try {
            const t = fabrique();
            t.preparer(itemAvecVignettes(), 'src-1');
            for (let i = 0; i < 10; i++) await t.planche(i);
            // Quatre planches suffisent à un déplacement continu du curseur.
            expect(t._planches.size).toBeLessThanOrEqual(4);
            // Et ce sont les PLUS RÉCENTES qui restent.
            expect(t._planches.has(9)).toBe(true);
            expect(t._planches.has(0)).toBe(false);

            t.reinitialiser();
            expect(t._planches.size).toBe(0);
            expect(t.disponible).toBe(false);
        } finally {
            globalThis.Image = vraieImage;
        }
    });

    it('ne recharge pas une planche déjà en mémoire', async () => {
        let chargements = 0;
        const vraieImage = globalThis.Image;
        globalThis.Image = class {
            set src(v) { chargements += 1; this._src = v; queueMicrotask(() => this.onload?.()); }
            get src() { return this._src; }
        };
        try {
            const t = fabrique();
            t.preparer(itemAvecVignettes(), 'src-1');
            await t.planche(3);
            await t.planche(3);
            await t.planche(3);
            expect(chargements, 'la planche a été retéléchargée').toBe(1);
        } finally {
            globalThis.Image = vraieImage;
        }
    });

    it('rend null sans planter quand la planche n\'existe pas', async () => {
        const vraieImage = globalThis.Image;
        globalThis.Image = class {
            set src(v) { this._src = v; queueMicrotask(() => this.onerror?.()); }
            get src() { return this._src; }
        };
        try {
            const t = fabrique();
            t.preparer(itemAvecVignettes(), 'src-1');
            // Le serveur peut ne pas avoir encore généré cette planche : ce
            // n'est pas une panne, l'aperçu reste simplement vide.
            await expect(t.planche(0)).resolves.toBeNull();
            expect(t._planches.size).toBe(0);
        } finally {
            globalThis.Image = vraieImage;
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Touches de télécommande', () => {
    it('traduit les codes Tizen', () => {
        expect(actionMedia({ keyCode: 10252 })).toBe(ActionMedia.PLAY_PAUSE);
        expect(actionMedia({ keyCode: 412 })).toBe(ActionMedia.REWIND);
        expect(actionMedia({ keyCode: 417 })).toBe(ActionMedia.FAST_FORWARD);
        expect(actionMedia({ keyCode: 10233 })).toBe(ActionMedia.NEXT);
    });

    it('traduit les codes Fire TV', () => {
        // Amazon exige que toute app média soumise gère Lecture/Pause.
        expect(actionMedia({ keyCode: 179 })).toBe(ActionMedia.PLAY_PAUSE);
        expect(actionMedia({ keyCode: 227 })).toBe(ActionMedia.REWIND);
        expect(actionMedia({ keyCode: 228 })).toBe(ActionMedia.FAST_FORWARD);
    });

    it('traduit aussi les noms standards du clavier', () => {
        expect(actionMedia({ key: 'MediaPlayPause' })).toBe(ActionMedia.PLAY_PAUSE);
        expect(actionMedia({ key: 'MediaTrackNext' })).toBe(ActionMedia.NEXT);
    });

    it('ignore ce qui n\'est pas une touche média', () => {
        expect(actionMedia({ key: 'ArrowRight', keyCode: 39 })).toBeNull();
        expect(actionMedia({ key: 'Enter', keyCode: 13 })).toBeNull();
        expect(actionMedia(null)).toBeNull();
        expect(actionMedia({})).toBeNull();
    });

    it('demande les touches à Tizen — sans quoi elles n\'arrivent jamais', () => {
        const registerKeyBatch = vi.fn();
        window.tizen = { tvinputdevice: { registerKeyBatch } };

        const bilan = enregistrerTouches();

        expect(registerKeyBatch).toHaveBeenCalledOnce();
        expect(registerKeyBatch.mock.calls[0][0]).toEqual(TOUCHES_TIZEN);
        expect(bilan.enregistrees).toEqual(TOUCHES_TIZEN);
        expect(bilan.erreur).toBeNull();
    });

    it('retombe sur l\'enregistrement unitaire si le lot n\'existe pas', () => {
        const registerKey = vi.fn();
        window.tizen = { tvinputdevice: { registerKey } };
        const bilan = enregistrerTouches();
        expect(registerKey).toHaveBeenCalledTimes(TOUCHES_TIZEN.length);
        expect(bilan.enregistrees.length).toBe(TOUCHES_TIZEN.length);
    });

    it('ne demande QUE les touches utilisées', () => {
        // Enregistrer une touche qu'on n'utilise pas la retire au système du
        // téléviseur, qui cesse d'y répondre. C'est une capture, pas une écoute.
        expect(TOUCHES_TIZEN).not.toContain('ColorF0Red');
        expect(TOUCHES_TIZEN).not.toContain('ChannelUp');
        expect(TOUCHES_TIZEN.every(t => t.startsWith('Media'))).toBe(true);
    });

    it('ne plante pas quand Tizen refuse, et le rapporte', () => {
        window.tizen = { tvinputdevice: { registerKeyBatch: () => { throw new Error('refusé'); } } };
        const bilan = enregistrerTouches();
        expect(bilan.erreur).toBe('refusé');
        expect(bilan.enregistrees).toEqual([]);
    });

    it('ne fait rien hors téléviseur Samsung', () => {
        const bilan = enregistrerTouches();
        expect(bilan.enregistrees).toEqual([]);
        expect(bilan.erreur).toBeNull();
        expect(detecterPlateforme()).toBe('navigateur');
    });

    it('détecte la plateforme', () => {
        window.tizen = {};
        expect(detecterPlateforme()).toBe('tizen');
    });
});
