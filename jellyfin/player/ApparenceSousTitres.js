/**
 * SpaceHub — apparence des sous-titres
 *
 * POURQUOI C'EST DE L'ACCESSIBILITÉ AVANT D'ÊTRE DU CONFORT
 * ---------------------------------------------------------
 * Le lecteur savait décaler les sous-titres dans le TEMPS ; il ne savait rien
 * de leur lisibilité. Or un sous-titre blanc sans fond, posé sur une scène de
 * neige ou de plage, disparaît purement et simplement — et le critère WCAG
 * 1.4.3 ne s'applique pas moins parce que le fond est une image.
 *
 * À trois mètres d'un téléviseur, la taille par défaut d'un `::cue` est en
 * outre calculée pour un écran d'ordinateur à cinquante centimètres.
 *
 * COMMENT ON HABILLE UN SOUS-TITRE, ET LE PIÈGE
 * ---------------------------------------------
 * `::cue` est le seul sélecteur qui atteigne les pistes WebVTT, et il n'accepte
 * qu'une liste FERMÉE de propriétés : `color`, `background-color`, `font-*`,
 * `text-shadow`, `opacity`, `white-space`. Tout le reste — `padding`, `border`,
 * `position` — est ignoré SANS ERREUR. Une implémentation qui pose un `padding`
 * pour aérer le fond ne verra jamais rien, et cherchera longtemps.
 *
 * Le contour se fait donc par `text-shadow` en quatre directions, et l'aération
 * du fond par des espaces insécables — pas par du remplissage.
 *
 * ET LES SOUS-TITRES INCRUSTÉS ? Rien de tout cela ne s'y applique : ils sont
 * DANS l'image, gravés par le serveur au transcodage. C'est une limite du
 * format, pas de ce module, et l'interface doit le dire plutôt que de laisser
 * quelqu'un régler une taille qui ne change rien.
 */

'use strict';

/** Tailles proposées, en pourcentage de la taille par défaut. */
export const TAILLES = [75, 100, 125, 150, 200, 250];

/** Familles sûres : présentes partout, y compris sur téléviseur. */
export const POLICES = [
    { valeur: 'systeme', libelle: 'Système', css: 'inherit' },
    { valeur: 'sans', libelle: 'Sans empattement', css: '"Inter", Arial, Helvetica, sans-serif' },
    { valeur: 'serif', libelle: 'Avec empattements', css: 'Georgia, "Times New Roman", serif' },
    // Une police à espacement fixe aide à distinguer I, l et 1 — utile aux
    // personnes dyslexiques, et c'est la raison pour laquelle elle est là.
    { valeur: 'mono', libelle: 'Espacement fixe', css: '"SF Mono", Consolas, monospace' },
];

export const FONDS = [
    { valeur: 'aucun', libelle: 'Aucun' },
    { valeur: 'contour', libelle: 'Contour seul' },
    { valeur: 'ombre', libelle: 'Boîte translucide' },
    { valeur: 'opaque', libelle: 'Boîte opaque' },
];

/** Réglages par défaut : exactement le rendu actuel, pour ne rien changer
 *  à l'existant tant que personne n'a touché à rien. */
export const DEFAUTS = Object.freeze({
    taille: 100,
    police: 'systeme',
    couleur: '#ffffff',
    fond: 'contour',
    opaciteFond: 60,
    position: 0,
});

const CLE = 'player.sousTitres';
const ID_STYLE = 'sh-style-sous-titres';

/**
 * Lit les réglages, en comblant ce qui manque.
 * @param {Object} settings
 */
export function lire(settings) {
    const brut = settings?.get?.(CLE, null);
    const objet = (brut && typeof brut === 'object') ? brut : {};
    return { ...DEFAUTS, ...objet };
}

export function ecrire(settings, partiels) {
    settings?.set?.(CLE, { ...lire(settings), ...(partiels || {}) });
}

