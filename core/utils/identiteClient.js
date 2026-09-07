/**
 * SpaceHub — Identité déclarée au serveur Jellyfin
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'en-tête d'autorisation Jellyfin porte l'identité du client :
 *
 *     Authorization: MediaBrowser Client="…", Device="…", DeviceId="…",
 *                    Version="…", Token="…"
 *
 * Elle était écrite en dur, à l'identique, dans TROIS fichiers, et elle
 * mentait : `Client="Jellyfin Web", Device="Chrome", Version="10.8.13"`.
 * Trois conséquences concrètes :
 *
 *   1. Dans le tableau de bord de l'administrateur, la session apparaissait
 *      comme « Jellyfin Web 10.8.13 sur Chrome ». Impossible de distinguer
 *      SpaceHub du client officiel, ni de savoir depuis quel appareil on
 *      lisait — pour l'utilisateur qui gère son propre serveur, c'est
 *      exactement l'information qu'il cherche.
 *   2. Le serveur choisit certains comportements (profils, journalisation,
 *      compatibilité) d'après le nom du client. Se déclarer comme un autre
 *      client, c'est demander des décisions prises pour du code qu'on n'est
 *      pas.
 *   3. Trois copies dérivent. Elles avaient déjà divergé sur la présence du
 *      jeton.
 *
 * Une seule source, honnête, et un appareil déduit de l'agent utilisateur
 * plutôt que supposé « Chrome ».
 *
 * Référence : l'en-tête `Authorization: MediaBrowser` est la forme supportée ;
 * `X-Emby-Authorization`, `X-Emby-Token` et le paramètre d'URL `api_key` sont
 * dépréciés depuis Jellyfin 10.11 et désactivés par défaut à partir de la
 * version suivante. On continue d'émettre `X-Emby-Authorization` en second
 * pour les serveurs anciens, mais `Authorization` porte déjà tout.
 */

'use strict';

/** Nom du client tel qu'il apparaîtra dans les sessions Jellyfin. */
export const NOM_CLIENT = 'SpaceHub';

/** Version du client. Alignée sur package.json à la main, volontairement :
 *  une version injectée au build serait absente en développement. */
export const VERSION_CLIENT = '1.0.0';

/**
 * Décrit l'appareil de façon utile à qui lit la liste des sessions.
 *
 * On ne cherche pas l'exactitude médico-légale : on cherche à ce que
 * l'utilisateur reconnaisse SON appareil dans la liste. « Téléviseur LG »
 * est plus utile que « Mozilla/5.0 (Web0S; Linux/SmartTV) … ».
 *
 * @returns {string}
 */
export function nomAppareil() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/Web0S|webOS/i.test(ua)) return 'Téléviseur LG';
    if (/Tizen/i.test(ua)) return 'Téléviseur Samsung';
    if (/BRAVIA|AFT[A-Z]|Android TV|GoogleTV/i.test(ua)) return 'Téléviseur Android';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'PC Windows';
    if (/Linux/i.test(ua)) return 'PC Linux';
    return 'Navigateur';
}

/**
 * Construit l'en-tête d'autorisation Jellyfin.
 *
 * @param {string} deviceId  Identifiant stable de cette installation.
 * @param {string} [token]   Jeton d'accès ; omis avant la connexion.
 * @returns {string}
 */
export function enteteAutorisation(deviceId, token = '') {
    // Les valeurs sont entre guillemets dans l'en-tête : un guillemet dans le
    // nom d'appareil casserait l'analyse côté serveur. Nos noms sont figés,
    // mais l'échappement coûte une ligne et supprime la question.
    const propre = (v) => String(v ?? '').replace(/["\\]/g, '');
    return `MediaBrowser Client="${propre(NOM_CLIENT)}", `
        + `Device="${propre(nomAppareil())}", `
        + `DeviceId="${propre(deviceId)}", `
        + `Version="${propre(VERSION_CLIENT)}"`
        + (token ? `, Token="${propre(token)}"` : '');
}

export default { NOM_CLIENT, VERSION_CLIENT, nomAppareil, enteteAutorisation };
