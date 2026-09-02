/**
 * SpaceHub — Contrôle parental (mode enfant)
 * Version: 1.0.0
 *
 * Ce que fait ce service, et ce qu'il ne fait pas
 * ----------------------------------------------
 * Jellyfin applique DÉJÀ un contrôle parental côté serveur, par compte : un
 * utilisateur restreint ne reçoit tout simplement pas les titres au-delà de sa
 * classification. C'est la seule protection réelle, et rien ici ne la remplace.
 *
 * Ce service répond à un besoin différent, que l'audit relevait (§7) : sur un
 * compte familial unique — le cas le plus courant chez soi — il n'existait
 * aucun moyen de basculer temporairement l'affichage en mode enfant. Il faut
 * donc comprendre honnêtement ce qui suit comme **un garde-fou d'interface**,
 * pas comme une sécurité :
 *
 *   - il masque et verrouille les titres au-dessus de la limite choisie ;
 *   - il refuse de lancer la lecture d'un titre verrouillé ;
 *   - il demande un code pour ressortir du mode.
 *
 * Un adulte techniquement averti contourne tout cela en une minute (console du
 * navigateur, stockage local). Pour une vraie séparation, il faut un compte
 * Jellyfin dédié à l'enfant, avec sa classification maximale réglée côté
 * serveur — ce que dit explicitement l'interface des réglages.
 *
 * Le code n'est jamais stocké en clair : seul un condensat SHA-256 salé l'est.
 * Ce n'est pas ce qui rend le mode sûr (voir ci-dessus), mais un code réutilisé
 * ailleurs ne doit pas se retrouver lisible dans le stockage du navigateur.
 */

'use strict';

import Logger from './Logger.js';

/**
 * Classifications, du plus permissif au plus restrictif — plusieurs pays
 * mélangés, parce qu'une médiathèque personnelle contient des fiches venant de
 * sources différentes. Un rang plus bas signifie « convient à un public plus
 * jeune ».
 */
const ECHELLE = [
    { rang: 0,  codes: ['G', 'TV-Y', 'TV-G', 'U', 'E', 'EC', 'AL', 'TOUS PUBLICS', 'TOUT PUBLIC'] },
    { rang: 1,  codes: ['TV-Y7', 'TV-Y7-FV', '6', '7', 'PG', 'TV-PG', '8'] },
    { rang: 2,  codes: ['10', '-10', '12', '-12', 'PG-13', 'TV-14', '12A', '13'] },
    { rang: 3,  codes: ['16', '-16', 'R', 'TV-MA', '15', '17'] },
    { rang: 4,  codes: ['18', '-18', 'NC-17', 'X', 'AO', 'R18'] },
];

const NIVEAUX = [
    { valeur: 0, libelle: 'Tout public' },
    { valeur: 1, libelle: 'À partir de 7 ans' },
    { valeur: 2, libelle: 'À partir de 12 ans' },
    { valeur: 3, libelle: 'À partir de 16 ans' },
    { valeur: 4, libelle: 'Aucune limite' },
];

class ParentalControl {
    constructor({ settings = null, eventBus = null } = {}) {
        this._log = new Logger('ParentalControl');
        this._settings = settings;
        this._eventBus = eventBus;
    }

    static get niveaux() { return NIVEAUX.slice(); }

    /** Le mode enfant est-il actif ? */
    isEnabled() {
        return this._settings?.get('parental.enabled', false) === true;
    }

    /** Rang maximal autorisé (0 = tout public … 4 = aucune limite). */
    maxRank() {
        const v = Number(this._settings?.get('parental.maxRank', 1));
        return Number.isFinite(v) ? Math.min(Math.max(v, 0), 4) : 1;
    }

