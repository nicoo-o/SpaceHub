/**
 * SpaceHub — chargement à la demande de l'écran des réglages
 *
 * POURQUOI. `SettingsPanel` pèse 17 ko compressés et était importé
 * statiquement, donc téléchargé et compilé à chaque démarrage — alors qu'on
 * n'ouvre les réglages que rarement, et jamais au premier écran.
 *
 * LE BLOCAGE QU'IL FALLAIT LEVER D'ABORD
 * ---------------------------------------
 * Les cinq points d'entrée écrivaient `svc.settingsPanel()?.open()`. Le
 * chaînage optionnel est ici un piège : quand le panneau n'est pas encore
 * chargé, l'accesseur renvoie `null` et l'appel ne fait **rien du tout** — pas
 * d'erreur, pas de message, un bouton mort. Un bouton muet est pire qu'un
 * bouton lent : la personne appuie deux fois, puis conclut que l'application
 * est cassée.
 *
 * Ce module remplace le chaînage muet par une attente explicite, et rend
 * l'échec visible s'il survient.
 *
 * UNE SEULE INSTANCE. Cinq points d'entrée mènent ici ; sans mémorisation de
 * la promesse, deux clics rapprochés construiraient deux panneaux, dont l'un
 * resterait orphelin dans le DOM.
 */

'use strict';

import * as svc from '../../core/services.js';

/** @type {Promise<Object|null>|null} */
let promesse = null;

/**
 * Charge et construit l'écran des réglages.
 * @returns {Promise<Object|null>} le panneau, ou `null` si le chargement échoue.
 */
export async function chargerReglages() {
    const deja = svc.settingsPanel();
    if (deja) return deja;
    if (promesse) return promesse;

    promesse = (async () => {
        const { default: SettingsPanel } = await import('./SettingsPanel.js');
        const panneau = new SettingsPanel();
        // Le registre SEUL. Écrire aussi dans `window.SpaceHub.ui` créerait
        // une seconde source de vérité — exactement ce que le registre est venu
        // supprimer — et ferait remonter le compteur d'accès globaux que le
        // contrat `test:globals` fait descendre depuis des semaines.
        //
        // Ce qui a besoin du panneau depuis l'extérieur passe par
        // `SpaceHub.ui.ouvrirReglages`, exposé une fois au démarrage.
        const registre = svc.registry?.();
        registre?.register?.('ui.settingsPanel', panneau, { override: true });
        return panneau;
    })().catch((err) => {
        // On oublie la promesse pour qu'un second clic réessaie, au lieu de
        // renvoyer l'échec à vie.
        promesse = null;
        // eslint-disable-next-line no-console
        console.warn('[SpaceHub] Écran des réglages indisponible :', err);
        return null;
    });

    return promesse;
}

/**
 * Ouvre l'écran des réglages, en le chargeant au besoin.
 *
 * @param {string} [onglet]
 * @returns {Promise<boolean>} vrai si l'écran s'est ouvert.
 */
export async function ouvrirReglages(onglet) {
    const panneau = await chargerReglages();
    if (!panneau) {
        svc.toaster()?.error?.("L'écran des réglages n'a pas pu être chargé.");
        return false;
    }
    panneau.open(onglet);
    return true;
}

export default ouvrirReglages;
