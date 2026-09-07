/**
 * SpaceHub — Écran de musique plein cadre
 *
 * POURQUOI CET ÉCRAN EXISTE. C'est le plus gros angle mort de l'écosystème :
 * Streamyfin annonce explicitement ne pas gérer la musique et ne pas prévoir de
 * le faire ; Findroid non plus. Un client de téléviseur avec un vrai mode
 * musique n'a quasiment pas de concurrence — et l'usage est évident : la
 * pochette en grand, le fond flouté, les paroles au centre.
 *
 * LE COÛT SUR UN TÉLÉVISEUR FAIBLE, ET COMMENT ON L'ÉVITE
 * -------------------------------------------------------
 * Un karaoké naïf anime `background-clip: text` avec un dégradé mobile. Sur un
 * téléviseur de 2020, cela repeint la ligne entière à chaque image : le
 * compositeur ne peut pas mettre le texte en cache, et l'animation tombe à
 * quelques images par seconde pendant que le son continue — l'effet exact
 * qu'on cherchait à produire, à l'envers.
 *
 * Ici, chaque repère de mot reçoit **un `<span>` posé une seule fois**. La
 * boucle d'animation ne fait qu'ajouter ou retirer une classe : aucune mise en
 * page, aucun changement de texte, aucun nœud créé pendant la lecture. C'est la
 * seule forme qui tienne les 60 images par seconde sur ce matériel.
 *
 * LA BOUCLE. `requestAnimationFrame` plutôt qu'un `setInterval` : elle
 * s'interrompt d'elle-même quand l'onglet passe en arrière-plan, là où un
 * intervalle continuerait de tourner pour un écran que personne ne regarde.
 * Elle sort aussi dès que rien n'a changé depuis l'image précédente.
 */

'use strict';

import Logger from '../../core/Logger.js';
import './EcranMusique.css';

/** Lignes visibles de part et d'autre de la ligne courante. */
export const LIGNES_AUTOUR = 3;

export class EcranMusique {
    /**
     * @param {Object} options
     * @param {Object} options.paroles   instance de Paroles
     * @param {Object} options.api       client Jellyfin, pour les pochettes
     * @param {() => HTMLMediaElement|null} options.media  l'élément qui joue
     * @param {() => HTMLElement|null} [options.hote]  où se monter.
     */
    constructor({ paroles, api, media, hote = null } = {}) {
        this._log = new Logger('EcranMusique');
        this._paroles = paroles || null;
        this._api = api || null;
        this._media = media || (() => null);
        // OÙ SE MONTER, ET POURQUOI ÇA COMPTE. Le lecteur occupe le z-index
        // maximal : un écran posé sur `document.body` passerait DERRIÈRE lui et
        // resterait invisible. Monté dans le lecteur, il se glisse entre la
        // vidéo et la barre de commandes, qui reste accessible par-dessus.
        this._hote = hote || (() => document.body);

        this._el = null;
        this._conteneurParoles = null;
        /** @type {Array<{el: HTMLElement, segments: HTMLElement[]}>} */
        this._lignesDom = [];
        this._boucle = null;
        /** Dernier état peint : sortir tôt quand rien n'a bougé. */
        this._peint = { ligne: -2, caracteres: -2 };
    }

    get ouvert() { return this._el !== null; }

    /**
     * Change l'hôte de montage.
     *
     * Le lecteur n'existe pas au moment où ce service est construit : il le
     * fournit lui-même quand il ouvre un morceau. Un changement d'hôte alors que
     * l'écran est monté le déplacerait — on le referme donc d'abord.
     *
     * @param {() => HTMLElement|null} hote
     */
    definirHote(hote) {
        if (typeof hote !== 'function') return;
        if (this._el && this._hote() !== hote()) this.fermer();
        this._hote = hote;
    }

    /**
     * Ouvre l'écran pour un morceau.
     * @param {object} item  la fiche Jellyfin du morceau.
     */
    async ouvrir(item) {
        if (!item) return;
        if (!this._el) this._construire();
        this._remplirEntete(item);

        const id = item.Id || item.id;
        this._peint = { ligne: -2, caracteres: -2 };
        const trouvees = await this._paroles?.charger?.(id);
        this._construireParoles(trouvees === true);
        this._demarrerBoucle();
    }

    /** Ferme l'écran et arrête la boucle. */
    fermer() {
        this._arreterBoucle();
        this._paroles?.reinitialiser?.();
        this._el?.remove();
        this._el = null;
        this._conteneurParoles = null;
        this._lignesDom = [];
    }

    // ─── Construction ───────────────────────────────────────────────────────

    _construire() {
        const el = document.createElement('div');
        el.className = 'sh-musique';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', 'Lecture musicale');

        // Le fond flouté est une IMAGE, pas un `filter: blur()` sur un parent :
        // flouter un ancêtre force le navigateur à recomposer tout le sous-arbre
        // à chaque image, paroles comprises.
        const fond = document.createElement('div');
        fond.className = 'sh-musique__fond';
        fond.setAttribute('aria-hidden', 'true');

        const pochette = document.createElement('img');
        pochette.className = 'sh-musique__pochette';
        pochette.alt = '';
        pochette.setAttribute('aria-hidden', 'true');

        const titre = document.createElement('h1');
        titre.className = 'sh-musique__titre';
        const artiste = document.createElement('p');
        artiste.className = 'sh-musique__artiste';

        const paroles = document.createElement('div');
        paroles.className = 'sh-musique__paroles';

        const colonne = document.createElement('div');
        colonne.className = 'sh-musique__colonne';
        colonne.append(pochette, titre, artiste);

        el.append(fond, colonne, paroles);
        const hote = this._hote() || document.body;
        // Hors du lecteur (usage autonome), il faut couvrir la fenêtre entière.
        if (hote === document.body) el.classList.add('sh-musique--fenetre');
        hote.appendChild(el);

        this._el = el;
        this._conteneurParoles = paroles;
    }

