/**
 * SpaceHub — Virtualisation d'une rangée horizontale
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * `content-visibility: auto` (posé sur les sections du tableau de bord) évite
 * au navigateur de METTRE EN PAGE ce qui est hors écran. Il ne réduit pas le
 * nombre de nœuds : les cartes existent toutes dans le DOM, avec leurs
 * attributs, leurs écouteurs et leurs images. Sur un téléviseur d'entrée de
 * gamme — environ 500 Mo de mémoire pour tout le système — une médiathèque de
 * plusieurs centaines de titres finit par saturer, quelle que soit la
 * discipline de rendu.
 *
 * Ce module ne rend que la fenêtre visible, plus une marge, et remplace le
 * reste par deux cales de largeur équivalente.
 *
 * LA CONTRAINTE QUI DÉCIDE DE TOUT : LA NAVIGATION AU CLAVIER
 * ----------------------------------------------------------
 * Une virtualisation naïve casse la navigation directionnelle. Le moteur
 * spatial cherche sa cible parmi les éléments PRÉSENTS dans le DOM : si la
 * carte suivante n'y est pas encore, la flèche droite ne trouve rien et le
 * focus s'arrête net, au milieu de la rangée, sans que rien ne l'explique.
 * C'est précisément le genre de régression que ce projet a déjà payée.
 *
 * Trois protections, dans cet ordre d'importance :
 *
 *   1. **Marge généreuse.** On rend MARGE cartes de plus de chaque côté. Une
 *      pression de touche déplace le focus d'une carte ; il en faudrait
 *      MARGE d'affilée entre deux images pour sortir de la fenêtre.
 *   2. **Extension sur focus.** Dès que le focus atteint une carte proche du
 *      bord rendu, on étend immédiatement — sans attendre l'événement de
 *      défilement, qui arrive après le déplacement du focus, pas avant.
 *   3. **Seuil d'activation.** En dessous de SEUIL cartes, on ne virtualise
 *      pas du tout : le gain serait nul et le risque, lui, réel.
 *
 * Le module ne connaît pas les cartes : il reçoit une fonction qui en
 * fabrique une à partir d'un indice. Il ne sait rien non plus du moteur de
 * navigation — il se contente de ne jamais lui retirer le sol sous les pieds.
 */

'use strict';

/** En dessous de ce nombre de cartes, on ne virtualise pas. */
export const SEUIL_VIRTUALISATION = 60;

/** Cartes rendues au-delà de la zone visible, de chaque côté. */
export const MARGE = 12;

/**
 * Distance au bord rendu, en cartes, à partir de laquelle un focus déclenche
 * une extension immédiate.
 */
const MARGE_FOCUS = 4;

export class VirtualisationRangee {
    /**
     * @param {HTMLElement} conteneur     La rangée (défilement horizontal).
     * @param {number} nombre             Nombre total de cartes.
     * @param {(indice: number) => HTMLElement} fabriquer  Construit la carte n°indice.
     */
    constructor(conteneur, nombre, fabriquer) {
        this._conteneur = conteneur;
        this._nombre = nombre;
        this._fabriquer = fabriquer;
        this._debut = 0;
        this._fin = 0;
        this._largeurCarte = 0;
        this._detruit = false;
        this._rafEnCours = 0;
        /**
         * Garde de réentrance.
         *
         * `_appliquer` rend le focus à la carte qu'il vient de déplacer. Or
         * `focus()` émet `focusin`, que ce module écoute pour étendre la
         * fenêtre — laquelle rappelle `_appliquer`, qui redonne le focus, et
         * ainsi de suite jusqu'à « Maximum call stack size exceeded ». Sur un
         * téléviseur, cela ne produit pas une trace dans une console : cela
         * fige l'application.
         */
        this._enCours = false;

        this._caleAvant = document.createElement('div');
        this._caleAvant.className = 'sh-rangee-cale';
        this._caleAvant.setAttribute('aria-hidden', 'true');
        this._caleApres = this._caleAvant.cloneNode();

        this._onDefilement = this._onDefilement.bind(this);
        this._onFocus = this._onFocus.bind(this);
    }

    /**
     * Rend la première fenêtre et branche les écouteurs.
     * @returns {boolean} vrai si la virtualisation est active.
     */
    demarrer() {
        if (this._nombre <= SEUIL_VIRTUALISATION) return false;

        // La largeur d'une carte n'est pas connue à l'avance : elle dépend du
        // gabarit et de la feuille de style. On en rend une pour la mesurer,
        // puis on calcule la fenêtre à partir de cette mesure.
        const sonde = this._fabriquer(0);
        this._conteneur.appendChild(sonde);
        const rect = sonde.getBoundingClientRect();
        const ecart = parseFloat(getComputedStyle(this._conteneur).gap) || 0;
        this._largeurCarte = (rect.width || 180) + ecart;
        sonde.remove();

        this._conteneur.appendChild(this._caleAvant);
        this._conteneur.appendChild(this._caleApres);
        this._conteneur.addEventListener('scroll', this._onDefilement, { passive: true });
        // `focusin` remonte, contrairement à `focus` : un seul écouteur suffit.
        this._conteneur.addEventListener('focusin', this._onFocus);

        this._appliquer(this._fenetreVisible());
        return true;
    }

