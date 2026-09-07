/**
 * SpaceHub — Vignettes de prévisualisation (trickplay)
 *
 * Ce que c'est
 * ------------
 * Quand on fait glisser le curseur sur la barre de progression, une vignette
 * montre l'image à cette position. C'est le geste qui sépare visuellement un
 * lecteur « maison » d'un lecteur soigné — et aucun client Jellyfin pour
 * téléviseur ne le fait : la demande a été fermée en « not planned » côté
 * Android TV.
 *
 * Comment le serveur les fournit
 * ------------------------------
 * Jellyfin génère nativement depuis la version 10.9 (auparavant il fallait le
 * greffon Jellyscrub). Les images ne sont pas livrées une par une : elles sont
 * assemblées en PLANCHES, typiquement 10 × 10 vignettes par fichier JPEG.
 *
 * Le `BaseItemDto` porte un objet `Trickplay` indexé par identifiant de source
 * puis par largeur :
 *
 *     Trickplay: { "<mediaSourceId>": { "320": {
 *         Width, Height,            // taille d'UNE vignette
 *         TileWidth, TileHeight,    // vignettes par ligne / colonne
 *         ThumbnailCount, Interval  // total, et millisecondes entre deux
 *     } } }
 *
 * L'image se récupère à :
 *
 *     GET /Videos/{itemId}/Trickplay/{width}/{tileIndex}.jpg?mediaSourceId=…
 *
 * PIÈGE N°1, de loin le plus courant : **oublier `mediaSourceId` donne un 404
 * systématique**. Ce paramètre n'est pas optionnel malgré les apparences.
 *
 * Pourquoi ce module existe séparément
 * ------------------------------------
 * hls.js ne gère pas le trickplay (`EXT-X-IMAGE-STREAM-INF`) : c'est au client
 * de le faire, hors du lecteur. Et le calcul d'index n'est documenté nulle
 * part clairement, d'où les commentaires ci-dessous.
 */

'use strict';

import Logger from '../../core/Logger.js';

/**
 * Planches gardées en mémoire simultanément.
 *
 * Une planche 10 × 10 en 320 px pèse 200 à 400 ko. Sur un téléviseur dont le
 * système entier dispose d'environ 500 Mo, en garder vingt reviendrait à
 * reproduire, pour les vignettes, le défaut qu'on vient de corriger sur le
 * tampon HLS. Quatre couvrent largement un déplacement continu du curseur.
 */
const PLANCHES_EN_MEMOIRE = 4;

/** Largeur préférée. On prend la plus proche disponible. */
const LARGEUR_CIBLE = 320;

export class Trickplay {
    /**
     * @param {Object} options
     * @param {() => string} options.serveur   Adresse du serveur Jellyfin.
     * @param {() => string} options.jeton     Jeton d'accès.
     */
    constructor({ serveur, jeton }) {
        this._log = new Logger('Trickplay');
        this._serveur = serveur;
        this._jeton = jeton;
        /** @type {{itemId: string, sourceId: string, largeur: number, info: Object}|null} */
        this._config = null;
        /** Planches chargées : index → HTMLImageElement. Ordre d'insertion = ancienneté. */
        this._planches = new Map();
    }

    /** Vrai si le titre courant a des vignettes exploitables. */
    get disponible() {
        return this._config !== null;
    }

    /**
     * Prépare le module pour un titre.
     *
     * @param {Object} item       BaseItemDto, avec son champ `Trickplay`.
     * @param {string} sourceId   Identifiant de la source média en lecture.
     * @returns {boolean} Vrai si des vignettes sont disponibles.
     */
    preparer(item, sourceId) {
        this._config = null;
        this._planches.clear();

        const parSource = item?.Trickplay;
        if (!parSource || typeof parSource !== 'object') return false;

        // Le serveur indexe par identifiant de source. Si celle qu'on lit n'y
        // est pas, on prend la première : mieux vaut des vignettes légèrement
        // décalées (versions de durées identiques) que pas de vignettes.
        const pourSource = parSource[sourceId] || Object.values(parSource)[0];
        if (!pourSource || typeof pourSource !== 'object') return false;

        // Les largeurs disponibles sont les clés. On veut la plus proche de
        // notre cible, sans dépasser inutilement : une planche 640 px pèse
        // quatre fois plus qu'une 320 px pour un gain invisible à l'écran.
        const largeurs = Object.keys(pourSource).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        if (!largeurs.length) return false;
        const largeur = largeurs.find(l => l >= LARGEUR_CIBLE) ?? largeurs[largeurs.length - 1];

        const info = pourSource[String(largeur)] || pourSource[largeur];
        if (!info?.Interval || !info?.TileWidth || !info?.TileHeight) return false;

        this._config = {
            itemId: item.Id || item.id,
            sourceId: sourceId || Object.keys(parSource)[0],
            largeur,
            info,
        };
        this._log.info(`Vignettes disponibles : ${info.ThumbnailCount} images, une toutes les ${info.Interval} ms, planches de ${info.TileWidth}×${info.TileHeight}.`);
        return true;
    }