/**
 * Produit la règle CSS correspondant à des réglages.
 *
 * Exportée pour être testable sans DOM : c'est le texte produit qui compte,
 * et lui seul décide de ce qu'on voit.
 *
 * @param {object} reglages
 * @returns {string}
 */
export function css(reglages) {
    const r = { ...DEFAUTS, ...(reglages || {}) };
    const police = POLICES.find(p => p.valeur === r.police) || POLICES[0];
    const proprietes = [];

    proprietes.push(`font-size: ${_borne(r.taille, 50, 400)}%`);
    if (police.css !== 'inherit') proprietes.push(`font-family: ${police.css}`);
    proprietes.push(`color: ${_couleurSure(r.couleur)}`);

    if (r.fond === 'aucun') {
        proprietes.push('background-color: transparent');
        proprietes.push('text-shadow: none');
    } else if (r.fond === 'contour') {
        proprietes.push('background-color: transparent');
        // `::cue` ignore `-webkit-text-stroke` : le contour se fait par quatre
        // ombres. Trois suffisent rarement — il manque toujours le côté où le
        // fond est le plus clair.
        proprietes.push(
            'text-shadow: 1px 1px 2px rgba(0,0,0,0.95), -1px 1px 2px rgba(0,0,0,0.95), '
            + '1px -1px 2px rgba(0,0,0,0.95), -1px -1px 2px rgba(0,0,0,0.95)');
    } else {
        const a = r.fond === 'opaque' ? 1 : _borne(r.opaciteFond, 0, 100) / 100;
        proprietes.push(`background-color: rgba(0, 0, 0, ${a})`);
        proprietes.push('text-shadow: none');
    }

    // `::cue` n'accepte QUE cette liste fermée de propriétés. Y ajouter
    // `padding` ou `border` ne produirait rien, sans erreur — c'est le piège
    // le plus coûteux de ce sélecteur.
    return `video::cue { ${proprietes.join('; ')}; }`;
}

/**
 * Applique les réglages au document.
 *
 * @param {Object} settings
 * @param {Document} [doc]
 */
export function appliquer(settings, doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc) return null;
    const reglages = lire(settings);
    let balise = doc.getElementById(ID_STYLE);
    if (!balise) {
        balise = doc.createElement('style');
        balise.id = ID_STYLE;
        doc.head.appendChild(balise);
    }
    // `textContent` : les valeurs viennent des réglages, donc d'un fichier
    // importable. `_couleurSure` refuse déjà tout ce qui n'est pas une couleur,
    // mais une seconde barrière ne coûte rien.
    balise.textContent = css(reglages);
    return balise;
}

/**
 * Décale verticalement la piste.
 *
 * `::cue` ne sait pas positionner ; seul `line` sur l'objet `VTTCue` le peut.
 * On agit donc sur les cues eux-mêmes, à chaque changement de piste.
 *
 * @param {HTMLMediaElement} video
 * @param {number} decalage  en « lignes », négatif = plus haut.
 */
export function positionner(video, decalage) {
    const d = Number(decalage) || 0;
    for (const piste of Array.from(video?.textTracks || [])) {
        if (piste.mode === 'disabled') continue;
        for (const cue of Array.from(piste.cues || [])) {
            // `line: 'auto'` laisse le navigateur décider ; un nombre négatif
            // compte depuis le BAS, ce qui est l'origine naturelle ici.
            cue.line = d === 0 ? 'auto' : -1 - d;
        }
    }
}

// ─── Interne ────────────────────────────────────────────────────────────────

function _borne(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

/**
 * N'accepte qu'une couleur hexadécimale.
 *
 * Un réglage vient d'un fichier que l'utilisateur peut importer : sans ce
 * filtre, une valeur comme `red; } body { display:none } .x {` sortirait de la
 * règle et réécrirait la page.
 */
function _couleurSure(valeur) {
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(valeur || '')) ? valeur : DEFAUTS.couleur;
}

export default { TAILLES, POLICES, FONDS, DEFAUTS, lire, ecrire, css, appliquer, positionner };
