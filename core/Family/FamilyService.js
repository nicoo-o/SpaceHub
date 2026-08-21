/**
 * SpaceHub — FamilyService
 * Version: 1.0.0
 *
 * Gère le contrôle parental et les rapports d'usage familial.
 */

'use strict';

import Logger from '../Logger.js';

class FamilyService {
    constructor(settings) {
        this._log = new Logger('FamilyService');
        this._settings = settings;

        this._registerDefaults();
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'family.parentalControl.enabled': false,
            'family.screenTime.limit': 0, // 0 = illimité
        });
    }

    /**
     * Vérifie si un média est autorisé pour l'utilisateur actuel
     * selon les limites d'âge configurées par l'admin.
     */
    isMediaAllowed(item) {
        if (!this._settings.get('family.parentalControl.enabled')) return true;

        const rating = item.OfficialRating || '';
        const limit = this._settings.get('family.permissions.maxRating', 'R');

        // Logique de filtrage simplifiée (basée sur une hiérarchie standard)
        const hierarchy = ['G', 'PG', 'PG-13', 'R', 'NC-17'];
        const itemIdx = hierarchy.indexOf(rating.toUpperCase());
        const limitIdx = hierarchy.indexOf(limit.toUpperCase());

        if (itemIdx === -1) return true; // Inconnu = autorisé par défaut
        return itemIdx <= limitIdx;
    }

    /**
     * Génère un rapport de temps d'écran hebdomadaire.
     */
    getWeeklyReport() {
        const stats = window.SpaceHub?.core?.analytics?.getStats();
        // Calcul du temps basé sur les plays enregistrés en phase 1
        return {
            totalPlays: stats?.plays || 0,
            mostActiveView: Object.entries(stats?.views || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Accueil'
        };
    }
}

export default FamilyService;
