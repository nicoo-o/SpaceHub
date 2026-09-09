/**
 * Utilitaires purs du lecteur — extraits de VideoPlayer.js (peau 2).
 * ===================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Quatre helpers de VideoPlayer ne lisent ni n'écrivent AUCUN état du
 * lecteur : ils transforment leurs arguments et rendent une valeur. Leur
 * place n'est pas dans la façade mais dans un module testable isolément —
 * la peau 2 de la décomposition (docs/DECOMPOSITION_VIDEOPLAYER.md).
 *
 * VideoPlayer conserve des talons de délégation (`_formatTime`, `_escape`,
 * `_escapeUrl`, `_animateButtonSpring`) : la surface interne reste
 * identique, aucune peau ne peut casser un appelant.
 *
 * Toutes les fonctions sont PURES : pas de `this`, pas d'état, pas d'effet
 * de bord (l'animation de bouton mut son nœud DOM — argument passé, jamais
 * l'objet lecteur).
 */

/**
 * Secondes → « HH:MM:SS » (zéro-paddé). Valeurs invalides ou négatives :
 * « 00:00:00 », jamais « NaN:NaN… » dans l'interface.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formaterTemps(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Échappement HTML minimal pour interpolation dans un gabarit : esperluettes
 * et chevrons d'abord, puis guillemets droits. Rien d'autre : l'attribut
 * doit rester lisible.
 *
 * @param {string|undefined|null} str
 * @returns {string}
 */
export function echapperHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Assainit une URL fournie par l'utilisateur ou le serveur avant insertion
 * dans un attribut href/src : trim, protocole limité à http(s) (aucun
 * javascript:, data:), échappement des guillemets et antislashs pour la
 * mise en attribut. Vide en cas de doute — refuser plutôt qu'exposer.
 *
 * @param {string|undefined|null} value
 * @returns {string}
 */
export function echapperUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        return parsed.href.replace(/["'\\]/g, character => `\\${character}`);
    } catch {
        return '';
    }
}

/**
 * Relance l'animation CSS « spring-bounce » d'un bouton : la classe est
 * retirée, un reflow forcé (`offsetWidth`) réarme la transition, la classe
 * repart. Nœud absent : sans effet.
 *
 * @param {HTMLElement|null} btn
 */
export function ressortirBouton(btn) {
    if (!btn) return;
    btn.classList.remove('spring-bounce');
    void btn.offsetWidth;
    btn.classList.add('spring-bounce');
}
