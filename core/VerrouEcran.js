/**
 * SpaceHub — Verrou d'écran pendant la lecture
 *
 * Empêche l'économiseur d'écran et la mise en veille de s'activer pendant
 * qu'une vidéo joue. Sans cela, une lecture sans interaction — c'est-à-dire
 * une lecture normale — finit par déclencher la veille sur PC et sur mobile.
 *
 * LE PIÈGE QUI FAIT ÉCHOUER LA PLUPART DES IMPLÉMENTATIONS
 * -------------------------------------------------------
 * Le verrou est **libéré automatiquement par le navigateur dès que le document
 * devient caché** — changement d'onglet, minimisation, extinction de l'écran.
 * Il ne se rétablit pas tout seul au retour.
 *
 * Une implémentation naïve fonctionne donc parfaitement en test, puis échoue
 * en usage réel dès que l'utilisateur bascule sur une autre fenêtre pendant
 * dix secondes. Ce module écoute `visibilitychange` pour le reprendre.
 *
 * DISPONIBILITÉ. Baseline depuis mars 2025. Chrome 84, Firefox 126, Safari
 * 16.4. Sur téléviseur : à partir des modèles 2022. Les modèles antérieurs
 * n'en ont de toute façon guère besoin — leur système ne met pas l'écran en
 * veille pendant qu'une application joue une vidéo.
 *
 * Le verrou peut être REFUSÉ (batterie faible, mode économie d'énergie) : ce
 * n'est pas une erreur, c'est une décision de l'appareil qu'on respecte.
 */

'use strict';

import Logger from './Logger.js';

export class VerrouEcran {
    constructor() {
        this._log = new Logger('VerrouEcran');
        this._verrou = null;
        this._voulu = false;
        this._onVisibilite = this._onVisibilite.bind(this);
        this._ecoute = false;
    }

    /** Vrai si l'API existe sur cet appareil. */
    get supporte() {
        return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    }

    /** Vrai si un verrou est effectivement tenu à cet instant. */
    get actif() {
        return this._verrou !== null && this._verrou.released === false;
    }

    /**
     * Demande le verrou et le maintient jusqu'à `liberer()`.
     * @returns {Promise<boolean>} Vrai si le verrou est tenu.
     */
    async demander() {
        this._voulu = true;
        if (!this._ecoute && typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this._onVisibilite);
            this._ecoute = true;
        }
        return this._acquerir();
    }

    /** Relâche le verrou et cesse de le reprendre. */
    async liberer() {
        this._voulu = false;
        if (this._ecoute && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._onVisibilite);
            this._ecoute = false;
        }
        const verrou = this._verrou;
        this._verrou = null;
        try { await verrou?.release?.(); } catch { /* déjà relâché : sans effet */ }
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    async _acquerir() {
        if (!this.supporte || !this._voulu) return false;
        if (this.actif) return true;
        try {
            this._verrou = await navigator.wakeLock.request('screen');
            // Le navigateur peut relâcher de son propre chef : on note l'état
            // plutôt que de garder une référence morte qui ferait croire que
            // l'écran est tenu.
            this._verrou.addEventListener?.('release', () => { this._verrou = null; });
            return true;
        } catch (err) {
            // Refus légitime : batterie faible, économie d'énergie. Ne doit
            // jamais interrompre la lecture.
            this._log.debug('Verrou d\'écran refusé :', err?.message || err);
            this._verrou = null;
            return false;
        }
    }

    _onVisibilite() {
        // LA raison d'être de ce module : le navigateur a relâché le verrou en
        // masquant le document, et ne le reprendra pas de lui-même.
        if (this._voulu && document.visibilityState === 'visible') {
            this._acquerir();
        }
    }
}

export default VerrouEcran;
