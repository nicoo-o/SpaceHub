/**
 * SpaceHub — SyncPlay : regarder ensemble
 *
 * CE QUI MANQUAIT, ET QUI NE MANQUE PLUS. Le lecteur, la file d'attente et le
 * canal WebSocket existent tous depuis les vagues précédentes. SyncPlay n'a
 * jamais demandé autre chose que de les relier — et une horloge commune.
 *
 * LE PROBLÈME N'EST PAS « DÉMARRER ENSEMBLE », C'EST « RESTER ENSEMBLE »
 * ---------------------------------------------------------------------
 * Démarrer ensemble est facile : le serveur donne un instant, chacun s'y tient.
 * Ce qui est difficile, c'est la suite : trois appareils qui lisent le même
 * fichier dérivent — décodage plus lent, mise en mémoire tampon, quartz
 * imparfait. Au bout de dix minutes, l'écart se compte en secondes.
 *
 * DEUX CORRECTIONS, ET LEUR FRONTIÈRE EST LE CŒUR DU SUJET
 * --------------------------------------------------------
 * Une dérive faible se rattrape en **changeant la vitesse de lecture** : on lit
 * à 1,02× pendant quelques secondes et l'écart se referme sans que personne ne
 * s'en aperçoive. C'est inaudible tant qu'on reste dans une marge étroite.
 *
 * Au-delà d'un seuil, corriger par la vitesse prendrait trop longtemps : on
 * **saute**. Mais un saut se voit et s'entend, et un saut toutes les dix
 * secondes est insupportable. Le seuil décide donc de tout : trop bas, on
 * saute sans arrêt ; trop haut, on regarde un film désynchronisé d'une seconde.
 *
 * LA GARDE QUE PERSONNE N'ÉCRIT DU PREMIER COUP. Corriger la dérive change
 * `currentTime`, ce qui émet `seeking` puis `seeked` — et un client naïf
 * interprète son PROPRE saut comme une action de l'utilisateur et l'annonce au
 * groupe. Les autres sautent alors, ce qui déclenche chez eux la même
 * annonce : l'oscillation est immédiate et ne s'arrête plus. D'où
 * `_correctionEnCours`.
 */

'use strict';

import Logger from '../../core/Logger.js';
import HorlogeServeur from './HorlogeServeur.js';

/** Un tick Jellyfin vaut 100 ns. */
const TICKS_PAR_SECONDE = 10_000_000;

/**
 * En deçà, on ne fait rien : corriger une dérive de quelques dizaines de
 * millisecondes coûterait plus en va-et-vient qu'elle ne gêne.
 */
export const DERIVE_IGNOREE_MS = 50;

/**
 * Au-delà, on saute au lieu de corriger par la vitesse.
 *
 * 400 ms : c'est à peu près le seuil où un décalage audio devient perceptible
 * sur des enceintes voisines. En dessous, la correction par la vitesse est
 * inaudible et préférable ; au-dessus, elle prendrait plusieurs dizaines de
 * secondes et l'on regarderait un film désynchronisé pendant tout ce temps.
 */
export const SEUIL_SAUT_MS = 400;

/** Bornes de la vitesse de rattrapage. */
export const VITESSE_MIN = 0.8;
export const VITESSE_MAX = 1.2;

/** Cadence de vérification de la dérive. */
export const PERIODE_VERIFICATION_MS = 1000;

export class SyncPlay {
    /**
     * @param {Object} options
     * @param {Object} options.api      client Jellyfin
     * @param {Object} options.socket   SocketJellyfin
     * @param {() => Object|null} options.lecteur
     * @param {Object} [options.toaster]
     * @param {Object} [options.eventBus]
     */
    constructor({ api, socket, lecteur, toaster = null, eventBus = null } = {}) {
        this._log = new Logger('SyncPlay');
        this._api = api || null;
        this._socket = socket || null;
        this._lecteur = lecteur || (() => null);
        this._toaster = toaster;
        this._eventBus = eventBus;

        this._horloge = new HorlogeServeur({ api });
        this._groupe = null;
        this._desabonnements = [];
        this._minuteurDerive = null;
        /** Voir l'en-tête : empêche l'oscillation par auto-annonce. */
        this._correctionEnCours = false;
        /** Position de référence : où l'on DEVRAIT être, et depuis quand. */
        this._reference = null;
        this._enPause = false;
    }

