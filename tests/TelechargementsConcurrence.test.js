/**
 * @vitest-environment jsdom
 *
 * SpaceHub — deux appuis sur « Télécharger », un seul transfert
 * ============================================================
 *
 * CE QUE CE FICHIER CORRIGE DANS L'AUDIT LUI-MÊME
 * -----------------------------------------------
 * L'audit du 12 septembre 2026 a rangé `DownloadManager.telecharger()` parmi
 * les défauts de logique, au motif que le dédoublonnage en mémoire
 *
 *     if (this._encours?.id === id || this._file.some(…))
 *
 * est placé APRÈS un `await this._store.existe(id)` — un vrai aller-retour
 * IndexedDB. Deux appuis rapprochés glisseraient donc tous les deux dans la
 * fenêtre ouverte par cette attente, et le média serait transféré deux fois.
 *
 * Le raisonnement est juste ; la conclusion ne l'était pas. Vérifié ici, et
 * c'est le premier cas de ce fichier : le second appui est CORRECTEMENT
 * refusé. La raison n'est pas le dédoublonnage, elle est ailleurs et elle
 * n'est écrite nulle part — `_transferer()` pose `this._encours` avant son
 * premier `await`. Quand le second appel reprend la main, la file a déjà été
 * vidée par `_traiterFile()` mais `_encours` est renseigné, et le test
 * `this._encours?.id === id` répond vrai.
 *
 * L'INVARIANT N'EST DONC PAS FAUX, IL EST SUSPENDU À UN DÉTAIL
 * -----------------------------------------------------------
 * Ce détail est le préfixe synchrone de `_transferer()`. Il suffit d'insérer
 * une attente avant la ligne 196 — lire les sources du média, demander un
 * profil d'appareil, n'importe quoi de raisonnable — pour que le second
 * appel ne voie plus rien : ni `_encours` (pas encore posé), ni la file
 * (déjà vidée). Le média part deux fois, deux écritures IndexedDB se
 * marchent dessus, et RIEN ne le signale : les deux transferts réussissent.
 *
 * D'où le second cas, qui est une épreuve et non une illustration : il
 * décale artificiellement la pose de `_encours` et exige que le
 * dédoublonnage tienne quand même. Il échoue sur le code d'origine. C'est
 * ce test-là qui protège l'invariant, pas le premier.
 *
 * LA CORRECTION, ET CE QU'ELLE CHANGE D'OBSERVABLE
 * -----------------------------------------------
 * `telecharger()` réserve désormais l'identifiant de façon synchrone, dès
 * son entrée. Deux conséquences visibles dans ces cas :
 *
 *   — le second appui est refusé SANS interroger IndexedDB (un aller-retour
 *     de moins, et surtout un refus qui ne dépend plus de l'ordre des
 *     attentes) ;
 *   — le refus ne s'appuie plus sur `_encours`, donc il tient même si
 *     `_transferer()` gagne un `await` en tête un jour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DownloadManager from '../jellyfin/offline/DownloadManager.js';

/**
 * Un magasin dont `existe()` est LENT — c'est toute la fenêtre de course.
 * On garde la main sur sa résolution pour placer les deux appels
 * exactement là où le défaut se produirait.
 */
function magasinLent() {
    const enAttente = [];
    return {
        _enAttente: enAttente,
        existe: () => new Promise((resoudre) => enAttente.push(resoudre)),
        quota: async () => ({ connu: false, disponible: 0 }),
        enregistrer: vi.fn(async () => {}),
        demanderPersistance: async () => true,
        /** Laisse repartir tous les `existe()` suspendus, dans l'ordre. */
        libererTout(valeur = false) {
            while (enAttente.length) enAttente.shift()(valeur);
        },
    };
}

function authValide() {
    return {
        getServerUrl: () => 'http://serveur.invalide',
        getToken: () => 'jeton',
        getDeviceId: () => 'appareil',
    };
}

/**
 * Un corps de réponse qui se termine tout de suite.
 *
 * Une première version rendait un lecteur qui ne répondait jamais, pour
 * « garder le transfert en cours ». Mauvais choix : les cas se terminaient en
 * expirant au bout de cinq secondes, ce qui ressemble à un défaut du code
 * mesuré alors que c'est le montage qui était bloqué. La course qu'on veut
 * observer se joue entièrement AVANT le premier octet lu ; le corps n'a donc
 * aucune raison de traîner.
 */
