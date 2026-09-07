/**
 * SpaceHub — Touches des télécommandes de téléviseur
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * `InputMapper` reconnaissait `'MediaPlayPause'` — c'est-à-dire la touche d'un
 * CLAVIER DE PC. Aucun code de télécommande de téléviseur n'y figurait.
 *
 * Or les téléviseurs ne se comportent pas comme un clavier :
 *
 *   • **Tizen (Samsung).** Seules les quatre flèches, Entrée et Retour
 *     parviennent à l'application sans rien demander. **Toutes les autres
 *     touches doivent être enregistrées explicitement** par
 *     `tizen.tvinputdevice.registerKeyBatch()` — sans cet appel, l'application
 *     ne reçoit JAMAIS l'événement, quoi qu'elle écoute. Ce n'est pas une
 *     question de mappage : la touche n'arrive pas.
 *   • **Fire TV (Amazon).** Les touches arrivent, mais avec des `keyCode`
 *     numériques qui ne correspondent à aucun `event.key` standard. Amazon
 *     exige par ailleurs formellement que toute application média soumise
 *     gère Lecture/Pause.
 *   • **webOS (LG).** Les touches média arrivent comme des `keyCode`
 *     numériques, sans enregistrement préalable.
 *
 * Conséquence avant ce module : sur un vrai téléviseur, appuyer sur ⏯ ⏪ ⏩ ne
 * produisait rien. C'est pire qu'une fonctionnalité absente — l'utilisateur
 * fait le geste évident, il ne se passe rien, et il en conclut que
 * l'application est cassée.
 *
 * Ce module ne fait que deux choses : demander les touches à Tizen au
 * démarrage, et traduire les codes numériques des trois plateformes vers les
 * mêmes actions que le clavier.
 */

'use strict';

import Logger from './Logger.js';

/**
 * Actions média, distinctes des actions de navigation : elles ne déplacent pas
 * le focus, elles pilotent la lecture.
 */
export const ActionMedia = {
    PLAY_PAUSE: 'media_play_pause',
    PLAY: 'media_play',
    PAUSE: 'media_pause',
    STOP: 'media_stop',
    REWIND: 'media_rewind',
    FAST_FORWARD: 'media_fast_forward',
    PREVIOUS: 'media_previous',
    NEXT: 'media_next',
};

/**
 * Touches à demander à Tizen. Les noms sont ceux de l'API Samsung ; les
 * numéros en commentaire sont les `keyCode` que l'on recevra ensuite.
 *
 * On ne demande QUE ce dont l'application se sert. Enregistrer une touche
 * qu'on n'utilise pas la retire au système d'exploitation du téléviseur, qui
 * cesse alors d'y répondre — c'est une capture, pas une écoute.
 */
export const TOUCHES_TIZEN = [
    'MediaPlayPause',    // 10252
    'MediaPlay',         // 415
    'MediaPause',        // 19
    'MediaStop',         // 413
    'MediaRewind',       // 412
    'MediaFastForward',  // 417
    'MediaTrackPrevious',// 10232
    'MediaTrackNext',    // 10233
];

/**
 * Codes numériques vers actions. Une même action a plusieurs codes selon la
 * plateforme : Tizen, webOS et Fire TV ne se sont pas concertés.
 */
const CODES = new Map([
    // ── Tizen ────────────────────────────────────────────────────────────
    [10252, ActionMedia.PLAY_PAUSE],
    [415,   ActionMedia.PLAY],
    [19,    ActionMedia.PAUSE],
    [413,   ActionMedia.STOP],
    [412,   ActionMedia.REWIND],
    [417,   ActionMedia.FAST_FORWARD],
    [10232, ActionMedia.PREVIOUS],
    [10233, ActionMedia.NEXT],
    // ── Fire TV ──────────────────────────────────────────────────────────
    //     Amazon exige que Play/Pause soit géré pour toute app média.
    [179,   ActionMedia.PLAY_PAUSE],
    [227,   ActionMedia.REWIND],
    [228,   ActionMedia.FAST_FORWARD],
    // ── webOS ────────────────────────────────────────────────────────────
    //     LG partage plusieurs codes avec Tizen ; ceux-ci lui sont propres.
    [30,    ActionMedia.PLAY_PAUSE],
]);

