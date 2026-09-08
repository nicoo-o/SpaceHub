/**
 * SpaceHub — minuteur de sommeil
 *
 * « Arrêter après cet épisode », « dans 30 minutes ». Absent de l'application,
 * et attendu de tout appareil de salon depuis trente ans.
 *
 * LE DÉTAIL QUI SÉPARE UNE BONNE VERSION D'UNE MAUVAISE
 * -----------------------------------------------------
 * Un minuteur qui coupe net au bout de trente minutes s'arrête au milieu d'une
 * scène. C'est techniquement conforme et pratiquement détestable : la personne
 * qui s'endort devant un film ne veut pas retrouver un écran noir en pleine
 * réplique, elle veut que ça s'arrête PROPREMENT.
 *
 * D'où deux modes, et le second est le défaut sur une série :
 *   — `DUREE`     : arrêt à l'échéance, mais **à la fin du titre en cours si
 *                   elle tombe dans les cinq minutes** — mieux vaut deux ou
 *                   trois minutes de plus qu'une coupure au milieu ;
 *   — `FIN_TITRE` : arrêt à la fin de ce qui joue, quelle que soit la durée.
 *
 * L'AVERTISSEMENT. Une minute avant l'arrêt, on prévient. Sans cela, quelqu'un
 * encore éveillé voit son film s'arrêter sans comprendre pourquoi, et le
 * minuteur passe pour une panne.
 */

'use strict';

import Logger from './Logger.js';

export const Mode = Object.freeze({
    DUREE: 'duree',
    FIN_TITRE: 'fin-titre',
});

/** Durées proposées, en minutes. */
export const DUREES = [15, 30, 45, 60, 90, 120];

/** En deçà, on laisse le titre finir plutôt que de couper. */
export const MARGE_FIN_MS = 5 * 60 * 1000;

/** Délai de l'avertissement avant l'arrêt. */
export const AVERTISSEMENT_MS = 60 * 1000;

export class MinuteurSommeil {
    /**
     * @param {Object} options
     * @param {() => Object|null} options.lecteur   accès paresseux au lecteur
     * @param {Object} [options.toaster]
     * @param {Object} [options.eventBus]
     */
    constructor({ lecteur, toaster = null, eventBus = null } = {}) {
        this._log = new Logger('MinuteurSommeil');
        this._lecteur = lecteur || (() => null);
        this._toaster = toaster;
        this._eventBus = eventBus;

        this._mode = null;
        this._echeanceMs = null;
        this._minuteur = null;
        this._minuteurAvertissement = null;
        this._surFinTitre = null;
    }

    /** `null` quand rien n'est armé. */
    get actif() { return this._mode !== null; }

    /** Millisecondes restantes, ou `null` en mode « fin du titre ». */
    get restantMs() {
        if (this._echeanceMs === null) return null;
        return Math.max(0, this._echeanceMs - Date.now());
    }

    get mode() { return this._mode; }

    /**
     * Arme le minuteur.
     *
     * @param {{mode?: string, minutes?: number}} options
     * @returns {boolean}
     */
    armer({ mode = Mode.DUREE, minutes = 30 } = {}) {
        this.annuler();

        if (mode === Mode.FIN_TITRE) {
            const video = this._lecteur()?._video;
            if (!video) {
                this._dire("Rien ne joue : le minuteur « fin du titre » n'a rien à attendre.");
                return false;
            }
            this._mode = Mode.FIN_TITRE;
            this._echeanceMs = null;
            this._surFinTitre = () => this._arreter('fin du titre');
            video.addEventListener('ended', this._surFinTitre, { once: true });
            this._dire('Arrêt programmé à la fin de ce titre.');
            this._emettre();
            return true;
        }

        const m = Number(minutes);
        if (!Number.isFinite(m) || m <= 0) return false;
        this._mode = Mode.DUREE;
        this._echeanceMs = Date.now() + m * 60 * 1000;

        this._minuteurAvertissement = setTimeout(
            () => this._dire('Arrêt dans une minute. Touchez une touche pour annuler.'),
            Math.max(0, m * 60 * 1000 - AVERTISSEMENT_MS));
        this._minuteur = setTimeout(() => this._echeance(), m * 60 * 1000);

        this._dire(`Arrêt programmé dans ${m} minutes.`);
        this._emettre();
        return true;
    }

    /** Désarme. Sans effet si rien n'était armé. */
    annuler() {
        if (this._minuteur) { clearTimeout(this._minuteur); this._minuteur = null; }
        if (this._minuteurAvertissement) { clearTimeout(this._minuteurAvertissement); this._minuteurAvertissement = null; }
        if (this._surFinTitre) {
            // Retirer l'écouteur même s'il est `once` : un titre qui ne se
            // termine jamais — parce qu'on a fermé le lecteur — laisserait
            // sinon une fermeture vivante sur un élément détaché.
            this._lecteur()?._video?.removeEventListener?.('ended', this._surFinTitre);
            this._surFinTitre = null;
        }
        const etait = this._mode !== null;
        this._mode = null;
        this._echeanceMs = null;
        if (etait) this._emettre();
        return etait;
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    /**
     * L'échéance est atteinte.
     *
     * SI LA FIN DU TITRE EST PROCHE, ON L'ATTEND. Couper à trois minutes de la
     * fin d'un film pour respecter un minuteur à la seconde près est le genre
     * d'exactitude que personne ne demande.
     */
    _echeance() {
        const video = this._lecteur()?._video;
        const restantTitreMs = video && Number.isFinite(video.duration)
            ? Math.max(0, (video.duration - (video.currentTime || 0)) * 1000)
            : null;

        if (restantTitreMs !== null && restantTitreMs > 0 && restantTitreMs <= MARGE_FIN_MS) {
            this._dire('Arrêt à la fin de ce titre, dans quelques minutes.');
            this._mode = Mode.FIN_TITRE;
            this._echeanceMs = null;
            this._surFinTitre = () => this._arreter('fin du titre');
            video.addEventListener('ended', this._surFinTitre, { once: true });
            this._emettre();
            return;
        }
        this._arreter('échéance');
    }

    _arreter(raison) {
        this._log.info(`Arrêt du minuteur de sommeil (${raison}).`);
        this.annuler();
        const lecteur = this._lecteur();
        // On met en PAUSE avant de fermer : fermer d'abord laisserait le son
        // continuer une fraction de seconde sur certains navigateurs.
        try { lecteur?._video?.pause?.(); } catch { /* sans effet */ }
        lecteur?.close?.();
        this._dire('Bonne nuit.');
    }

    _dire(texte) { this._toaster?.show?.(texte, 'info'); }

    _emettre() {
        this._eventBus?.emit?.('sommeil:change', {
            actif: this.actif, mode: this._mode, restantMs: this.restantMs,
        });
    }
}

export default MinuteurSommeil;
