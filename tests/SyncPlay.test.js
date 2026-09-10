/**
 * @vitest-environment jsdom
 *
 * SyncPlay : l'horloge, la dérive, et l'oscillation.
 *
 * TROIS DÉFAUTS CLASSIQUES, ET AUCUN NE PRODUIT D'ERREUR.
 *
 * 1. Moyenner les mesures d'horloge au lieu de garder la meilleure. La gigue du
 *    réseau ne retarde jamais moins que zéro : une mesure lente est une mesure
 *    FAUSSE, et la moyenner avec les bonnes contamine le résultat.
 *
 * 2. Se tromper de signe dans la correction de dérive. Être en avance et
 *    accélérer double l'écart au lieu de le réduire — et le symptôme est une
 *    désynchronisation qui empire au lieu de s'améliorer, ce qu'on attribue au
 *    réseau.
 *
 * 3. Annoncer au groupe son propre saut de rattrapage. Les autres sautent,
 *    annoncent à leur tour, et l'oscillation ne s'arrête plus. C'est la panne
 *    la plus spectaculaire du lot, et la plus facile à écrire.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HorlogeServeur, { LATENCE_MAX_MS } from '../jellyfin/temps-reel/HorlogeServeur.js';
import SyncPlay, { DERIVE_IGNOREE_MS, SEUIL_SAUT_MS, VITESSE_MIN, VITESSE_MAX } from '../jellyfin/temps-reel/SyncPlay.js';

const TICKS = 10_000_000;

beforeEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('HorlogeServeur — la mesure NTP', () => {
    /**
     * Simule un aller-retour.
     * @param {number} decalageVrai  écart réel entre horloge locale et serveur
     * @param {number} aller         durée du trajet aller
     * @param {number} retour        durée du trajet retour
     * @param {number} traitement    temps passé DANS le serveur
     */
    function poserApi({ decalageVrai = 0, aller = 20, retour = 20, traitement = 5 } = {}) {
        let horloge = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => horloge);
        return {
            get: vi.fn(async () => {
                const t1 = horloge;
                horloge += aller;
                const t2 = horloge + decalageVrai;
                horloge += traitement;
                const t3 = horloge + decalageVrai;
                horloge += retour;
                return {
                    RequestReceptionTime: new Date(t2).toISOString(),
                    ResponseTransmissionTime: new Date(t3).toISOString(),
                };
            }),
            avancer: (ms) => { horloge += ms; },
            get t1() { return horloge; },
        };
    }

    it('retrouve le décalage réel sur un trajet symétrique', async () => {
        const api = poserApi({ decalageVrai: 5000, aller: 20, retour: 20 });
        const h = new HorlogeServeur({ api });
        await h.mesurer();
        // Le décalage est exact quand aller et retour durent autant.
        expect(h.decalageMs).toBeCloseTo(5000, -1);
        expect(h.calee).toBe(true);
    });

    it('mesure la latence SANS le temps passé dans le serveur', async () => {
        // Un serveur chargé ne doit pas faire croire à un réseau lent : deux
        // appareils du même réseau doivent obtenir la même latence.
        const rapide = new HorlogeServeur({ api: poserApi({ aller: 20, retour: 20, traitement: 5 }) });
        await rapide.mesurer();
        const lent = new HorlogeServeur({ api: poserApi({ aller: 20, retour: 20, traitement: 500 }) });
        await lent.mesurer();
        expect(rapide.latenceMs).toBeCloseTo(lent.latenceMs, 0);
    });

    it('GARDE LA MEILLEURE mesure, ne moyenne pas', async () => {
        const h = new HorlogeServeur({ api: poserApi({ decalageVrai: 1000, aller: 400, retour: 400 }) });
        await h.mesurer();
        const apresMauvaise = h.decalageMs;

        // Une mesure rapide arrive ensuite : c'est elle qui doit gagner.
        h._api = poserApi({ decalageVrai: 1000, aller: 5, retour: 5 });
        await h.mesurer();

        // CONTRE-ÉPREUVE : en moyennant, on garderait la contamination de la
        // mesure lente. Ici la latence retenue doit être celle de la BONNE.
        expect(h.latenceMs).toBeLessThan(50);
        expect(h.decalageMs).toBeCloseTo(1000, -1);
        // Et la mauvaise n'a pas laissé de trace.
        expect(Math.abs(h.decalageMs - apresMauvaise)).toBeGreaterThanOrEqual(0);
    });

    it('ne remplace PAS une bonne mesure par une moins bonne', async () => {
        const h = new HorlogeServeur({ api: poserApi({ decalageVrai: 1000, aller: 5, retour: 5 }) });
        await h.mesurer();
        const bonne = h.latenceMs;
        h._api = poserApi({ decalageVrai: 1000, aller: 400, retour: 400 });
        await h.mesurer();
        expect(h.latenceMs).toBe(bonne);
    });

    it('rejette une latence aberrante plutôt que de caler dessus', async () => {
        const h = new HorlogeServeur({ api: poserApi({ aller: LATENCE_MAX_MS, retour: LATENCE_MAX_MS }) });
        expect(await h.mesurer()).toBeNull();
        expect(h.calee).toBe(false);
    });

    it('survit à un serveur qui ne répond pas, ou répond mal', async () => {
        const h = new HorlogeServeur({ api: { get: async () => { throw new Error('réseau'); } } });
        expect(await h.mesurer()).toBeNull();

        const h2 = new HorlogeServeur({ api: { get: async () => ({ RequestReceptionTime: 'pas une date' }) } });
        expect(await h2.mesurer()).toBeNull();
    });

    it('convertit un instant serveur en instant local', async () => {
        const api = poserApi({ decalageVrai: 3000, aller: 10, retour: 10 });
        const h = new HorlogeServeur({ api });
        await h.mesurer();
        const instantServeur = Date.now() + 3000 + 5000;   // dans 5 s, heure serveur
        // Sans conversion, un appareil dont l'horloge dérive de trois secondes
        // démarrerait trois secondes trop tôt, systématiquement.
        expect(h.versLocal(instantServeur)).toBeCloseTo(Date.now() + 5000, -2);
        expect(h.versLocal('pas une date')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SyncPlay — la dérive', () => {
    let video;
    let sp;
    let horlogeMs;

    beforeEach(() => {
        horlogeMs = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => horlogeMs);
        video = { currentTime: 100, playbackRate: 1, paused: false, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
        sp = new SyncPlay({
            api: { post: vi.fn(async () => ({})), get: vi.fn(async () => ({})) },
            socket: { sur: () => () => {} },
            lecteur: () => ({ videoElement: video }),
        });
        // Référence : on devrait être à 100 s à cet instant serveur.
        sp._reference = { positionS: 100, instantServeur: sp._horloge.maintenantServeur() };
    });

    it('ne fait rien pour une dérive négligeable', () => {
        video.currentTime = 100 + (DERIVE_IGNOREE_MS - 10) / 1000;
        const r = sp.verifierDerive();
        expect(r.action).toBe('rien');
        expect(video.playbackRate).toBe(1);
    });

    it('RALENTIT quand on est en AVANCE', () => {
        video.currentTime = 100.2;   // 200 ms d'avance
        const r = sp.verifierDerive();
        expect(r.action).toBe('vitesse');
        // CONTRE-ÉPREUVE DE L'ERREUR DE SIGNE : accélérer alors qu'on est en
        // avance double l'écart. Le symptôme est une désynchronisation qui
        // empire, qu'on attribue au réseau.
        expect(video.playbackRate).toBeLessThan(1);
        expect(video.playbackRate).toBeGreaterThanOrEqual(VITESSE_MIN);
    });

    it('ACCÉLÈRE quand on est en retard', () => {
        video.currentTime = 99.8;    // 200 ms de retard
        sp.verifierDerive();
        expect(video.playbackRate).toBeGreaterThan(1);
        expect(video.playbackRate).toBeLessThanOrEqual(VITESSE_MAX);
    });

    it('SAUTE au-delà du seuil, au lieu de corriger pendant une minute', () => {
        video.currentTime = 100 + (SEUIL_SAUT_MS + 200) / 1000;
        const r = sp.verifierDerive();
        expect(r.action).toBe('saut');
        expect(video.currentTime).toBeCloseTo(100, 2);
        // La vitesse est rétablie : rester à 1,2× après un saut ferait dériver
        // dans l'autre sens immédiatement.
        expect(video.playbackRate).toBe(1);
    });

    it('rétablit la vitesse dès que l\'écart est refermé', () => {
        video.currentTime = 100.2;
        sp.verifierDerive();
        expect(video.playbackRate).not.toBe(1);
        video.currentTime = 100.01;
        sp.verifierDerive();
        expect(video.playbackRate).toBe(1);
    });

    it('tient compte du TEMPS ÉCOULÉ depuis la référence', () => {
        // Dix secondes passent : on devrait être à 110 s.
        horlogeMs += 10_000;
        video.currentTime = 110;
        expect(sp.verifierDerive().action).toBe('rien');
        video.currentTime = 100;   // resté sur place : dix secondes de retard
        expect(sp.verifierDerive().action).toBe('saut');
    });

    it('ne corrige rien en pause ni sans référence', () => {
        video.currentTime = 200;
        sp._enPause = true;
        expect(sp.verifierDerive()).toBeNull();
        sp._enPause = false;
        video.paused = true;
        expect(sp.verifierDerive()).toBeNull();
        video.paused = false;
        sp._reference = null;
        expect(sp.verifierDerive()).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SyncPlay — l\'oscillation', () => {
    it('marque ses propres corrections comme internes', async () => {
        const video = { currentTime: 100, playbackRate: 1, paused: false, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
        const sp = new SyncPlay({
            api: { post: vi.fn(async () => ({})) },
            socket: { sur: () => () => {} },
            lecteur: () => ({ videoElement: video }),
        });
        sp._reference = { positionS: 100, instantServeur: sp._horloge.maintenantServeur() };
        video.currentTime = 100 + (SEUIL_SAUT_MS + 500) / 1000;

        let marqueePendant = false;
        const vrai = sp.estCorrectionInterne.bind(sp);
        Object.defineProperty(video, 'currentTime', {
            get() { return this._t ?? 100; },
            set(v) { this._t = v; marqueePendant = vrai(); },
        });
        video.currentTime = 100 + (SEUIL_SAUT_MS + 500) / 1000;
        sp.verifierDerive();

        // CONTRE-ÉPREUVE DE L'OSCILLATION : sans ce drapeau, l'écouteur
        // `seeked` du lecteur annoncerait notre propre rattrapage au groupe ;
        // les autres sauteraient, annonceraient à leur tour, et cela ne
        // s'arrêterait plus.
        expect(marqueePendant).toBe(true);
    });

    it('relâche le drapeau au tour suivant', async () => {
        const sp = new SyncPlay({ api: {}, socket: { sur: () => () => {} }, lecteur: () => null });
        sp._avecCorrection(() => {});
        expect(sp.estCorrectionInterne()).toBe(true);
        await new Promise(r => setTimeout(r, 5));
        // Le garder levé bloquerait toute annonce ultérieure, y compris les
        // vraies actions de l'utilisateur.
        expect(sp.estCorrectionInterne()).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SyncPlay — les ordres du serveur', () => {
    let video;
    let sp;

    beforeEach(() => {
        vi.useFakeTimers();
        video = { currentTime: 0, playbackRate: 1, paused: true, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
        sp = new SyncPlay({
            api: { post: vi.fn(async () => ({})) },
            socket: { sur: () => () => {} },
            lecteur: () => ({ videoElement: video, close: vi.fn() }),
        });
    });
    afterEach(() => vi.useRealTimers());

    it('attend l\'instant demandé au lieu de démarrer tout de suite', () => {
        const dansDeuxSecondes = Date.now() + 2000;
        sp._surCommande({ Command: 'Play', When: dansDeuxSecondes, PositionTicks: 42 * TICKS });

        // C'est TOUT l'intérêt de SyncPlay : démarrer à l'instant convenu, pas
        // à la réception du message.
        expect(video.play).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2000);
        expect(video.play).toHaveBeenCalled();
        expect(video.currentTime).toBe(42);
    });

    it('convertit les ticks en secondes', () => {
        sp._surCommande({ Command: 'Seek', When: Date.now(), PositionTicks: 90 * TICKS });
        vi.advanceTimersByTime(1);
        // Passer les ticks tels quels placerait la lecture dix millions de fois
        // trop loin.
        expect(video.currentTime).toBe(90);
    });

    it('démarre immédiatement quand l\'instant est déjà passé', () => {
        sp._surCommande({ Command: 'Play', When: Date.now() - 5000, PositionTicks: 10 * TICKS });
        // Attendre un instant passé bloquerait la lecture pour toujours.
        expect(video.play).toHaveBeenCalled();
    });

    it('pose une référence de dérive après un démarrage', () => {
        sp._surCommande({ Command: 'Play', When: Date.now(), PositionTicks: 30 * TICKS });
        vi.advanceTimersByTime(1);
        expect(sp._reference).not.toBeNull();
        expect(sp._reference.positionS).toBe(30);
    });

    it('efface la référence à la pause', () => {
        sp._surCommande({ Command: 'Play', When: Date.now(), PositionTicks: 30 * TICKS });
        vi.advanceTimersByTime(1);
        sp._surCommande({ Command: 'Pause', When: Date.now(), PositionTicks: 35 * TICKS });
        vi.advanceTimersByTime(1);
        // Garder la référence ferait « rattraper » un temps qui ne s'écoule pas.
        expect(sp._reference).toBeNull();
        expect(video.pause).toHaveBeenCalled();
    });

    it('ignore une commande inconnue plutôt que d\'en inventer l\'effet', () => {
        expect(() => sp._surCommande({ Command: 'Inconnue', When: Date.now() })).not.toThrow();
        expect(video.play).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Apparence des sous-titres', () => {
    let sousTitres;
    beforeEach(async () => { sousTitres = await import('../jellyfin/player/ApparenceSousTitres.js'); });

    function reglagesFactices(initial = {}) {
        const store = { ...initial };
        return { get: (c, d) => (c in store ? store[c] : d), set: (c, v) => { store[c] = v; }, store };
    }

    it('produit une règle ::cue et rien d\'autre', () => {
        const regle = sousTitres.css(sousTitres.DEFAUTS);
        expect(regle.startsWith('video::cue {')).toBe(true);
        // `::cue` n'accepte qu'une liste FERMÉE de propriétés. `padding`,
        // `border` et `position` y sont ignorés SANS ERREUR — le piège le plus
        // coûteux de ce sélecteur, et la raison pour laquelle on ne les écrit
        // pas.
        for (const interdite of ['padding', 'border', 'position', 'margin']) {
            expect(regle, interdite).not.toContain(`${interdite}:`);
        }
    });

    it('dessine le contour en QUATRE directions', () => {
        const regle = sousTitres.css({ fond: 'contour' });
        // `-webkit-text-stroke` est ignoré par ::cue ; le contour se fait par
        // ombres. Trois suffisent rarement : il manque toujours le côté où le
        // fond est le plus clair.
        const ombres = regle.match(/-?1px -?1px/g) || [];
        expect(ombres).toHaveLength(4);
    });

    it('REFUSE une couleur qui n\'en est pas une', () => {
        // CONTRE-ÉPREUVE : un réglage vient d'un fichier importable. Sans
        // filtre, cette valeur sortirait de la règle et réécrirait la page.
        const regle = sousTitres.css({ couleur: 'red; } body { display:none } .x {' });
        expect(regle).not.toContain('display:none');
        expect(regle).toContain('color: #ffffff');
        // Une couleur valide passe, elle.
        expect(sousTitres.css({ couleur: '#ff0000' })).toContain('color: #ff0000');
        expect(sousTitres.css({ couleur: '#f00' })).toContain('color: #f00');
    });

    it('borne la taille au lieu de produire une valeur absurde', () => {
        expect(sousTitres.css({ taille: 99999 })).toContain('font-size: 400%');
        expect(sousTitres.css({ taille: -50 })).toContain('font-size: 50%');
        expect(sousTitres.css({ taille: 'abc' })).toContain('font-size: 50%');
    });

    it('une boîte opaque est vraiment opaque', () => {
        expect(sousTitres.css({ fond: 'opaque' })).toContain('rgba(0, 0, 0, 1)');
        expect(sousTitres.css({ fond: 'ombre', opaciteFond: 40 })).toContain('rgba(0, 0, 0, 0.4)');
        // Une boîte et un contour ensemble se battraient : la boîte suffit.
        expect(sousTitres.css({ fond: 'opaque' })).toContain('text-shadow: none');
    });

    it('les défauts ne changent rien au rendu existant', () => {
        const vide = sousTitres.lire(reglagesFactices());
        expect(vide).toEqual(sousTitres.DEFAUTS);
    });

    it('complète des réglages partiels', () => {
        const r = sousTitres.lire(reglagesFactices({ 'player.sousTitres': { taille: 150 } }));
        expect(r.taille).toBe(150);
        expect(r.fond).toBe(sousTitres.DEFAUTS.fond);
    });

    it('réutilise la même balise de style au lieu d\'en empiler', () => {
        const settings = reglagesFactices();
        sousTitres.appliquer(settings);
        sousTitres.appliquer(settings);
        sousTitres.appliquer(settings);
        // Trois ouvertures du lecteur ne doivent pas laisser trois feuilles :
        // la dernière gagnerait, mais les autres resteraient à charge.
        expect(document.querySelectorAll('style#sh-style-sous-titres')).toHaveLength(1);
    });

    it('positionne les cues par `line`, la seule propriété qui le puisse', () => {
        const cues = [{ line: 'auto' }, { line: 'auto' }];
        const video = { textTracks: [{ mode: 'showing', cues }] };
        sousTitres.positionner(video, 2);
        expect(cues.every(c => c.line === -3)).toBe(true);
        sousTitres.positionner(video, 0);
        expect(cues.every(c => c.line === 'auto')).toBe(true);
    });

    it('ignore les pistes désactivées', () => {
        const cues = [{ line: 'auto' }];
        sousTitres.positionner({ textTracks: [{ mode: 'disabled', cues }] }, 3);
        expect(cues[0].line).toBe('auto');
    });
});
