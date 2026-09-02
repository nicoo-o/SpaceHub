/**
 * SpaceHub — Frontière d'erreur
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit relevait que beaucoup de `catch` journalisent puis continuent sans
 * rien dire à l'utilisateur, et qu'aucune frontière globale n'existe : une
 * exception pendant le montage d'un widget laisse l'écran à moitié rendu, sans
 * message et sans moyen de réessayer. L'utilisateur voit un trou et ne peut
 * qu'imaginer ce qui s'est passé.
 *
 * Deux niveaux, volontairement distincts :
 *
 *   1. `mount()` — frontière LOCALE. Une panne de widget reste dans le widget :
 *      une carte de repli prend sa place, nomme ce qui a échoué et propose de
 *      réessayer. Le reste de l'écran est intact.
 *
 *   2. `install()` — filet GLOBAL pour ce qui échappe à tout `try`. Il ne
 *      masque rien : il journalise, prévient discrètement, et laisse
 *      l'application debout au lieu de la laisser dans un état indéterminé.
 *
 * Ce que ce fichier ne fait PAS : avaler les erreurs en silence. Chaque panne
 * reste visible dans la console avec sa trace d'origine.
 */

'use strict';

import Logger from './Logger.js';

import './ErrorBoundary.css';

import * as svc from './services.js';
class ErrorBoundary {
    constructor({ eventBus = null, toaster = null } = {}) {
        this._log = new Logger('ErrorBoundary');
        this._eventBus = eventBus;
        this._toaster = toaster;
        this._installed = false;
        this._recentes = new Map();      // message → horodatage, pour ne pas spammer
        this._onError = this._onError.bind(this);
        this._onRejection = this._onRejection.bind(this);
    }

    /** Installe le filet global. Idempotent. */
    install() {
        if (this._installed) return;
        this._installed = true;
        window.addEventListener('error', this._onError);
        window.addEventListener('unhandledrejection', this._onRejection);
        this._log.info('Frontière d\'erreur globale installée.');
    }

    destroy() {
        window.removeEventListener('error', this._onError);
        window.removeEventListener('unhandledrejection', this._onRejection);
        this._installed = false;
    }

    _onError(event) {
        // Les erreurs de chargement de ressource (image cassée) remontent aussi
        // ici mais n'ont pas d'objet Error : elles ne concernent pas ce filet.
        if (!event?.error) return;
        this._signaler(event.error, 'exception non rattrapée');
    }

    _onRejection(event) {
        this._signaler(event?.reason, 'promesse rejetée sans catch');
    }

    _signaler(erreur, origine) {
        const message = erreur?.message || String(erreur || 'erreur inconnue');
        this._log.error(`[${origine}]`, erreur);

        // Une même erreur qui se répète en boucle (par exemple dans une
        // animation) ne doit pas produire vingt notifications.
        const maintenant = Date.now();
        const vue = this._recentes.get(message);
        if (vue && maintenant - vue < 10000) return;
        this._recentes.set(message, maintenant);
        if (this._recentes.size > 40) this._recentes.clear();

        this._eventBus?.emit('app:error', { message, origine });
        try {
            const toaster = this._toaster || svc.toaster();
            toaster?.show?.(`Un problème est survenu : ${message}`, 'error');
        } catch { /* le filet ne doit jamais être la cause d'une panne */ }
    }

    /**
     * Frontière locale : exécute `travail` et, s'il échoue, remplace le contenu
     * de `conteneur` par une carte de repli au lieu de laisser un trou.
     *
     * @param {HTMLElement} conteneur  Où le résultat devait s'afficher.
     * @param {Function}    travail    Fonction (éventuellement asynchrone) à protéger.
     * @param {Object}     [options]
     * @param {string}     [options.nom]      Nom lisible de ce qui a échoué.
     * @param {boolean}    [options.reessayer] Proposer un bouton « Réessayer » (défaut : oui).
     * @returns {Promise<{ok: boolean, valeur?: any, erreur?: Error}>}
     */
    async mount(conteneur, travail, { nom = 'Ce contenu', reessayer = true } = {}) {
        try {
            const valeur = await travail();
            return { ok: true, valeur };
        } catch (erreur) {
            this._log.error(`Échec du montage de « ${nom} » :`, erreur);
            this._eventBus?.emit('app:mount-failed', { nom, message: erreur?.message });
            if (conteneur) this._rendreRepli(conteneur, nom, erreur, reessayer ? travail : null);
            return { ok: false, erreur };
        }
    }

    _rendreRepli(conteneur, nom, erreur, travail) {
        const carte = document.createElement('div');
        carte.className = 'sh-error-card';
        carte.setAttribute('role', 'alert');

        const titre = document.createElement('p');
        titre.className = 'sh-error-card__title';
        titre.textContent = `${nom} n'a pas pu s'afficher.`;

        const detail = document.createElement('p');
        detail.className = 'sh-error-card__detail';
        // textContent, jamais innerHTML : le message peut venir du serveur.
        detail.textContent = erreur?.message || 'Erreur inconnue.';

        carte.append(titre, detail);

        if (travail) {
            const bouton = document.createElement('button');
            bouton.className = 'sh-btn sh-btn--ghost sh-error-card__retry';
            bouton.textContent = 'Réessayer';
            bouton.setAttribute('tabindex', '0');
            bouton.setAttribute('data-nav-focusable', 'true');
            bouton.addEventListener('click', () => {
                conteneur.innerHTML = '';
                this.mount(conteneur, travail, { nom });
            });
            carte.appendChild(bouton);
        }

        conteneur.innerHTML = '';
        conteneur.appendChild(carte);
    }
}

export default ErrorBoundary;
