/**
 * SpaceHub — Paroles synchronisées
 *
 * Jellyfin 10.11 sert `GET /Audio/{id}/Lyrics` avec, quand le fichier est en
 * ELRC, un découpage AU MOT. C'est le genre de fonctionnalité qui distingue un
 * client soigné — et personne ne la fait bien sur téléviseur.
 *
 * LA FORME EXACTE DE LA RÉPONSE
 * -----------------------------
 *   { Lyrics: [ { Text, Start, End, Cues: [ { Start, End, Position } ] } ] }
 *
 * Trois choses s'y trompent systématiquement :
 *
 * 1. **`Position` est un indice de CARACTÈRE dans la ligne**, pas un mot, pas
 *    un indice de mot. Découper la ligne sur les espaces et apparier avec
 *    `Cues` donne un décalage dès qu'il y a une virgule, une apostrophe ou
 *    deux espaces. On tranche donc `Text` aux positions annoncées : le
 *    segment i va de `Cues[i].Position` à `Cues[i+1].Position`.
 *
 * 2. **Les temps sont en ticks de 100 ns.** Les comparer à `currentTime`, qui
 *    est en secondes, place tout à la fin du morceau. Sans erreur : les
 *    paroles restent simplement figées sur la dernière ligne.
 *
 * 3. **`End` peut être nul**, en particulier pour le dernier repère. Une
 *    comparaison `t < End` y devient fausse et le dernier mot ne s'allume
 *    jamais. On ne se sert donc de `End` que quand il existe, et on borne par
 *    le début du repère suivant sinon.
 *
 * CE MODULE NE DESSINE RIEN. Il répond à deux questions — quelle ligne, quel
 * mot — et laisse l'affichage à l'écran de musique. C'est ce qui permet de le
 * tester sans DOM, et de le vérifier sur des temps que l'on choisit.
 */

'use strict';

import Logger from '../../core/Logger.js';

/** Un tick Jellyfin vaut 100 ns. */
export const TICKS_PAR_SECONDE = 10_000_000;

export class Paroles {
    /**
     * @param {Object} options
     * @param {Object} options.api  client Jellyfin
     */
    constructor({ api, repli = null } = {}) {
        this._log = new Logger('Paroles');
        this._api = api || null;
        /**
         * Repli quand le serveur n'a rien : une fonction
         * `(morceau) => Promise<lignes|null>`, au MÊME format que le serveur
         * (temps en ticks). Posée par un greffon.
         *
         * La plupart des fichiers ne portent pas de paroles ; sans repli,
         * l'écran de musique affiche « pas de paroles » pour l'essentiel d'une
         * médiathèque.
         */
        this._repli = typeof repli === 'function' ? repli : null;
        /** @type {Array<{texte: string, debut: number, fin: number|null, segments: Array}>} */
        this._lignes = [];
        this._itemId = null;
        /** Dernière ligne trouvée : la lecture avance, on repart de là. */
        this._dernierIndex = -1;
    }

    /** Vrai s'il y a des paroles exploitables. */
    get disponibles() { return this._lignes.length > 0; }

    /** Vrai si au moins une ligne porte un découpage au mot. */
    get auMot() { return this._lignes.some(l => l.segments.length > 1); }

    /** @returns {Array} les lignes normalisées, en secondes. */
    lignes() { return this._lignes; }

    /**
     * Charge les paroles d'un morceau.
     *
     * @param {string} itemId
     * @returns {Promise<boolean>} vrai si des paroles ont été trouvées. Une
     *   absence n'est PAS une erreur : la plupart des morceaux n'en ont pas, et
     *   le serveur répond alors 404.
     */
    /**
     * Pose le repli utilisé quand le serveur n'a pas de paroles.
     * @param {((morceau: object) => Promise<Array|null>)|null} fn
     */
    definirRepli(fn) { this._repli = typeof fn === 'function' ? fn : null; }

    /**
     * Charge les paroles d'un morceau.
     *
     * @param {string|object} morceau  l'identifiant, ou la fiche complète —
     *   le repli a besoin du titre, de l'artiste et de la durée, qu'un
     *   identifiant seul ne porte pas.
     * @returns {Promise<boolean>} vrai si des paroles ont été trouvées.
     */
    async charger(morceau) {
        this.reinitialiser();
        const fiche = (morceau && typeof morceau === 'object') ? morceau : null;
        const itemId = fiche ? (fiche.Id || fiche.id) : morceau;
        if (!itemId) return false;
        this._itemId = itemId;

        if (this._api) {
            try {
                const rep = await this._api.get(`/Audio/${encodeURIComponent(itemId)}/Lyrics`);
                this._lignes = this._normaliser(rep?.Lyrics);
                if (this.disponibles) return true;
            } catch {
                // 404 = pas de paroles sur le serveur. C'est le cas courant, et
                // c'est précisément là que le repli sert.
            }
        }

        if (!this._repli || !fiche) return false;
        try {
            const lignes = await this._repli(fiche);
            // Le morceau a pu changer pendant la requête : sans cette
            // vérification, on afficherait les paroles du précédent.
            if (this._itemId !== itemId) return false;
            this._lignes = this._normaliser(lignes);
            if (this.disponibles) this._log.info('Paroles trouvées par le repli.');
            return this.disponibles;
        } catch {
            return false;
        }
    }

    /** Oublie tout : appelé au changement de morceau. */
    reinitialiser() {
        this._lignes = [];
        this._itemId = null;
        this._dernierIndex = -1;
    }