    /**
     * Rang d'une classification textuelle.
     *
     * Renvoie `null` quand la classification est absente ou inconnue — et c'est
     * important : une fiche sans classification n'est PAS présumée tout public.
     * Elle est traitée selon le réglage « titres non classés », dont la valeur
     * par défaut est de les masquer. Présumer l'inverse serait exactement le
     * type de raccourci qui rend un contrôle parental inutile.
     */
    rankOf(classification) {
        if (!classification) return null;
        const brut = String(classification).trim().toUpperCase();
        for (const niveau of ECHELLE) {
            if (niveau.codes.includes(brut)) return niveau.rang;
        }
        // Beaucoup de fiches portent « FR-12 », « US:PG-13 », « 12+ »…
        const nombre = brut.match(/(\d{1,2})/);
        if (nombre) {
            const age = Number(nombre[1]);
            if (age <= 3) return 0;
            if (age <= 7) return 1;
            if (age <= 13) return 2;
            if (age <= 16) return 3;
            return 4;
        }
        return null;
    }

    /**
     * Ce titre est-il autorisé dans l'état actuel ?
     * @param {Object} item élément Jellyfin (utilise OfficialRating)
     */
    isAllowed(item) {
        if (!this.isEnabled()) return true;
        const rang = this.rankOf(item?.OfficialRating);
        if (rang === null) {
            return this._settings?.get('parental.allowUnrated', false) === true;
        }
        return rang <= this.maxRank();
    }

    /** Filtre une liste — utilisé par les widgets et la bibliothèque. */
    filter(items) {
        if (!this.isEnabled()) return items || [];
        return (items || []).filter(it => this.isAllowed(it));
    }

    /**
     * Motif du blocage, pour l'afficher à l'utilisateur plutôt que de faire
     * disparaître un titre sans explication.
     */
    reason(item) {
        if (this.isAllowed(item)) return null;
        const rang = this.rankOf(item?.OfficialRating);
        if (rang === null) return 'Ce titre n\'a pas de classification.';
        const limite = NIVEAUX.find(n => n.valeur === this.maxRank());
        return `Classé « ${item.OfficialRating} » — au-delà de la limite « ${limite?.libelle || ''} ».`;
    }

    // ─── Code de sortie ──────────────────────────────────────────────────────

    /** Un code a-t-il été défini ? */
    hasPin() {
        return Boolean(this._settings?.get('parental.pinHash', ''));
    }

    async _condensat(code) {
        const sel = this._settings?.get('parental.pinSalt', '') || '';
        const data = new TextEncoder().encode(`spacehub:${sel}:${code}`);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Définit (ou remplace) le code. Le code en clair n'est jamais conservé. */
    async setPin(code) {
        const propre = String(code || '').trim();
        if (propre.length < 4) throw new Error('Le code doit compter au moins 4 chiffres.');
        const sel = crypto.getRandomValues(new Uint8Array(8));
        const selHex = [...sel].map(b => b.toString(16).padStart(2, '0')).join('');
        this._settings?.set('parental.pinSalt', selHex);
        this._settings?.set('parental.pinHash', await this._condensat(propre));
    }

    async verifyPin(code) {
        if (!this.hasPin()) return true;
        try {
            return await this._condensat(String(code || '').trim())
                === this._settings?.get('parental.pinHash', '');
        } catch {
            return false;
        }
    }

    // ─── Activation ──────────────────────────────────────────────────────────

    /** Active le mode enfant. Aucun code n'est requis pour ENTRER, seulement pour sortir. */
    enable(rangMax = 1) {
        this._settings?.set('parental.maxRank', rangMax);
        this._settings?.set('parental.enabled', true);
        this._log.info(`Mode enfant activé (rang max ${rangMax}).`);
        this._eventBus?.emit('parental:changed', { enabled: true, maxRank: rangMax });
    }

    /**
     * Désactive le mode enfant après vérification du code.
     * @returns {Promise<boolean>} vrai si le mode a bien été levé
     */
    async disable(code) {
        if (this.hasPin() && !(await this.verifyPin(code))) {
            this._log.warn('Code incorrect — le mode enfant reste actif.');
            return false;
        }
        this._settings?.set('parental.enabled', false);
        this._log.info('Mode enfant désactivé.');
        this._eventBus?.emit('parental:changed', { enabled: false });
        return true;
    }
}

export default ParentalControl;
