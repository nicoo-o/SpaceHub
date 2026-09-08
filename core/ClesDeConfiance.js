/**
 * SpaceHub — Clés de signature épinglées
 *
 * POURQUOI CE FICHIER EXISTE. `PluginCatalog` vérifiait la signature d'un
 * greffon avec une clé publique **fournie par le catalogue lui-même** :
 *
 *     await this.verifySignature(source, entry.signature, entry.publicKey)
 *
 * Qui contrôle le catalogue fournit donc le code, la signature, ET la clé qui
 * la vérifie. Il lui suffit de signer avec la sienne : la vérification réussit
 * et ne prouve rien. Ce n'était pas une faille exploitable dans l'immédiat —
 * aucun catalogue distant n'est configuré — mais c'était l'assurance d'une
 * chaîne de confiance sans la chaîne.
 *
 * Une signature n'a de sens que contre une clé que l'application PORTE et
 * qu'un attaquant ne peut pas remplacer. C'est ce que fait ce fichier.
 *
 * TROIS NIVEAUX DE CONFIANCE, ET ILS DOIVENT SE VOIR
 * --------------------------------------------------
 *   1. `epinglee`  — la clé est ici, dans le code. Confiance maximale.
 *   2. `declaree`  — l'utilisateur a collé l'empreinte de la clé en ajoutant
 *                    le dépôt. La confiance vient de lui, explicitement.
 *   3. `absente`   — dépôt non signé. Autorisé, mais l'interface doit le DIRE
 *                    plutôt que d'afficher « signé » pour une signature
 *                    auto-portante.
 *
 * Ce qui est interdit, c'est le quatrième cas — celui d'avant : une clé venue
 * du catalogue, présentée comme une preuve.
 */

'use strict';

/**
 * Clés du dépôt officiel. Publiques par nature : une clé de vérification n'est
 * pas un secret, c'est un point d'ancrage.
 *
 * Format JWK, courbe P-256, pour `crypto.subtle.importKey('jwk', …, ECDSA)`.
 *
 * @type {Readonly<Record<string, object>>}
 */
export const CLES_EPINGLEES = Object.freeze({
    // Emplacement du dépôt officiel. Tant qu'aucune clé n'a été générée, cet
    // objet reste vide — et c'est volontaire : une fausse clé de démonstration
    // ferait échouer toutes les vérifications avec un message trompeur, alors
    // qu'un catalogue vide dit franchement « aucune clé de confiance ».
});

/** Empreintes de clés que l'utilisateur a ajoutées lui-même, par identifiant. */
const CLE_EMPREINTES_UTILISATEUR = 'plugins.clesApprouvees';

export const Confiance = Object.freeze({
    EPINGLEE: 'epinglee',
    DECLAREE: 'declaree',
    ABSENTE: 'absente',
});

/**
 * Résout la clé à utiliser pour vérifier une signature.
 *
 * Ne consulte JAMAIS `entry.publicKey` : c'est tout l'objet de ce module.
 *
 * @param {string} keyId          identifiant de clé annoncé par le catalogue.
 * @param {Object} [reglages]     SettingsManager, pour les clés utilisateur.
 * @returns {{ cle: object|null, confiance: string, raison?: string }}
 */
export function resoudreCle(keyId, reglages = null) {
    const id = String(keyId || '').trim();
    if (!id) {
        return { cle: null, confiance: Confiance.ABSENTE, raison: 'Aucun identifiant de clé annoncé.' };
    }
    if (Object.prototype.hasOwnProperty.call(CLES_EPINGLEES, id)) {
        return { cle: CLES_EPINGLEES[id], confiance: Confiance.EPINGLEE };
    }
    const declarees = reglages?.get?.(CLE_EMPREINTES_UTILISATEUR, null);
    // `hasOwnProperty` et non `declarees[id]` : un identifiant nommé
    // « constructor » ou « __proto__ » remonterait sinon une valeur de la
    // chaîne de prototypes et serait pris pour une clé approuvée.
    if (declarees && typeof declarees === 'object'
        && Object.prototype.hasOwnProperty.call(declarees, id)) {
        return { cle: declarees[id], confiance: Confiance.DECLAREE };
    }
    return {
        cle: null,
        confiance: Confiance.ABSENTE,
        raison: `Clé « ${id} » inconnue. Une clé fournie par le catalogue lui-même ne prouve rien.`,
    };
}

/**
 * Enregistre une clé que l'utilisateur ajoute en connaissance de cause.
 *
 * @param {string} keyId
 * @param {object} cleJwk
 * @param {Object} reglages
 * @returns {boolean}
 */
export function approuverCle(keyId, cleJwk, reglages) {
    const id = String(keyId || '').trim();
    if (!id || !cleJwk || typeof cleJwk !== 'object' || !reglages?.set) return false;
    // Une clé épinglée ne se remplace pas depuis les réglages : ce serait
    // rouvrir exactement la porte que ce module ferme.
    if (Object.prototype.hasOwnProperty.call(CLES_EPINGLEES, id)) return false;
    const existantes = reglages.get?.(CLE_EMPREINTES_UTILISATEUR, null);
    const base = (existantes && typeof existantes === 'object') ? { ...existantes } : {};
    base[id] = cleJwk;
    reglages.set(CLE_EMPREINTES_UTILISATEUR, base);
    return true;
}

/** Retire une clé approuvée par l'utilisateur. */
export function revoquerCle(keyId, reglages) {
    const existantes = reglages?.get?.(CLE_EMPREINTES_UTILISATEUR, null);
    if (!existantes || typeof existantes !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(existantes, keyId)) return false;
    const base = { ...existantes };
    delete base[keyId];
    reglages.set(CLE_EMPREINTES_UTILISATEUR, base);
    return true;
}

export default { CLES_EPINGLEES, Confiance, resoudreCle, approuverCle, revoquerCle };
