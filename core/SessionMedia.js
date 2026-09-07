/**
 * SpaceHub — Session média système (Media Session API)
 *
 * Publie le titre en cours auprès du système d'exploitation : centre de
 * contrôle macOS, notification Android, écran de verrouillage iOS, tuile
 * multimédia Windows, casque Bluetooth. Sans cela, l'appui sur « pause » du
 * casque ne fait rien, et la notification affiche « spacehub.local » à la
 * place du film.
 *
 * PORTÉE. PC et mobile. Sur téléviseur, ce n'est ni disponible ni utile — la
 * télécommande passe par `TelecommandeTv.js`. Les deux chemins convergent sur
 * `_executerActionMedia()` du lecteur : une seule implémentation des actions,
 * deux sources d'événements.
 *
 * TROIS PIÈGES QUI CASSENT LES IMPLÉMENTATIONS NAÏVES
 * ---------------------------------------------------
 * 1. `setActionHandler` **lève une TypeError** pour une action que le
 *    navigateur ne connaît pas. Une boucle sans `try` par action s'interrompt
 *    à la première inconnue : toutes les suivantes ne sont jamais posées. On
 *    protège donc CHAQUE action, pas la boucle.
 *
 * 2. `setPositionState` **lève une TypeError** si la durée n'est pas un nombre
 *    fini (direct : `duration === Infinity`), si la position dépasse la durée
 *    (arrondi de fin de fichier), ou si la vitesse est nulle ou négative.
 *    C'est le cas classique du direct, où l'appel jette à chaque seconde.
 *
 * 3. Les gestionnaires **survivent à la fermeture du lecteur**. Si on ne les
 *    remet pas à `null`, la notification système reste, et « lecture » appelle
 *    un lecteur détruit. On libère explicitement.
 *
 * VIGNETTES. Les plateformes ne choisissent pas toutes la meilleure taille :
 * certaines prennent la première utilisable. On déclare donc les tailles en
 * ordre croissant, la plus petite d'abord.
 */

'use strict';

import Logger from './Logger.js';

/** Tailles déclarées, croissantes : voir la note sur les vignettes ci-dessus. */
export const TAILLES_VIGNETTE = [96, 128, 256, 512];

export class SessionMedia {
    constructor() {
        this._log = new Logger('SessionMedia');
        this._actions = [];
    }

    /** Vrai si l'API existe sur cet appareil. */
    get supporte() {
        return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
    }

    get _session() {
        return this.supporte ? navigator.mediaSession : null;
    }

    /**
     * Décrit le média en cours pour le système.
     * @param {{titre?: string, sousTitre?: string, album?: string, vignette?: string}} infos
     */
    decrire({ titre = '', sousTitre = '', album = '', vignette = '' } = {}) {
        const session = this._session;
        if (!session) return false;
        if (typeof MediaMetadata === 'undefined') return false;
        try {
            session.metadata = new MediaMetadata({
                title: String(titre || 'Lecture'),
                artist: String(sousTitre || ''),
                album: String(album || 'SpaceHub'),
                artwork: this._vignettes(vignette),
            });
            return true;
        } catch (err) {
            this._log.warn('Métadonnées système refusées :', err?.message || err);
            return false;
        }
    }

    /**
     * @param {'playing'|'paused'|'none'} etat
     */
    etat(etat) {
        const session = this._session;
        if (!session) return false;
        try {
            session.playbackState = etat;
            return true;
        } catch { return false; }
    }

    /**
     * Publie la position pour la barre de progression système.
     *
     * Refuse silencieusement plutôt que de laisser jeter : voir le piège 2.
     * @param {{duree?: number, position?: number, vitesse?: number}} infos
     */
    position({ duree, position = 0, vitesse = 1 } = {}) {
        const session = this._session;
        if (!session || typeof session.setPositionState !== 'function') return false;

        const d = Number(duree);
        const p = Number(position);
        const v = Number(vitesse);
        // Direct, métadonnées absentes, fichier en cours d'analyse : pas de durée
        // fiable. On EFFACE l'état plutôt que de publier un chiffre faux.
        if (!Number.isFinite(d) || d <= 0) {
            try { session.setPositionState(); } catch { /* sans effet */ }
            return false;
        }
        const positionSure = Math.min(Math.max(Number.isFinite(p) ? p : 0, 0), d);
        const vitesseSure = Number.isFinite(v) && v > 0 ? v : 1;
        try {
            session.setPositionState({ duration: d, position: positionSure, playbackRate: vitesseSure });
            return true;
        } catch (err) {
            this._log.warn('Position système refusée :', err?.message || err);
            return false;
        }
    }

    /**
     * Pose les gestionnaires d'actions système.
     *
     * @param {Record<string, Function>} gestionnaires  clé = action Media Session.
     * @returns {string[]} les actions effectivement acceptées par ce navigateur.
     */
    brancher(gestionnaires = {}) {
        const session = this._session;
        if (!session || typeof session.setActionHandler !== 'function') return [];

        const acceptees = [];
        for (const [action, fn] of Object.entries(gestionnaires)) {
            if (typeof fn !== 'function') continue;
            // Piège 1 : un `try` PAR action. Une action inconnue ne doit pas
            // empêcher les suivantes d'être posées.
            try {
                session.setActionHandler(action, fn);
                acceptees.push(action);
            } catch {
                // Action non supportée ici : ce n'est pas une erreur, c'est une
                // plateforme qui n'a pas ce bouton.
            }
        }
        this._actions = acceptees;
        return acceptees;
    }

    /** Retire les gestionnaires et efface la fiche système. */
    liberer() {
        const session = this._session;
        if (!session) return;
        for (const action of this._actions) {
            try { session.setActionHandler(action, null); } catch { /* sans effet */ }
        }
        this._actions = [];
        try { session.metadata = null; } catch { /* sans effet */ }
        try { session.playbackState = 'none'; } catch { /* sans effet */ }
        try { session.setPositionState?.(); } catch { /* sans effet */ }
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _vignettes(url) {
        if (!url) return [];
        return TAILLES_VIGNETTE.map((taille) => ({
            src: this._redimensionner(url, taille),
            sizes: `${taille}x${taille}`,
            type: 'image/jpeg',
        }));
    }

    /**
     * Les URL d'images Jellyfin portent la taille en paramètre : on la remplace
     * plutôt que de servir quatre fois la même image en pleine résolution, ce
     * qui ferait télécharger quatre fois 300 Ko pour une vignette de 96 px.
     */
    _redimensionner(url, taille) {
        try {
            const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/');
            u.searchParams.set('maxWidth', String(taille));
            u.searchParams.set('maxHeight', String(taille));
            return u.toString();
        } catch {
            return url;
        }
    }
}

export default SessionMedia;
