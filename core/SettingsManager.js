/**
 * SpaceHub — SettingsManager
 * Version: 1.0.0
 *
 * Gestion centralisée de la configuration utilisateur.
 * Stockage dans localStorage avec support des valeurs par défaut,
 * de l'import/export JSON et de la notification de changements via EventBus.
 *
 * Usage:
 *   SpaceHub.core.settings.set('dashboard.layout', [...]);
 *   const layout = SpaceHub.core.settings.get('dashboard.layout', []);
 *   SpaceHub.core.settings.export(); // → JSON string
 */

'use strict';

import Logger from './Logger.js';

/**
 * Clés qui ne doivent jamais être affectées : les écrire revient à modifier
 * `Object.prototype` pour toute l'application (pollution de prototype).
 */
const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Branches que l'import ne touche pas. Le mode enfant se règle dans
 * l'interface, code en main — pas en collant un fichier reçu de quelqu'un.
 */
const BRANCHES_PROTEGEES = new Set(['parental']);



const STORAGE_KEY = 'SpaceHubSettings';

class SettingsManager {
    /**
     * @param {import('./EventBus.js').default} [eventBus]
     */
    constructor(eventBus = null) {
        this._log = new Logger('SettingsManager');
        this._eventBus = eventBus;
        /** @type {Record<string, *>} Valeurs par défaut enregistrées par les modules */
        this._defaults = {};
        /** @type {Record<string, *>} Valeurs actuelles (surchargent les defaults) */
        this._settings = {};
        this._load();
        this._log.info('Initialisé.');
    }