    get groupe() { return this._groupe; }
    get horloge() { return this._horloge; }
    get actif() { return this._groupe !== null; }

    // ─── Groupes ────────────────────────────────────────────────────────────

    /** @returns {Promise<Array>} les groupes disponibles. */
    async lister() {
        try {
            const rep = await this._api?.get?.('/SyncPlay/List');
            return Array.isArray(rep) ? rep : [];
        } catch {
            return [];
        }
    }

    /**
     * Crée un groupe et le rejoint.
     * @param {string} nom
     */
    async creer(nom = 'SpaceHub') {
        return this._appeler('/SyncPlay/New', { GroupName: nom }, `Groupe « ${nom} » créé.`);
    }

    /** Rejoint un groupe existant. */
    async rejoindre(groupId) {
        if (!groupId) return false;
        return this._appeler('/SyncPlay/Join', { GroupId: groupId }, 'Groupe rejoint.');
    }

    /** Quitte le groupe. Idempotent. */
    async quitter() {
        if (!this._groupe) { this._deconnecter(); return true; }
        try { await this._api?.post?.('/SyncPlay/Leave', {}); } catch { /* on se retire quand même */ }
        this._deconnecter();
        this._dire('Groupe quitté.');
        return true;
    }

    // ─── Ordres envoyés au groupe ───────────────────────────────────────────

    async demanderLecture() { return this._api?.post?.('/SyncPlay/Unpause', {}); }
    async demanderPause() { return this._api?.post?.('/SyncPlay/Pause', {}); }

    /** @param {number} secondes */
    async demanderSaut(secondes) {
        return this._api?.post?.('/SyncPlay/Seek', {
            PositionTicks: Math.round(secondes * TICKS_PAR_SECONDE),
        });
    }

    // ─── Ordres reçus ───────────────────────────────────────────────────────

    /**
     * `SyncPlayCommand` : le serveur dit quoi faire, et QUAND.
     *
     * `When` est un horodatage SERVEUR. Le convertir est tout l'intérêt de
     * l'horloge : sans conversion, un appareil dont l'horloge avance de deux
     * secondes démarrerait deux secondes trop tôt, systématiquement.
     */
    _surCommande(data) {
        const commande = data?.Command;
        if (!commande) return;

        const quandLocal = this._horloge.versLocal(data.When);
        const positionS = Number(data.PositionTicks) / TICKS_PAR_SECONDE;
        const attenteMs = quandLocal === null ? 0 : Math.max(0, quandLocal - Date.now());

        this._log.info(`Ordre « ${commande} » dans ${Math.round(attenteMs)} ms.`);

        switch (commande) {
            case 'Play':
            case 'Unpause':
                this._enPause = false;
                this._planifier(attenteMs, () => this._demarrerA(positionS));
                break;
            case 'Pause':
                this._enPause = true;
                this._planifier(attenteMs, () => {
                    this._avecCorrection(() => {
                        const video = this._video();
                        if (!video) return;
                        video.pause();
                        if (Number.isFinite(positionS)) video.currentTime = positionS;
                    });
                    this._reference = null;
                });
                break;
            case 'Seek':
                this._planifier(attenteMs, () => this._demarrerA(positionS, { reprendre: !this._enPause }));
                break;
            case 'Stop':
                this._lecteur()?.close?.();
                this._reference = null;
                break;
            default:
                this._log.info(`Commande SyncPlay ignorée : ${commande}`);
        }
    }

    /** `SyncPlayGroupUpdate` : composition et état du groupe. */
    _surMiseAJour(data) {
        const type = data?.Type;
        if (type === 'GroupLeft' || type === 'NotInGroup') { this._deconnecter(); return; }
        if (data?.GroupId) this._groupe = { id: data.GroupId, ...(data.Data || {}) };
        this._eventBus?.emit?.('syncplay:groupe', { type, groupe: this._groupe });
        if (type === 'UserJoined') this._dire(`${data?.Data || 'Quelqu\'un'} a rejoint le groupe.`);
        if (type === 'UserLeft') this._dire(`${data?.Data || 'Quelqu\'un'} a quitté le groupe.`);
    }

    // ─── Dérive ─────────────────────────────────────────────────────────────

