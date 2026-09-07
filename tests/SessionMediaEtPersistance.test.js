/**
 * @vitest-environment jsdom
 *
 * Session média système et persistance du stockage.
 *
 * DEUX API QUI ÉCHOUENT EN JETANT, PAS EN RENVOYANT `false`.
 *
 * `setActionHandler` lève une TypeError pour une action que le navigateur ne
 * connaît pas. `setPositionState` lève une TypeError si la durée n'est pas
 * finie — c'est-à-dire à CHAQUE seconde d'un flux en direct. Une implémentation
 * qui ne protège pas ces deux appels marche parfaitement sur le poste de
 * développement et casse chez l'utilisateur : sur Chrome de bureau toutes les
 * actions existent, et un fichier local a toujours une durée.
 *
 * Ces tests reproduisent donc les navigateurs qui refusent, pas celui qui
 * accepte tout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SessionMedia, { TAILLES_VIGNETTE } from '../core/SessionMedia.js';

/**
 * Fausse `navigator.mediaSession`.
 * @param {{actionsConnues?: string[], dureeExigeeFinie?: boolean}} options
 */
function poserSession({ actionsConnues = null, dureeExigeeFinie = true } = {}) {
    const poses = new Map();
    const session = {
        metadata: undefined,
        playbackState: 'none',
        positions: [],
        effacements: 0,
        setActionHandler(action, fn) {
            // Le vrai comportement : une action inconnue JETTE.
            if (actionsConnues && !actionsConnues.includes(action)) {
                throw new TypeError(`Unsupported action: ${action}`);
            }
            if (fn === null) poses.delete(action);
            else poses.set(action, fn);
        },
        setPositionState(etat) {
            if (etat === undefined) { session.effacements += 1; return; }
            if (dureeExigeeFinie && !Number.isFinite(etat?.duration)) {
                throw new TypeError('duration must be finite');
            }
            if (etat.position > etat.duration) throw new TypeError('position > duration');
            if (!(etat.playbackRate > 0)) throw new TypeError('playbackRate must be positive');
            session.positions.push(etat);
        },
        poses,
    };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    globalThis.MediaMetadata = class { constructor(init) { Object.assign(this, init); } };
    return session;
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => {
    delete navigator.mediaSession;
    delete globalThis.MediaMetadata;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SessionMedia — actions refusées par la plateforme', () => {
    it('pose les actions suivantes même quand une action est inconnue', () => {
        // iOS ne connaît pas `stop` ; beaucoup de plateformes ignorent `seekto`.
        const session = poserSession({ actionsConnues: ['play', 'pause', 'nexttrack'] });
        const sm = new SessionMedia();

        const acceptees = sm.brancher({
            play: () => {},
            stop: () => {},          // inconnue : jette
            pause: () => {},
            seekto: () => {},        // inconnue : jette
            nexttrack: () => {},
        });

        // CONTRE-ÉPREUVE DU PIÈGE : sans un `try` PAR action, l'exception sur
        // `stop` interromprait la boucle et `pause` comme `nexttrack` ne
        // seraient jamais posées. Leur présence est la preuve du contraire.
        expect(acceptees).toEqual(['play', 'pause', 'nexttrack']);
        expect(session.poses.has('pause')).toBe(true);
        expect(session.poses.has('nexttrack')).toBe(true);
        expect(session.poses.has('stop')).toBe(false);
    });

    it('ne jette jamais vers l\'appelant', () => {
        poserSession({ actionsConnues: [] });   // tout est refusé
        const sm = new SessionMedia();
        expect(() => sm.brancher({ play: () => {}, pause: () => {} })).not.toThrow();
        expect(sm.brancher({ play: () => {} })).toEqual([]);
    });

    it('relaie l\'action au gestionnaire fourni', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        const pause = vi.fn();
        sm.brancher({ pause });
        session.poses.get('pause')();
        expect(pause).toHaveBeenCalledOnce();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SessionMedia — position et direct', () => {
    it('publie une position valide', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        expect(sm.position({ duree: 7200, position: 120, vitesse: 1 })).toBe(true);
        expect(session.positions.at(-1)).toEqual({ duration: 7200, position: 120, playbackRate: 1 });
    });

    it('EFFACE l\'état sur un direct au lieu de jeter', () => {
        // Le cas qui casse en production : `video.duration === Infinity`.
        const session = poserSession();
        const sm = new SessionMedia();
        expect(() => sm.position({ duree: Infinity, position: 30 })).not.toThrow();
        expect(sm.position({ duree: Infinity, position: 30 })).toBe(false);
        // On efface : le système n'affiche pas de barre plutôt qu'une barre fausse.
        expect(session.effacements).toBeGreaterThan(0);
        expect(session.positions).toHaveLength(0);
    });

    it('borne une position qui dépasse la durée (arrondi de fin de fichier)', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        // `currentTime` peut dépasser `duration` de quelques millisecondes.
        expect(sm.position({ duree: 100, position: 100.4 })).toBe(true);
        expect(session.positions.at(-1).position).toBe(100);
    });

    it('remplace une vitesse nulle par 1 plutôt que de jeter', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        // `playbackRate` vaut 0 pendant une mise en mémoire tampon sur certains
        // navigateurs : l'API refuse cette valeur.
        expect(sm.position({ duree: 100, position: 10, vitesse: 0 })).toBe(true);
        expect(session.positions.at(-1).playbackRate).toBe(1);
    });

    it('ne publie rien quand la durée est encore inconnue', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        expect(sm.position({ duree: NaN, position: 0 })).toBe(false);
        expect(session.positions).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SessionMedia — fiche affichée par le système', () => {
    it('décline la vignette en plusieurs tailles, la plus petite d\'abord', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        sm.decrire({ titre: 'Dune', vignette: 'http://nas:8096/Items/x/Images/Primary?maxWidth=400&maxHeight=600' });

        const art = session.metadata.artwork;
        expect(art).toHaveLength(TAILLES_VIGNETTE.length);
        // Certaines plateformes prennent la PREMIÈRE utilisable, pas la meilleure.
        expect(art.map(a => a.sizes)).toEqual(['96x96', '128x128', '256x256', '512x512']);
        // La taille demandée au serveur suit : sinon on téléchargerait quatre
        // fois la pleine résolution pour une vignette de 96 px.
        expect(art[0].src).toContain('maxWidth=96');
        expect(art[0].src).toContain('maxHeight=96');
        expect(art[3].src).toContain('maxWidth=512');
    });

    it('n\'invente pas de vignette quand il n\'y en a pas', () => {
        const session = poserSession();
        new SessionMedia().decrire({ titre: 'Sans affiche' });
        expect(session.metadata.artwork).toEqual([]);
    });

    it('libère les gestionnaires et la fiche à la fermeture', () => {
        const session = poserSession();
        const sm = new SessionMedia();
        sm.brancher({ play: () => {}, pause: () => {} });
        sm.decrire({ titre: 'Dune' });
        expect(session.poses.size).toBe(2);

        sm.liberer();

        // CONTRE-ÉPREUVE : sans cette libération, la notification système
        // survit au lecteur et ses boutons appellent un lecteur détruit.
        expect(session.poses.size).toBe(0);
        expect(session.metadata).toBeNull();
        expect(session.playbackState).toBe('none');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SessionMedia — appareil sans l\'API', () => {
    it('reste inerte et ne jette pas', () => {
        delete navigator.mediaSession;
        const sm = new SessionMedia();
        expect(sm.supporte).toBe(false);
        expect(sm.brancher({ play: () => {} })).toEqual([]);
        expect(sm.decrire({ titre: 'X' })).toBe(false);
        expect(sm.position({ duree: 100, position: 1 })).toBe(false);
        expect(() => sm.liberer()).not.toThrow();
    });
});