    _remplirEntete(item) {
        const id = item.AlbumId || item.Id || item.id;
        const url = id ? (this._api?.getImageUrl?.(id, 'Primary', { maxWidth: 640, maxHeight: 640 }) || '') : '';
        const pochette = this._el.querySelector('.sh-musique__pochette');
        const fond = this._el.querySelector('.sh-musique__fond');
        if (url) {
            pochette.src = url;
            // `backgroundImage` plutôt que `background` : ne pas écraser la
            // couleur de repli, qui reste visible tant que l'image n'est pas là.
            fond.style.backgroundImage = `url("${encodeURI(url)}")`;
        } else {
            pochette.removeAttribute('src');
            fond.style.backgroundImage = '';
        }
        // `textContent` et jamais `innerHTML` : un titre de morceau vient du
        // serveur, donc des balises ID3 d'un fichier, donc de n'importe où.
        this._el.querySelector('.sh-musique__titre').textContent = item.Name || item.title || '';
        this._el.querySelector('.sh-musique__artiste').textContent =
            (item.Artists || []).join(', ') || item.AlbumArtist || item.Album || '';
    }

    /**
     * Pose un `<span>` par repère de mot, une fois pour toutes.
     * @param {boolean} trouvees
     */
    _construireParoles(trouvees) {
        this._conteneurParoles.textContent = '';
        this._lignesDom = [];

        if (!trouvees) {
            const vide = document.createElement('p');
            vide.className = 'sh-musique__sans-paroles';
            // Dire « aucune parole pour ce morceau » plutôt que de laisser un
            // vide : la plupart des morceaux n'en ont pas, et un écran nu
            // ressemble à une panne.
            vide.textContent = 'Pas de paroles pour ce morceau.';
            this._conteneurParoles.appendChild(vide);
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const ligne of this._paroles.lignes()) {
            const p = document.createElement('p');
            p.className = 'sh-musique__ligne';
            const segments = [];
            for (const seg of ligne.segments) {
                const span = document.createElement('span');
                span.className = 'sh-musique__mot';
                span.textContent = ligne.texte.slice(seg.debutTexte, seg.finTexte);
                p.appendChild(span);
                segments.push(span);
            }
            fragment.appendChild(p);
            this._lignesDom.push({ el: p, segments });
        }
        this._conteneurParoles.appendChild(fragment);
    }

    // ─── Boucle d'animation ─────────────────────────────────────────────────

    _demarrerBoucle() {
        this._arreterBoucle();
        const pas = () => {
            this._boucle = requestAnimationFrame(pas);
            this._peindre();
        };
        this._boucle = requestAnimationFrame(pas);
    }

    _arreterBoucle() {
        if (this._boucle !== null) {
            cancelAnimationFrame(this._boucle);
            this._boucle = null;
        }
    }

    /**
     * Une image d'animation. Ne touche au DOM que si quelque chose a changé.
     */
    _peindre() {
        const media = this._media();
        if (!media || !this._lignesDom.length) return;

        const t = media.currentTime || 0;
        const ligne = this._paroles.ligneA(t);
        const caracteres = ligne >= 0 ? this._paroles.caracteresChantes(ligne, t) : 0;

        // Rien n'a bougé depuis l'image précédente : soixante fois par seconde,
        // c'est l'écrasante majorité des cas.
        if (ligne === this._peint.ligne && caracteres === this._peint.caracteres) return;

        if (ligne !== this._peint.ligne) {
            this._lignesDom[this._peint.ligne]?.el.classList.remove('est-active');
            const courante = this._lignesDom[ligne];
            if (courante) {
                courante.el.classList.add('est-active');
                this._recentrer(ligne);
            }
            // Les mots de la ligne quittée restent allumés : une ligne passée
            // s'éteint d'un bloc via sa classe, pas mot par mot.
            for (const span of this._lignesDom[this._peint.ligne]?.segments || []) {
                span.classList.remove('est-chante');
            }
        }

        this._allumer(ligne, caracteres);
        this._peint = { ligne, caracteres };
    }

    /**
     * @param {number} indexLigne
     * @param {number} caracteres  -1 = pas de découpage au mot : tout s'allume.
     */
    _allumer(indexLigne, caracteres) {
        const dom = this._lignesDom[indexLigne];
        if (!dom) return;
        const segments = this._paroles.lignes()[indexLigne]?.segments || [];
        for (let i = 0; i < dom.segments.length; i += 1) {
            const chante = caracteres === -1 || (segments[i] && segments[i].finTexte <= caracteres);
            // `classList.toggle` avec un second argument n'écrit que si l'état
            // diffère : pas d'invalidation de style inutile.
            dom.segments[i].classList.toggle('est-chante', Boolean(chante));
        }
    }

    /**
     * Fait défiler la ligne courante au centre.
     *
     * `transform` plutôt que `scrollTop` : le défilement met en page, la
     * transformation reste sur le compositeur. Sur un téléviseur, la différence
     * est visible à l'œil nu.
     */
    _recentrer(indexLigne) {
        const hauteur = this._lignesDom[0]?.el.offsetHeight || 0;
        if (!hauteur) return;
        const decalage = Math.max(0, indexLigne - LIGNES_AUTOUR) * hauteur;
        this._conteneurParoles.style.transform = `translate3d(0, ${-decalage}px, 0)`;
    }
}

export default EcranMusique;