    /**
     * Position d'une vignette dans les planches, pour un instant donné.
     *
     * Ce calcul n'est documenté nulle part clairement, d'où son isolement ici :
     * il est testable seul, sans réseau ni DOM.
     *
     * @param {number} secondes
     * @returns {{ tuile: number, colonne: number, ligne: number }|null}
     */
    positionner(secondes) {
        if (!this._config) return null;
        const { info } = this._config;
        const total = Number(info.ThumbnailCount) || Infinity;

        const index = Math.floor((secondes * 1000) / info.Interval);
        if (index < 0 || index >= total) return null;

        const parPlanche = info.TileWidth * info.TileHeight;
        const tuile = Math.floor(index / parPlanche);
        const dans = index % parPlanche;
        return {
            tuile,
            colonne: dans % info.TileWidth,
            ligne: Math.floor(dans / info.TileWidth),
        };
    }

    /** Dimensions d'une vignette, pour dimensionner l'aperçu. */
    get dimensions() {
        if (!this._config) return null;
        const { info } = this._config;
        return { largeur: info.Width || this._config.largeur, hauteur: info.Height || 0 };
    }

    /**
     * URL d'une planche.
     *
     * `mediaSourceId` est OBLIGATOIRE — l'omettre donne un 404 systématique,
     * et c'est l'erreur la plus rapportée sur cette API.
     *
     * @param {number} tuile
     * @returns {string}
     */
    urlPlanche(tuile) {
        const { itemId, sourceId, largeur } = this._config;
        const base = (this._serveur() || '').replace(/\/$/, '');
        const params = new URLSearchParams({ mediaSourceId: sourceId });
        // Un élément <img> ne peut pas porter d'en-tête d'authentification :
        // le jeton passe par l'URL, comme pour les affiches.
        const jeton = this._jeton();
        if (jeton) params.set('api_key', jeton);
        return `${base}/Videos/${encodeURIComponent(itemId)}/Trickplay/${largeur}/${tuile}.jpg?${params}`;
    }

    /**
     * Charge une planche, ou rend celle déjà en mémoire.
     *
     * @param {number} tuile
     * @returns {Promise<HTMLImageElement|null>}
     */
    async planche(tuile) {
        if (!this._config) return null;
        const existante = this._planches.get(tuile);
        if (existante) {
            // Remettre en fin de Map : la plus ancienne sortira en premier.
            this._planches.delete(tuile);
            this._planches.set(tuile, existante);
            return existante;
        }

        const img = new Image();
        img.decoding = 'async';
        const chargee = new Promise((resoudre) => {
            img.onload = () => resoudre(img);
            // Une planche absente n'est pas une panne : le serveur peut ne pas
            // l'avoir encore générée. On renvoie null, l'aperçu reste vide.
            img.onerror = () => resoudre(null);
        });
        img.src = this.urlPlanche(tuile);

        const resultat = await chargee;
        if (resultat) {
            this._planches.set(tuile, resultat);
            while (this._planches.size > PLANCHES_EN_MEMOIRE) {
                const plusAncienne = this._planches.keys().next().value;
                this._planches.delete(plusAncienne);
            }
        }
        return resultat;
    }

    /** Oublie tout. À appeler en changeant de titre. */
    reinitialiser() {
        this._config = null;
        this._planches.clear();
    }
}

export default Trickplay;
