/**
 * SpaceHub — chargement à la demande de la console d'administration
 *
 * POURQUOI CE FICHIER. La console d'administration est **gelée par défaut**
 * (`FeatureFlags`, `features.adminConsole`), et pourtant ses deux vues étaient
 * importées statiquement : 18,5 ko compressés téléchargés et compilés à chaque
 * démarrage pour une fonctionnalité éteinte.
 *
 * `FeatureFlags.js` avait annoncé la correction lui-même : « Ce que le gel NE
 * fait pas : alléger le bundle. […] Un vrai retrait passerait par un import
 * dynamique — c'est la suite logique si le gel se confirme dans la durée. »
 *
 * UNE SEULE INSTANCE. Deux points d'entrée mènent ici — le menu utilisateur et
 * le tiroir latéral. Sans mémorisation de la promesse, deux clics rapprochés
 * construiraient deux vues, dont l'une resterait orpheline dans le DOM.
 */

'use strict';

import * as svc from '../../core/services.js';

/** @type {Promise<Object|null>|null} */
let promesse = null;

/**
 * Charge, construit et enregistre la console d'administration.
 *
 * @returns {Promise<Object|null>} la vue, ou `null` si le chargement échoue —
 *   l'appelant doit le dire à l'utilisateur plutôt que de ne rien faire.
 */
export async function chargerConsoleAdmin() {
    const deja = svc.adminDashboard();
    if (deja) return deja;
    if (promesse) return promesse;

    promesse = (async () => {
        const [admin, console_] = await Promise.all([
            import('./AdminDashboardView.js'),
            import('./JellyfinConsoleModal.js'),
        ]);
        const vue = new admin.default();
        const consoleJellyfin = new console_.default();
        const registre = svc.registry?.();
        // Le registre SUFFIT : `svc.adminDashboard()` le consulte en premier
        // et ne retombe sur la façade globale qu'en son absence. Écrire aussi
        // dans `window.SpaceHub` créerait deux sources de vérité pour le même
        // objet — exactement ce que le registre est venu supprimer.
        registre?.register?.('ui.adminDashboard', vue, { override: true });
        registre?.register?.('ui.jellyfinConsole', consoleJellyfin, { override: true });
        return vue;
    })().catch(() => {
        // Un échec ne doit pas condamner la session : on oublie la promesse
        // pour qu'un second clic réessaie, au lieu de renvoyer l'échec à vie.
        promesse = null;
        return null;
    });

    return promesse;
}

export default chargerConsoleAdmin;
