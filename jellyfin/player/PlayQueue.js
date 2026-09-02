/**
 * SpaceHub — File d'attente de lecture
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit relevait l'absence de file d'attente parmi les manques les plus
 * visibles pour un client Jellyfin (§7). L'enchaînement automatique d'épisodes
 * existait déjà dans le lecteur, mais il était figé : il ne savait suivre qu'une
 * seule chose, le prochain épisode de la série en cours. Impossible d'empiler un
 * film après un épisode, de lancer une saison entière, ni de dire « celui-ci
 * ensuite » depuis une affiche.
 *
 * Le modèle est délibérément simple : une liste ordonnée et un curseur. Pas
 * d'historique de navigation, pas d'aléatoire, pas de répétition — ces
 * comportements se construisent au-dessus, mais les mettre ici rendrait le
 * bon fonctionnement de l'enchaînement bien plus difficile à garantir.
 *
 * Deux règles qui expliquent la forme du code :
 *
 *   1. La file NE lit rien. Elle dit ce qui vient ensuite ; c'est le lecteur qui
 *      décide de le lire. Cette séparation permet de manipuler la file quand le
 *      lecteur est fermé, et de tester la file sans DOM ni réseau.
 *
 *   2. L'enchaînement d'épisodes existant reste le comportement par défaut.
 *      La file ne prend la main que si quelqu'un y a mis quelque chose — sinon
 *      elle est vide et le lecteur retombe exactement sur l'ancien chemin.
 */

'use strict';

import Logger from '../../core/Logger.js';

class PlayQueue {
    /**
     * @param {Object} [options]
     * @param {import('../../core/EventBus.js').default} [options.eventBus]
     */
    constructor({ eventBus = null } = {}) {
        this._log = new Logger('PlayQueue');
        this._eventBus = eventBus;
        /** @type {Array<Object>} éléments Jellyfin */
        this._items = [];
        /** Index de l'élément en cours ; -1 quand rien n'est lancé. */
        this._index = -1;
    }

    // ─── Lecture de l'état ───────────────────────────────────────────────────

    /** Élément en cours de lecture, ou null. */
    current() {
        return this._index >= 0 ? this._items[this._index] || null : null;
    }

    /** Élément suivant sans avancer le curseur, ou null s'il n'y en a pas. */
    peekNext() {
        return this._items[this._index + 1] || null;
    }

    peekPrevious() {
        return this._index > 0 ? this._items[this._index - 1] || null : null;
    }

    /** Copie de la file — jamais la liste interne, qui doit rester à nous. */
    items() {
        return this._items.slice();
    }

    get length() { return this._items.length; }

    /** La file pilote-t-elle la lecture ? Faux = comportement historique. */
    isActive() {
        return this._items.length > 0;
    }

    /** Position lisible pour l'interface : « 3 / 12 ». */
    position() {
        return { index: this._index, total: this._items.length };
    }

    // ─── Modification ────────────────────────────────────────────────────────

    /**
     * Remplace toute la file. C'est ce qu'appelle « lire une saison » ou
     * « lire cette collection ».
     * @param {Array<Object>} items
     * @param {number} [startIndex] index de départ dans cette liste
     */
    setQueue(items, startIndex = 0) {
        this._items = (items || []).filter(Boolean);
        this._index = this._items.length ? Math.min(Math.max(startIndex, 0), this._items.length - 1) : -1;
        this._log.info(`File remplacée : ${this._items.length} élément(s), départ à ${this._index}.`);
        this._emit();
        return this.current();
    }

    /**
     * « Lire ensuite » : insère juste après l'élément courant, sans toucher au
     * reste de la file. C'est l'action que les gens attendent quand ils disent
     * « celui-là après ».
     */
    addNext(item) {
        if (!item) return;
        this._retirerDoublon(item);
        const cible = this._index < 0 ? 0 : this._index + 1;
        this._items.splice(cible, 0, item);
        // Insérer avant le curseur n'arrive pas ici, mais si la file était vide
        // le curseur doit désigner l'élément inséré plutôt que rien.
        if (this._index < 0) this._index = 0;
        this._emit();
    }

    /** « Ajouter à la file » : à la fin. */
    addToEnd(item) {
        if (!item) return;
        this._retirerDoublon(item);
        this._items.push(item);
        if (this._index < 0) this._index = 0;
        this._emit();
    }

    /** Retire un élément par son identifiant Jellyfin. */
    remove(itemId) {
        const i = this._items.findIndex(it => this._id(it) === itemId);
        if (i === -1) return;
        this._items.splice(i, 1);
        if (i < this._index) this._index -= 1;
        else if (i === this._index) this._index = Math.min(this._index, this._items.length - 1);
        if (!this._items.length) this._index = -1;
        this._emit();
    }

    clear() {
        this._items = [];
        this._index = -1;
        this._emit();
    }

    // ─── Déplacement du curseur ──────────────────────────────────────────────

    /**
     * Avance et renvoie le nouvel élément courant, ou null si la file est finie.
     * Ne boucle pas : une file qui recommence toute seule surprend plus qu'elle
     * ne rend service.
     */
    next() {
        if (this._index + 1 >= this._items.length) return null;
        this._index += 1;
        this._emit();
        return this.current();
    }

    previous() {
        if (this._index <= 0) return null;
        this._index -= 1;
        this._emit();
        return this.current();
    }

    /** Saute directement à un élément de la file. */
    jumpTo(itemId) {
        const i = this._items.findIndex(it => this._id(it) === itemId);
        if (i === -1) return null;
        this._index = i;
        this._emit();
        return this.current();
    }

    /**
     * Synchronise le curseur quand une lecture démarre par un autre chemin
     * (clic sur une affiche, reprise). Si l'élément est déjà dans la file on s'y
     * cale ; sinon la file devient hors sujet et est vidée — la garder ferait
     * repartir la lecture sur un élément sans rapport à la fin du média.
     */
    syncTo(item) {
        if (!item) return;
        const i = this._items.findIndex(it => this._id(it) === this._id(item));
        if (i !== -1) {
            if (i !== this._index) { this._index = i; this._emit(); }
            return;
        }
        if (this._items.length) {
            this._log.info('Lecture hors file : la file est abandonnée.');
            this.clear();
        }
    }

    // ─── Interne ─────────────────────────────────────────────────────────────

    _id(item) {
        return item?.Id || item?.id || null;
    }

    /** Un même titre ne doit pas apparaître deux fois à la suite d'un ajout. */
    _retirerDoublon(item) {
        const id = this._id(item);
        if (!id) return;
        const i = this._items.findIndex((it, k) => k !== this._index && this._id(it) === id);
        if (i === -1) return;
        this._items.splice(i, 1);
        if (i < this._index) this._index -= 1;
    }

    _emit() {
        this._eventBus?.emit('playqueue:changed', {
            items: this.items(),
            index: this._index,
            current: this.current(),
        });
    }
}

export default PlayQueue;