    // ─── Persistance ────────────────────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) this._settings = JSON.parse(raw);
        } catch (err) {
            this._log.warn('Impossible de charger les settings, réinitialisation.', err);
            this._settings = {};
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
        } catch (err) {
            this._log.error('Impossible de sauvegarder les settings.', err);
        }
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Enregistre des valeurs par défaut pour un module.
     * Appelé par chaque module lors de son initialisation.
     * @param {Record<string, *>} defaults
     */
    registerDefaults(defaults) {
        this._defaults = { ...this._defaults, ...defaults };
    }

    /**
     * Lit une valeur. Priorité : setting utilisateur > défaut > fallback.
     * Supporte la notation pointée : get('sonarr.url')
     * @param {string} key
     * @param {*} [fallback]
     * @returns {*}
     */
    get(key, fallback = null) {
        const userVal = this._getDeep(this._settings, key);
        if (userVal !== undefined) return userVal;
        const defVal = this._lireDefaut(key);
        if (defVal !== undefined) return defVal;
        return fallback;
    }

    /**
     * Lit une valeur par défaut, quelle que soit la forme sous laquelle elle
     * a été enregistrée.
     *
     * POURQUOI CE DÉTOUR. `registerDefaults()` reçoit un objet PLAT :
     * `{ 'parental.enabled': false }`. La clé littérale contient donc le
     * point. `get()` interrogeait `_getDeep(this._defaults, 'parental.enabled')`,
     * qui découpe sur le point et cherche `_defaults.parental.enabled` — une
     * branche qui n'existe pas. Résultat : les 36 valeurs par défaut
     * enregistrées au démarrage n'ont JAMAIS servi. L'application ne s'en
     * apercevait pas parce que presque tous les appels passent un repli en
     * second argument ; le registre entier était décoratif.
     *
     * On regarde donc la clé plate d'abord, puis la forme imbriquée, pour
     * accepter les deux écritures sans casser les appelants existants.
     *
     * @param {string} key
     * @returns {*} `undefined` si aucun défaut n'est enregistré.
     */
    _lireDefaut(key) {
        if (Object.prototype.hasOwnProperty.call(this._defaults, key)) {
            return this._defaults[key];
        }
        return this._getDeep(this._defaults, key);
    }

    /**
     * Définit une valeur et la persiste.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        this._setDeep(this._settings, key, value);
        this._save();
        if (this._eventBus) {
            this._eventBus.emit('settings:changed', { key, value });
        }
    }

    /**
     * Vérifie si une clé est définie par l'utilisateur (pas seulement un défaut).
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this._getDeep(this._settings, key) !== undefined;
    }

    /**
     * Supprime une valeur utilisateur (le défaut reprend le dessus).
     * @param {string} key
     */
    delete(key) {
        this._deleteDeep(this._settings, key);
        this._save();
        if (this._eventBus) {
            this._eventBus.emit('settings:changed', { key, value: undefined });
        }
    }

    /** Remet tous les settings à zéro (garde les defaults). */
    reset() {
        this._settings = {};
        this._save();
        this._log.warn('Settings réinitialisés.');
        if (this._eventBus) this._eventBus.emit('settings:reset');
    }

    /**
     * Exporte les settings utilisateur en JSON.
     * @returns {string}
     */
    export() {
        return JSON.stringify(this._settings, null, 2);
    }

    /**
     * Exporte les settings utilisateur en JSON en masquant les clés et mots de passe sensibles.
     * @returns {string}
     */
    exportSanitized() {
        const sanitized = JSON.parse(JSON.stringify(this._settings));
        const maskSecrets = (obj) => {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    maskSecrets(obj[key]);
                } else if (typeof obj[key] === 'string') {
                    const lk = key.toLowerCase();
                    if (lk.includes('key') || lk.includes('password') || lk.includes('token') || lk.includes('secret')) {
                        obj[key] = obj[key].length > 6 ? `${obj[key].slice(0, 3)}****${obj[key].slice(-2)}` : '******';
                    }
                }
            }
        };
        maskSecrets(sanitized);
        return JSON.stringify(sanitized, null, 2);
    }

    /**
     * Importe des settings depuis un JSON (fusion avec l'existant).
     *
     * AUDIT A6 — ce que cette fonction faisait avant.
     * ----------------------------------------------
     * Elle fusionnait N'IMPORTE QUEL JSON dans la configuration, sans un
     * seul contrôle. Trois conséquences, par ordre de gravité :
     *
     *   1. CONTOURNEMENT DU MODE ENFANT. Un fichier contenant
     *      `{"parental": {"enabled": false}}` désactivait le verrou parental ;
     *      `{"parental": {"pinHash": "…", "pinSalt": "…"}}` remplaçait le code
     *      par un code connu de celui qui a écrit le fichier. Le collage d'une
     *      « configuration partagée » suffisait.
     *   2. POLLUTION DE PROTOTYPE. `JSON.parse('{"__proto__": {...}}')` crée
     *      une propriété propre nommée `__proto__`, que `Object.keys` renvoie
     *      et que l'ancien `_deepMerge` affectait directement : la valeur
     *      partait sur `Object.prototype` et contaminait tout l'objet global.
     *   3. TYPES INCOHÉRENTS. Un booléen remplacé par une chaîne, un objet
     *      par un tableau : la panne survenait plus tard, ailleurs, sans lien
     *      visible avec l'import.
     *
     * Ce qui est fait maintenant : les clés dangereuses sont refusées, la
     * branche `parental` n'est jamais écrite par un import (elle se règle
     * dans l'interface, code en main), et une valeur dont le type contredit
     * le défaut enregistré est ignorée en le disant.
     *
     * @param {string|Record<string,*>} data
     * @param {Object}  [options]
     * @param {boolean} [options.inclureParental=false] Réservé à un appel
     *   interne explicite ; l'interface d'import ne l'active jamais.
     * @returns {{ ok: boolean, appliquees: number, refusees: string[], erreur?: string }}
     */
    import(data, { inclureParental = false } = {}) {
        let parsed;
        try {
            parsed = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (err) {
            this._log.error('JSON d\'import illisible.', err);
            return { ok: false, appliquees: 0, refusees: [], erreur: 'Le texte fourni n\'est pas du JSON valide.' };
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, appliquees: 0, refusees: [], erreur: 'La configuration doit être un objet JSON.' };
        }

        const refusees = [];
        const propre = this._assainirImport(parsed, '', refusees, inclureParental);
        const appliquees = this._compterFeuilles(propre);

        if (appliquees === 0) {
            return { ok: false, appliquees: 0, refusees, erreur: 'Aucun réglage exploitable dans ce fichier.' };
        }

        this._settings = this._deepMerge(this._settings, propre);
        this._save();
        this._log.info(`Settings importés : ${appliquees} valeur(s) appliquée(s), ${refusees.length} refusée(s).`);
        if (refusees.length) this._log.warn('Clés refusées à l\'import :', refusees);
        if (this._eventBus) this._eventBus.emit('settings:imported', { appliquees, refusees });
        return { ok: true, appliquees, refusees };
    }

    /**
     * Reconstruit un objet ne contenant que ce qu'on accepte d'importer.
     * Récursif, profondeur bornée : un JSON profond de 10 000 niveaux ne doit
     * pas faire déborder la pile.
     *
     * @param {*} source
     * @param {string} chemin      Chemin pointé courant, pour les messages.
     * @param {string[]} refusees  Collecteur des clés écartées.
     * @param {boolean} inclureParental
     * @param {number} [profondeur]
     * @returns {Object}
     */
    _assainirImport(source, chemin, refusees, inclureParental, profondeur = 0) {
        const sortie = {};
        if (profondeur > 12) {
            refusees.push(`${chemin} (imbrication trop profonde)`);
            return sortie;
        }
        for (const cle of Object.keys(source)) {
            const complet = chemin ? `${chemin}.${cle}` : cle;

            // Pollution de prototype : refusée à tous les niveaux.
            if (CLES_INTERDITES.has(cle)) {
                refusees.push(`${complet} (clé réservée)`);
                continue;
            }
            // Le verrou parental ne se déverrouille pas par un fichier.
            if (!inclureParental && BRANCHES_PROTEGEES.has(complet.split('.')[0])) {
                refusees.push(`${complet} (réglage protégé)`);
                continue;
            }

            const valeur = source[cle];
            if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
                const sousArbre = this._assainirImport(valeur, complet, refusees, inclureParental, profondeur + 1);
                if (Object.keys(sousArbre).length) sortie[cle] = sousArbre;
                continue;
            }

            // Contrôle de type contre le défaut enregistré, quand il existe.
            const defaut = this._lireDefaut(complet);
            if (defaut !== undefined && defaut !== null
                && !this._memeType(defaut, valeur)) {
                refusees.push(`${complet} (type ${typeof valeur}, attendu ${Array.isArray(defaut) ? 'array' : typeof defaut})`);
                continue;
            }
            sortie[cle] = valeur;
        }
        return sortie;
    }

    /** @returns {boolean} Vrai si `b` est du même type que la référence `a`. */
    _memeType(a, b) {
        if (Array.isArray(a)) return Array.isArray(b);
        if (Array.isArray(b)) return false;
        return typeof a === typeof b;
    }

    /** Compte les valeurs terminales d'un objet, pour le rapport d'import. */
    _compterFeuilles(obj, profondeur = 0) {
        if (profondeur > 12) return 0;
        let n = 0;
        for (const cle of Object.keys(obj)) {
            const v = obj[cle];
            if (v && typeof v === 'object' && !Array.isArray(v)) n += this._compterFeuilles(v, profondeur + 1);
            else n += 1;
        }
        return n;
    }

    // ─── Helpers notation pointée ────────────────────────────────────────────────

    _getDeep(obj, key) {
        return key.split('.').reduce((cur, part) => cur?.[part], obj);
    }

    _setDeep(obj, key, value) {
        const parts = key.split('.');
        const last = parts.pop();
        const target = parts.reduce((cur, part) => {
            if (cur[part] === undefined || typeof cur[part] !== 'object') cur[part] = {};
            return cur[part];
        }, obj);
        target[last] = value;
    }

    _deleteDeep(obj, key) {
        const parts = key.split('.');
        const last = parts.pop();
        const target = parts.reduce((cur, part) => cur?.[part], obj);
        if (target) delete target[last];
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            // Seconde barrière : `import()` filtre déjà, mais `_deepMerge` est
            // une primitive — elle ne doit pas dépendre de la vigilance de ses
            // appelants pour ne pas écrire sur `Object.prototype`.
            if (CLES_INTERDITES.has(key)) continue;
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
}

export default SettingsManager;