    /**
     * Quelle ligne est chantée à cet instant ?
     *
     * @param {number} secondes  position de lecture.
     * @returns {number} indice de la ligne, ou -1 avant la première.
     */
    ligneA(secondes) {
        const t = Number(secondes);
        if (!this._lignes.length || !Number.isFinite(t)) return -1;

        // La lecture avance : neuf fois sur dix la réponse est la ligne courante
        // ou la suivante. On ne rebalaye tout que sur un saut.
        const i = this._dernierIndex;
        if (i >= 0 && this._contient(i, t)) return i;
        if (i + 1 < this._lignes.length && this._contient(i + 1, t)) {
            this._dernierIndex = i + 1;
            return i + 1;
        }

        let trouve = -1;
        for (let k = 0; k < this._lignes.length; k += 1) {
            if (this._lignes[k].debut <= t) trouve = k; else break;
        }
        // Une ligne dont la fin est passée n'est plus la ligne courante.
        if (trouve >= 0 && !this._contient(trouve, t)) trouve = -1;
        this._dernierIndex = trouve;
        return trouve;
    }

    /**
     * Combien de caractères de la ligne sont déjà chantés ?
     *
     * On renvoie une longueur en caractères plutôt qu'un indice de mot : c'est
     * ce dont l'affichage a besoin pour allumer exactement ce qui a été chanté,
     * et c'est directement ce que `Position` décrit.
     *
     * @param {number} indexLigne
     * @param {number} secondes
     * @returns {number} nombre de caractères révélés, 0 si rien, -1 si la ligne
     *   n'a pas de découpage au mot (l'affichage l'allume alors entière).
     */
    caracteresChantes(indexLigne, secondes) {
        const ligne = this._lignes[indexLigne];
        if (!ligne) return 0;
        if (ligne.segments.length <= 1) return -1;

        const t = Number(secondes);
        if (!Number.isFinite(t)) return 0;

        let reveles = 0;
        for (const seg of ligne.segments) {
            if (t < seg.debut) break;
            // `fin` est nulle pour le dernier repère : on la remplace alors par
            // la fin de la ligne, jamais par « jamais ».
            reveles = seg.finTexte;
        }
        return reveles;
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _contient(i, t) {
        const ligne = this._lignes[i];
        if (!ligne) return false;
        if (t < ligne.debut) return false;
        const suivante = this._lignes[i + 1];
        // La fin d'une ligne, c'est son `End` s'il existe, sinon le début de la
        // suivante, sinon jamais (dernière ligne d'un morceau).
        const fin = ligne.fin ?? suivante?.debut ?? Infinity;
        return t < fin;
    }

    /**
     * Transforme la réponse serveur en quelque chose d'exploitable :
     * secondes plutôt que ticks, segments de texte plutôt qu'indices nus.
     */
    _normaliser(brutes) {
        if (!Array.isArray(brutes)) return [];
        const lignes = brutes
            .map((l) => {
                const texte = typeof l?.Text === 'string' ? l.Text : '';
                const debut = this._secondes(l?.Start);
                if (debut === null) return null;   // sans temps, on ne peut rien caler
                return {
                    texte,
                    debut,
                    fin: this._secondes(l?.End),
                    segments: this._segments(texte, l?.Cues, debut),
                };
            })
            .filter(Boolean);
        // Le serveur les donne dans l'ordre, mais un fichier LRC bricolé à la
        // main ne le garantit pas — et une liste désordonnée fait sauter les
        // paroles en avant et en arrière.
        lignes.sort((a, b) => a.debut - b.debut);
        return lignes;
    }

    /**
     * Découpe le texte aux positions annoncées.
     *
     * @returns {Array<{debut: number, debutTexte: number, finTexte: number}>}
     *   les bornes de caractères de ce repère dans la ligne. L'affichage y
     *   découpe ses `<span>` UNE FOIS, puis ne change plus qu'une couleur.
     */
    _segments(texte, cues, debutLigne) {
        if (!Array.isArray(cues) || cues.length === 0) {
            return [{ debut: debutLigne, debutTexte: 0, finTexte: texte.length }];
        }
        const propres = cues
            .map(c => ({ debut: this._secondes(c?.Start), position: Number(c?.Position) }))
            .filter(c => c.debut !== null && Number.isFinite(c.position))
            .sort((a, b) => a.position - b.position);

        if (!propres.length) return [{ debut: debutLigne, debutTexte: 0, finTexte: texte.length }];

        const segments = propres.map((c, i) => ({
            debut: c.debut,
            debutTexte: Math.min(Math.max(c.position, 0), texte.length),
            // Ce repère révèle jusqu'au DÉBUT du suivant — pas jusqu'au sien.
            finTexte: i + 1 < propres.length
                ? Math.min(propres[i + 1].position, texte.length)
                : texte.length,
        }));
        // Du texte AVANT le premier repère : un fichier ELRC peut commencer
        // par une parenthèse non minutée. Sans ce segment d'appoint, ces
        // caractères ne seraient jamais rendus et la ligne serait tronquée.
        if (segments[0].debutTexte > 0) {
            segments.unshift({ debut: debutLigne, debutTexte: 0, finTexte: segments[0].debutTexte });
        }
        return segments;
    }

    /** Ticks → secondes. `null` si la valeur n'est pas exploitable. */
    _secondes(ticks) {
        const n = Number(ticks);
        if (!Number.isFinite(n)) return null;
        return n / TICKS_PAR_SECONDE;
    }
}

export default Paroles;