/** Noms `event.key` standards, pour les claviers et les télécommandes modernes. */
const NOMS = new Map([
    ['MediaPlayPause',     ActionMedia.PLAY_PAUSE],
    ['MediaPlay',          ActionMedia.PLAY],
    ['MediaPause',         ActionMedia.PAUSE],
    ['MediaStop',          ActionMedia.STOP],
    ['MediaRewind',        ActionMedia.REWIND],
    ['MediaTrackPrevious', ActionMedia.PREVIOUS],
    ['MediaTrackNext',     ActionMedia.NEXT],
    ['MediaFastForward',   ActionMedia.FAST_FORWARD],
]);

const log = new Logger('TelecommandeTv');

/**
 * Demande à Tizen de livrer les touches média à l'application.
 *
 * Sans appareil Tizen, ne fait rien et ne lève pas : ce module est chargé
 * partout, y compris sur PC.
 *
 * @returns {{ plateforme: string, enregistrees: string[], erreur: string|null }}
 */
export function enregistrerTouches() {
    const bilan = { plateforme: detecterPlateforme(), enregistrees: [], erreur: null };

    const tv = typeof window !== 'undefined' ? window.tizen?.tvinputdevice : null;
    if (!tv) return bilan;   // pas un Samsung : rien à demander

    try {
        // `registerKeyBatch` existe depuis les modèles 2016 et évite huit
        // allers-retours ; on retombe sur l'unitaire si le lot n'existe pas.
        if (typeof tv.registerKeyBatch === 'function') {
            tv.registerKeyBatch(TOUCHES_TIZEN);
            bilan.enregistrees = [...TOUCHES_TIZEN];
        } else if (typeof tv.registerKey === 'function') {
            for (const nom of TOUCHES_TIZEN) {
                try { tv.registerKey(nom); bilan.enregistrees.push(nom); }
                catch { /* une touche absente du modèle ne doit pas arrêter les autres */ }
            }
        }
        log.info(`Touches télécommande enregistrées (${bilan.enregistrees.length}) : ${bilan.enregistrees.join(', ')}`);
    } catch (err) {
        // Un échec ici n'empêche pas l'application de fonctionner : seules les
        // touches média seront inertes. On le dit, on ne plante pas.
        bilan.erreur = err?.message || String(err);
        log.warn('Enregistrement des touches télécommande refusé :', bilan.erreur);
    }
    return bilan;
}

/**
 * Traduit un événement clavier en action média, s'il en est une.
 *
 * @param {KeyboardEvent} e
 * @returns {string|null} Une valeur de `ActionMedia`, ou `null`.
 */
export function actionMedia(e) {
    if (!e) return null;
    if (e.key && NOMS.has(e.key)) return NOMS.get(e.key);
    // `keyCode` est déprécié sur le web moderne, mais c'est la SEULE voie sur
    // les télécommandes : elles n'envoient pas de `key` exploitable.
    const code = e.keyCode ?? e.which;
    return (code != null && CODES.has(code)) ? CODES.get(code) : null;
}

/**
 * Plateforme détectée, pour le diagnostic et pour l'affichage.
 * @returns {'tizen'|'webos'|'firetv'|'androidtv'|'navigateur'}
 */
export function detecterPlateforme() {
    if (typeof navigator === 'undefined') return 'navigateur';
    const ua = navigator.userAgent || '';
    if (typeof window !== 'undefined' && window.tizen) return 'tizen';
    if (/Tizen/i.test(ua)) return 'tizen';
    if (/Web0S|webOS/i.test(ua)) return 'webos';
    if (/AFT[A-Z]/i.test(ua)) return 'firetv';
    if (/Android TV|GoogleTV|BRAVIA/i.test(ua)) return 'androidtv';
    return 'navigateur';
}

export default { ActionMedia, TOUCHES_TIZEN, enregistrerTouches, actionMedia, detecterPlateforme };
