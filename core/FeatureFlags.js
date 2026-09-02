/**
 * SpaceHub — Drapeaux de fonctionnalité
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit recommandait de « geler » trois fonctionnalités périphériques pour
 * concentrer l'effort sur le lecteur, la navigation TV et le multi-utilisateurs :
 *
 *   - la **Console d'administration Jellyfin**, qui double l'interface d'admin
 *     native de Jellyfin pour 2 000 lignes de maintenance ;
 *   - **Ambilight**, un effet d'ambiance très éloigné du cœur du produit ;
 *   - les **Notifications** (Discord, Telegram, Web Push), qui relèvent plutôt
 *     du serveur que d'un client de lecture.
 *
 * « Geler » ici veut dire **masquer, pas supprimer**. C'est délibéré :
 *
 *   1. Supprimer du code qui fonctionne est irréversible, et le gel est une
 *      recommandation de priorisation — pas un constat de défaut. Rien ne
 *      justifie de détruire un travail qui marche.
 *   2. Un drapeau rend la décision *visible et réversible* : une ligne dans les
 *      réglages ramène la fonctionnalité, et le jour où elle redevient une
 *      priorité, rien n'est à réécrire.
 *   3. L'effet recherché — ne plus payer d'attention à ces surfaces — est
 *      obtenu dès qu'elles disparaissent de l'interface.
 *
 * Ce que le gel NE fait pas : alléger le bundle. Le code est toujours importé.
 * Le dire plutôt que de laisser croire à un gain de performance qui n'existe pas.
 * Un vrai retrait passerait par un import dynamique — c'est la suite logique si
 * le gel se confirme dans la durée.
 */

'use strict';

/**
 * Fonctionnalités gelées, avec leur valeur par défaut.
 * `false` = masquée. L'utilisateur peut rallumer chacune dans les réglages.
 */
export const GELEES = {
    'features.adminConsole': {
        defaut: false,
        titre: 'Console d\'administration Jellyfin',
        motif: 'Double l\'interface d\'administration native de Jellyfin.',
    },
    'features.ambilight': {
        defaut: false,
        titre: 'Ambilight & Lumières',
        motif: 'Effet d\'ambiance, éloigné du cœur du produit.',
    },
    'features.notifications': {
        defaut: false,
        titre: 'Notifications (Discord, Telegram, Push)',
        motif: 'Relève du serveur plutôt que d\'un client de lecture.',
    },
};

class FeatureFlags {
    constructor({ settings = null } = {}) {
        this._settings = settings;
    }

    /**
     * Cette fonctionnalité est-elle disponible ?
     * Une clé inconnue est considérée comme active : le drapeau sert à geler
     * explicitement, jamais à masquer par inadvertance.
     */
    isEnabled(cle) {
        const decl = GELEES[cle];
        if (!decl) return true;
        return this._settings?.get(cle, decl.defaut) === true;
    }

    setEnabled(cle, actif) {
        if (!GELEES[cle]) return;
        this._settings?.set(cle, actif === true);
    }

    /** Liste pour l'écran de réglages. */
    list() {
        return Object.entries(GELEES).map(([cle, d]) => ({
            cle, titre: d.titre, motif: d.motif, actif: this.isEnabled(cle),
        }));
    }
}

export default FeatureFlags;