    /**
     * Compare où l'on est à où l'on devrait être, et corrige.
     *
     * @returns {{deriveMs: number, action: 'rien'|'vitesse'|'saut'}|null}
     */
    verifierDerive() {
        const video = this._video();
        if (!video || !this._reference || this._enPause || video.paused) return null;

        const attendueS = this._reference.positionS
            + (this._horloge.maintenantServeur() - this._reference.instantServeur) / 1000;
        const deriveMs = (video.currentTime - attendueS) * 1000;
        const ampleur = Math.abs(deriveMs);

        if (ampleur < DERIVE_IGNOREE_MS) {
            this._retablirVitesse();
            return { deriveMs, action: 'rien' };
        }

        if (ampleur > SEUIL_SAUT_MS) {
            this._retablirVitesse();
            this._avecCorrection(() => { video.currentTime = attendueS; });
            this._log.info(`Saut de rattrapage : ${Math.round(deriveMs)} ms.`);
            return { deriveMs, action: 'saut' };
        }

        // Correction douce. On est EN AVANCE si la dérive est positive : il
        // faut donc ralentir, et non accélérer — l'inverse est l'erreur de
        // signe classique, et elle DOUBLE l'écart au lieu de le réduire.
        const facteur = deriveMs > 0 ? -1 : 1;
        // Refermer l'écart en environ cinq secondes : plus vite s'entend.
        const correction = facteur * Math.min(0.2, ampleur / 5000);
        video.playbackRate = Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, 1 + correction));
        return { deriveMs, action: 'vitesse' };
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _video() { return this._lecteur()?._video || null; }

    _demarrerA(positionS, { reprendre = true } = {}) {
        const video = this._video();
        if (!video) return;
        this._avecCorrection(() => {
            if (Number.isFinite(positionS)) video.currentTime = positionS;
            if (reprendre) video.play?.()?.catch?.(() => {});
        });
        this._reference = {
            positionS: Number.isFinite(positionS) ? positionS : (video.currentTime || 0),
            instantServeur: this._horloge.maintenantServeur(),
        };
    }

    /**
     * Exécute une correction en signalant qu'elle vient de NOUS.
     *
     * Sans ce drapeau, l'écouteur `seeked` du lecteur annoncerait notre propre
     * rattrapage au groupe ; les autres sauteraient, annonceraient à leur tour,
     * et l'oscillation ne s'arrêterait plus.
     */
    _avecCorrection(action) {
        this._correctionEnCours = true;
        try { action(); } finally {
            // On relâche au tour suivant : `seeked` arrive de façon asynchrone.
            setTimeout(() => { this._correctionEnCours = false; }, 0);
        }
    }

    /** Vrai si le saut en cours vient de nous : l'appelant ne doit rien annoncer. */
    estCorrectionInterne() { return this._correctionEnCours; }

    _retablirVitesse() {
        const video = this._video();
        if (video && video.playbackRate !== 1) video.playbackRate = 1;
    }

    _planifier(delaiMs, action) {
        if (delaiMs <= 0) { action(); return; }
        setTimeout(action, delaiMs);
    }

    async _appeler(chemin, corps, messageSucces) {
        if (!this._api?.post) return false;
        try {
            await this._api.post(chemin, corps);
            this._connecter();
            this._dire(messageSucces);
            return true;
        } catch (err) {
            this._dire(`SyncPlay : ${err?.message || 'échec'}`, 'error');
            return false;
        }
    }

    _connecter() {
        if (this._desabonnements.length) return;
        // L'horloge d'abord : un ordre qui arrive avant la première mesure
        // serait appliqué avec un décalage nul, donc faux.
        this._horloge.demarrer();
        this._desabonnements = [
            this._socket?.sur?.('SyncPlayCommand', (d) => this._surCommande(d)) || (() => {}),
            this._socket?.sur?.('SyncPlayGroupUpdate', (d) => this._surMiseAJour(d)) || (() => {}),
        ];
        this._minuteurDerive = setInterval(() => this.verifierDerive(), PERIODE_VERIFICATION_MS);
        this._groupe = this._groupe || { id: null };
    }

    _deconnecter() {
        for (const retirer of this._desabonnements) { try { retirer(); } catch { /* sans effet */ } }
        this._desabonnements = [];
        if (this._minuteurDerive) { clearInterval(this._minuteurDerive); this._minuteurDerive = null; }
        this._horloge.arreter();
        this._retablirVitesse();
        this._groupe = null;
        this._reference = null;
        this._enPause = false;
    }

    _dire(texte, type = 'info') { this._toaster?.show?.(texte, type); }
}

export default SyncPlay;