function reponseImmediate() {
    let rendu = false;
    return {
        ok: true,
        status: 200,
        headers: { get: (n) => (n === 'Content-Length' ? '4' : 'video/mp4') },
        body: {
            getReader: () => ({
                read: async () => (rendu
                    ? { done: true }
                    : (rendu = true, { done: false, value: new Uint8Array([1, 2, 3, 4]) })),
                cancel() {},
            }),
        },
    };
}

describe('DownloadManager — deux appuis rapprochés', () => {
    let transferts;

    beforeEach(() => {
        transferts = 0;
        vi.stubGlobal('fetch', vi.fn(async () => { transferts += 1; return reponseImmediate(); }));
        vi.stubGlobal('Blob', globalThis.Blob || class { constructor(p) { this.parts = p; } });
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('le second appui est refusé, et un seul transfert part', async () => {
        const store = magasinLent();
        const dm = new DownloadManager({ store, auth: authValide() });

        const premier = dm.telecharger({ Id: 'film-1', Name: 'Film' });
        const second = dm.telecharger({ Id: 'film-1', Name: 'Film' });

        // UN SEUL appel est suspendu dans `existe()`. La réservation refuse
        // le second avant toute attente — il n'interroge même pas IndexedDB.
        // (Avant la correction, les deux y descendaient : deux réponses en
        // attente ici, et le refus du second reposait sur un effet de bord de
        // `_transferer()`.)
        expect(store._enAttente.length).toBe(1);
        store.libererTout(false);

        const resultat = await second;
        expect(resultat.ok).toBe(false);
        expect(resultat.raison).toMatch(/déjà/i);

        await premier;
        expect(transferts).toBe(1);
    });

    it("même si `_encours` est posé en retard, le second appui est refusé", async () => {
        // L'ÉPREUVE. On décale la pose de `_encours` d'un tour de boucle,
        // ce qu'une seule ligne d'`await` ajoutée dans `_transferer()`
        // suffirait à produire. Sans dédoublonnage placé avant l'attente
        // d'IndexedDB, le second appui passe et le média part deux fois.
        const store = magasinLent();
        const dm = new DownloadManager({ store, auth: authValide() });

        const transfererOriginal = dm._transferer.bind(dm);
        dm._transferer = async (item) => {
            await Promise.resolve();          // le retard, en une ligne
            return transfererOriginal(item);
        };

        const premier = dm.telecharger({ Id: 'film-2', Name: 'Film' });
        const second = dm.telecharger({ Id: 'film-2', Name: 'Film' });

        expect(store._enAttente.length).toBe(1);
        store.libererTout(false);

        const resultat = await second;
        expect(resultat.ok).toBe(false);
        expect(resultat.raison).toMatch(/déjà/i);

        await premier;
        expect(transferts).toBe(1);
    });

    it('un média déjà stocké est refusé sans transfert', async () => {
        const store = magasinLent();
        const dm = new DownloadManager({ store, auth: authValide() });

        const promesse = dm.telecharger({ Id: 'film-3', Name: 'Film' });
        store.libererTout(true);                 // `existe()` répond « oui »

        const resultat = await promesse;
        expect(resultat).toEqual({ ok: false, raison: 'Déjà téléchargé.' });
        expect(transferts).toBe(0);
    });

    it('deux médias différents partent bien tous les deux', async () => {
        // Le dédoublonnage ne doit pas se transformer en verrou global : la
        // file existe pour enchaîner, pas pour refuser.
        const store = magasinLent();
        const dm = new DownloadManager({ store, auth: authValide() });

        dm.telecharger({ Id: 'film-4', Name: 'A' });
        dm.telecharger({ Id: 'film-5', Name: 'B' });
        store.libererTout(false);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        // Le premier transfert est en cours, le second attend son tour dans la file.
        expect(transferts).toBe(1);
        expect(dm.etat().enAttente.map(t => t.id)).toEqual(['film-5']);
    });
});