    /** Retire les écouteurs. Idempotent. */
    detruire() {
        if (this._detruit) return;
        this._detruit = true;
        if (this._rafEnCours) cancelAnimationFrame(this._rafEnCours);
        this._conteneur.removeEventListener('scroll', this._onDefilement);
        this._conteneur.removeEventListener('focusin', this._onFocus);
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    /** @returns {{ debut: number, fin: number }} La fenêtre à rendre. */
    _fenetreVisible() {
        const largeur = this._largeurCarte || 1;
        const gauche = this._conteneur.scrollLeft;
        const visible = this._conteneur.clientWidth || 0;
        const premier = Math.floor(gauche / largeur);
        const dernier = Math.ceil((gauche + visible) / largeur);
        return {
            debut: Math.max(0, premier - MARGE),
            fin: Math.min(this._nombre, dernier + MARGE),
        };
    }

    _onDefilement() {
        if (this._detruit || this._rafEnCours) return;
        // Un événement `scroll` peut arriver à chaque image : on regroupe.
        this._rafEnCours = requestAnimationFrame(() => {
            this._rafEnCours = 0;
            if (!this._detruit) this._appliquer(this._fenetreVisible());
        });
    }

    /**
     * Étend la fenêtre quand le focus approche d'un bord rendu.
     *
     * C'est la protection qui compte pour la télécommande. L'événement de
     * défilement arrive APRÈS que le navigateur a fait défiler pour montrer
     * l'élément focalisé — donc après que le moteur a cherché sa cible. Sans
     * cet écouteur, il existe une fenêtre où la carte suivante n'est pas
     * encore là, et la flèche ne trouve rien.
     */
    _onFocus(evenement) {
        if (this._detruit || this._enCours) return;
        const carte = evenement.target?.closest?.('[data-indice-rangee]');
        if (!carte) return;
        const indice = Number(carte.dataset.indiceRangee);
        if (!Number.isFinite(indice)) return;

        if (indice - this._debut < MARGE_FOCUS || this._fin - indice <= MARGE_FOCUS) {
            this._appliquer({
                debut: Math.max(0, indice - MARGE - MARGE_FOCUS),
                fin: Math.min(this._nombre, indice + MARGE + MARGE_FOCUS + 1),
            });
        }
    }

    /**
     * Rend la fenêtre demandée, en ne touchant que la différence.
     *
     * On ne reconstruit jamais la rangée entière : détruire puis recréer la
     * carte focalisée lui ferait perdre le focus — la quatrième classe de
     * bogue de focus décrite par Netflix, « l'élément focalisé disparaît et
     * personne ne reprend le focus ».
     *
     * @param {{ debut: number, fin: number }} fenetre
     */
    _appliquer({ debut, fin }) {
        if (debut === this._debut && fin === this._fin) return;
        if (this._enCours) return;
        this._enCours = true;
        try {
            this._appliquerVraiment(debut, fin);
        } finally {
            this._enCours = false;
        }
    }

    /** Corps de `_appliquer`, sous garde de réentrance. */
    _appliquerVraiment(debut, fin) {

        // Retirer ce qui sort de la fenêtre — jamais l'élément focalisé.
        const actif = document.activeElement;
        for (const carte of [...this._conteneur.querySelectorAll('[data-indice-rangee]')]) {
            const i = Number(carte.dataset.indiceRangee);
            if (i >= debut && i < fin) continue;
            if (carte.contains(actif)) continue;   // on ne scie pas la branche
            carte.remove();
        }

        // Ajouter ce qui entre, dans l'ordre.
        const presents = new Set(
            [...this._conteneur.querySelectorAll('[data-indice-rangee]')]
                .map(c => Number(c.dataset.indiceRangee)));
        const fragment = document.createDocumentFragment();
        for (let i = debut; i < fin; i++) {
            if (presents.has(i)) continue;
            const carte = this._fabriquer(i);
            carte.dataset.indiceRangee = String(i);
            fragment.appendChild(carte);
        }
        this._conteneur.insertBefore(fragment, this._caleApres);

        // Réordonner : les ajouts partiels peuvent désordonner la rangée, et
        // l'ordre du DOM est ce qui décide de la navigation par tabulation.
        //
        // ATTENTION — `insertBefore` sur un élément qui porte le focus le lui
        // RETIRE : déplacer un nœud le détache puis le rattache, et le
        // navigateur repose le focus sur `<body>`. Garder la carte dans le
        // DOM ne suffit donc pas ; il faut lui rendre le focus après coup.
        // C'est la même classe de défaut que la suppression pure et simple :
        // l'élément focalisé disparaît et personne ne reprend le focus.
        const avaitFocus = this._conteneur.contains(document.activeElement)
            ? document.activeElement : null;

        const cartes = [...this._conteneur.querySelectorAll('[data-indice-rangee]')]
            .sort((a, b) => Number(a.dataset.indiceRangee) - Number(b.dataset.indiceRangee));
        for (const carte of cartes) this._conteneur.insertBefore(carte, this._caleApres);

        if (avaitFocus && document.activeElement !== avaitFocus
            && this._conteneur.contains(avaitFocus)) {
            // `preventScroll` : rendre le focus ne doit pas ramener la rangée
            // en arrière alors que l'utilisateur vient de la faire défiler.
            avaitFocus.focus({ preventScroll: true });
        }

        // Les cales tiennent la place de ce qui n'est pas rendu, pour que la
        // barre de défilement et la position ne sautent pas.
        this._caleAvant.style.flex = `0 0 ${debut * this._largeurCarte}px`;
        this._caleApres.style.flex = `0 0 ${(this._nombre - fin) * this._largeurCarte}px`;
        this._conteneur.insertBefore(this._caleAvant, this._conteneur.firstChild);
        this._conteneur.appendChild(this._caleApres);

        this._debut = debut;
        this._fin = fin;
    }
}

export default VirtualisationRangee;
