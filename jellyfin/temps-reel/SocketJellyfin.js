/**
 * SpaceHub — Canal temps réel avec le serveur Jellyfin
 *
 * Un seul WebSocket, partagé par tout ce qui a besoin du serveur en direct :
 * devenir cible de télécommande, rafraîchir une médiathèque quand un fichier
 * est ajouté, suivre les sessions, et plus tard SyncPlay.
 *
 * L'ADRESSE. `ws(s)://serveur/socket?api_key=<jeton>&deviceId=<appareil>`. Le
 * schéma se déduit de l'URL DU SERVEUR, jamais de celle de la page : un
 * serveur en HTTPS derrière un proxy exige `wss://`, et une page HTTPS qui
 * ouvre un `ws://` est bloquée par le navigateur — sans erreur réseau lisible,
 * juste une fermeture immédiate.
 *
 * LE KEEPALIVE, ET POURQUOI C'EST LA PANNE N°1
 * --------------------------------------------
 * Le serveur applique `WebSocketLostTimeout = 60 s`. Il surveille les
 * connexions toutes les 12 s (facteur 0,2), envoie `ForceKeepAlive` après 45 s
 * de silence (facteur 0,75), et **ferme la connexion à 60 s**.
 *
 * `ForceKeepAlive` porte ce délai en secondes dans son champ `Data`. Un client
 * qui se contente d'écouter — sans jamais rien émettre — est donc déconnecté
 * toutes les minutes, se reconnecte, et paraît « instable » alors que tout
 * fonctionne comme prévu. On répond immédiatement, puis on émet un `KeepAlive`
 * à la moitié du délai annoncé.
 *
 * LA RECONNEXION. Un `onclose` qui rappelle `connecter()` produit une boucle
 * serrée dès que le serveur est éteint : des milliers de tentatives par minute,
 * sur la machine ET sur le réseau. On applique une attente qui double, plafonnée,
 * avec une part d'aléatoire — sans elle, tous les appareils d'une maison se
 * reconnectent à la même milliseconde après une coupure.
 *
 * CE QU'ON NE PEUT PAS DISTINGUER. Le WebSocket du navigateur n'expose pas le
 * code HTTP d'un échec d'ouverture : un jeton révoqué et un serveur éteint
 * produisent le même événement. On ne réessaie donc pas indéfiniment — au bout
 * d'un nombre fixé d'échecs SANS aucune ouverture réussie, on s'arrête et on le
 * dit, plutôt que de marteler un serveur qui nous refuse.
 *
 * UN PIÈGE DU SERVEUR À CONNAÎTRE. Jellyfin route un ordre de télécommande vers
 * la DERNIÈRE connexion ouverte pour un `deviceId` donné. Deux onglets de
 * SpaceHub partagent le même identifiant d'appareil : seul le dernier ouvert
 * recevra les ordres. C'est le comportement du serveur, pas un défaut d'ici —
 * mais il explique un « ça ne marche que dans un onglet » autrement
 * incompréhensible.
 */

'use strict';

import Logger from '../../core/Logger.js';

/** Le serveur ferme à 60 s de silence ; valeur de repli si `Data` est absent. */
export const DELAI_DEFAUT_S = 60;

/** Attente initiale avant une nouvelle tentative. */
export const ATTENTE_INITIALE_MS = 1000;

/** Plafond de l'attente : au-delà, on n'apprend plus rien à attendre plus. */
export const ATTENTE_MAX_MS = 30000;

/** Échecs consécutifs sans ouverture réussie avant d'abandonner. */
export const ECHECS_AVANT_ABANDON = 8;

export class SocketJellyfin {
    /**
     * @param {Object} options
     * @param {() => string} options.serveur   URL du serveur (http/https)
     * @param {() => string} options.jeton     jeton d'accès
     * @param {() => string} options.deviceId  identifiant d'appareil de la session
     * @param {Object} [options.eventBus]
     */
    constructor({ serveur, jeton, deviceId, eventBus = null } = {}) {
        this._log = new Logger('SocketJellyfin');
        this._serveur = serveur || (() => '');
        this._jeton = jeton || (() => '');
        this._deviceId = deviceId || (() => '');
        this._eventBus = eventBus;

        this._socket = null;
        this._voulu = false;          // l'utilisateur veut-il être connecté ?
        this._echecs = 0;
        this._abandonne = false;
        this._minuteurReconnexion = null;
        this._minuteurKeepAlive = null;
        /** Derniers MessageId vus : le serveur peut réémettre. */
        this._vus = new Set();
        /** @type {Map<string, Set<Function>>} */
        this._abonnes = new Map();

        this._onEnLigne = this._onEnLigne.bind(this);
        this._onVisibilite = this._onVisibilite.bind(this);
        this._ecoute = false;
    }

    /** 'ferme' | 'connexion' | 'ouvert' */
    get etat() {
        if (!this._socket) return 'ferme';
        return this._socket.readyState === 1 ? 'ouvert'
            : this._socket.readyState === 0 ? 'connexion' : 'ferme';
    }

    /** Vrai si l'on a renoncé après trop d'échecs. */
    get abandonne() { return this._abandonne; }

    /**
     * Construit l'adresse du socket.
     *
     * Exposée pour pouvoir la vérifier : c'est la première chose qui se trompe,
     * et une adresse fausse se manifeste par un silence, pas par une erreur.
     * @returns {string} vide si l'on n'a pas de quoi la construire.
     */
    adresse() {
        const serveur = String(this._serveur() || '').replace(/\/+$/, '');
        const jeton = this._jeton();
        const deviceId = this._deviceId();
        if (!serveur || !jeton || !deviceId) return '';
        // Le schéma vient du SERVEUR : `https` → `wss`, `http` → `ws`.
        const protocole = serveur.startsWith('https://') ? 'wss://' : 'ws://';
        const hote = serveur.replace(/^https?:\/\//, '');
        const params = new URLSearchParams({ api_key: jeton, deviceId });
        return `${protocole}${hote}/socket?${params}`;
    }

    /** Ouvre le canal, et le maintient ouvert. */
    connecter() {
        this._voulu = true;
        this._abandonne = false;
        this._echecs = 0;
        this._brancherEcouteursSysteme();
        this._ouvrir();
    }

    /** Ferme définitivement : plus aucune reconnexion. */
    fermer() {
        this._voulu = false;
        this._annulerMinuteurs();
        this._debrancherEcouteursSysteme();
        const socket = this._socket;
        this._socket = null;
        try { socket?.close(1000, 'fermeture volontaire'); } catch { /* déjà fermé */ }
    }

    /**
     * Émet un message.
     * @returns {boolean} faux si le canal n'est pas ouvert — l'appelant doit le
     *                    savoir plutôt que de croire son ordre parti.
     */
    envoyer(type, data = null) {
        if (this.etat !== 'ouvert') return false;
        try {
            this._socket.send(JSON.stringify({ MessageType: type, Data: data }));
            return true;
        } catch (err) {
            this._log.warn(`Envoi « ${type} » impossible :`, err?.message || err);
            return false;
        }
    }

    /**
     * S'abonne à un type de message serveur.
     * @param {string} type  ex. 'Play', 'Playstate', 'GeneralCommand'
     * @param {(data: any, message: object) => void} fn
     * @returns {() => void} pour se désabonner.
     */
    sur(type, fn) {
        if (typeof fn !== 'function') return () => {};
        if (!this._abonnes.has(type)) this._abonnes.set(type, new Set());
        this._abonnes.get(type).add(fn);
        return () => this._abonnes.get(type)?.delete(fn);
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _ouvrir() {
        if (!this._voulu || this._abandonne) return;
        if (this._socket && this._socket.readyState <= 1) return;   // déjà en route

        const url = this.adresse();
        if (!url) {
            this._log.warn('Canal temps réel : session incomplète (serveur, jeton ou appareil manquant).');
            return;
        }
        // Hors ligne : inutile d'essayer, et surtout inutile de consommer une
        // tentative du compteur d'abandon. On attendra l'événement `online`.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        try {
            this._socket = new WebSocket(url);
        } catch (err) {
            this._log.warn('Ouverture du canal impossible :', err?.message || err);
            this._programmerReconnexion();
            return;
        }

        this._socket.onopen = () => {
            this._echecs = 0;
            this._log.info('Canal temps réel ouvert.');
            this._eventBus?.emit('socket:ouvert', {});
        };
        this._socket.onmessage = (evt) => this._recevoir(evt);
        this._socket.onerror = () => { /* `onclose` suit toujours : on y traite */ };
        this._socket.onclose = (evt) => {
            this._annulerKeepAlive();
            this._socket = null;
            this._eventBus?.emit('socket:ferme', { code: evt?.code });
            if (!this._voulu) return;
            this._echecs += 1;
            if (this._echecs >= ECHECS_AVANT_ABANDON) {
                this._abandonne = true;
                this._log.warn(
                    `Canal temps réel abandonné après ${this._echecs} échecs. `
                    + 'Serveur injoignable, ou jeton refusé — le navigateur ne permet pas de les distinguer.');
                this._eventBus?.emit('socket:abandon', { echecs: this._echecs });
                return;
            }
            this._programmerReconnexion();
        };
    }

    _recevoir(evt) {
        let message;
        try {
            message = JSON.parse(evt.data);
        } catch {
            // Un message illisible n'est pas une raison de fermer le canal.
            return;
        }
        const type = message?.MessageType;
        if (!type) return;

        // Dédoublonnage : le serveur peut réémettre un message déjà traité.
        const id = message.MessageId;
        if (id) {
            if (this._vus.has(id)) return;
            this._vus.add(id);
            if (this._vus.size > 200) this._vus = new Set([...this._vus].slice(-100));
        }

        if (type === 'ForceKeepAlive') {
            this._armerKeepAlive(Number(message.Data) || DELAI_DEFAUT_S);
            return;
        }
        if (type === 'KeepAlive') return;   // écho du serveur : rien à faire

        for (const fn of this._abonnes.get(type) || []) {
            // Un abonné qui jette ne doit pas empêcher les autres d'être servis,
            // ni faire tomber le canal.
            try { fn(message.Data, message); } catch (err) {
                this._log.error(`Abonné « ${type} » a échoué :`, err);
            }
        }
        this._eventBus?.emit('socket:message', { type, data: message.Data });
    }

    /**
     * @param {number} delaiSecondes  ce que le serveur annonce dans `Data`.
     */
    _armerKeepAlive(delaiSecondes) {
        this._annulerKeepAlive();
        // Réponse immédiate : le serveur vient de nous dire qu'il n'a rien reçu
        // depuis 45 s, il en reste 15 avant la fermeture.
        this.envoyer('KeepAlive');
        // Puis à la moitié du délai : deux occasions de parler avant l'échéance.
        const periode = Math.max(5000, (delaiSecondes * 1000) / 2);
        this._minuteurKeepAlive = setInterval(() => {
            if (!this.envoyer('KeepAlive')) this._annulerKeepAlive();
        }, periode);
    }

    _annulerKeepAlive() {
        if (this._minuteurKeepAlive) {
            clearInterval(this._minuteurKeepAlive);
            this._minuteurKeepAlive = null;
        }
    }

    _programmerReconnexion() {
        if (!this._voulu || this._abandonne || this._minuteurReconnexion) return;
        const attente = this._attente();
        this._log.info(`Nouvelle tentative dans ${Math.round(attente / 1000)} s (échec ${this._echecs}).`);
        this._minuteurReconnexion = setTimeout(() => {
            this._minuteurReconnexion = null;
            this._ouvrir();
        }, attente);
    }

    /** Attente doublante, plafonnée, bruitée. */
    _attente() {
        const base = Math.min(ATTENTE_INITIALE_MS * (2 ** Math.max(0, this._echecs - 1)), ATTENTE_MAX_MS);
        // ±25 % : sans ce bruit, tous les appareils d'une maison se reconnectent
        // à la même milliseconde après une coupure de courant.
        return Math.round(base * (0.75 + Math.random() * 0.5));
    }

    _annulerMinuteurs() {
        if (this._minuteurReconnexion) { clearTimeout(this._minuteurReconnexion); this._minuteurReconnexion = null; }
        this._annulerKeepAlive();
    }

    _brancherEcouteursSysteme() {
        if (this._ecoute || typeof window === 'undefined') return;
        window.addEventListener('online', this._onEnLigne);
        document?.addEventListener?.('visibilitychange', this._onVisibilite);
        this._ecoute = true;
    }

    _debrancherEcouteursSysteme() {
        if (!this._ecoute || typeof window === 'undefined') return;
        window.removeEventListener('online', this._onEnLigne);
        document?.removeEventListener?.('visibilitychange', this._onVisibilite);
        this._ecoute = false;
    }

    /**
     * Le réseau revient : on retente TOUT DE SUITE, sans attendre le prochain
     * palier. Un appareil qui vient de retrouver le Wi-Fi n'a aucune raison
     * d'attendre trente secondes.
     */
    _onEnLigne() {
        if (!this._voulu) return;
        this._abandonne = false;
        this._echecs = 0;
        if (this._minuteurReconnexion) { clearTimeout(this._minuteurReconnexion); this._minuteurReconnexion = null; }
        this._ouvrir();
    }

    /**
     * Retour sur l'onglet. Une mise en veille de l'ordinateur ferme le socket
     * sans prévenir, et l'événement `close` peut n'arriver qu'au réveil.
     */
    _onVisibilite() {
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
        if (!this._voulu || this.etat === 'ouvert') return;
        this._onEnLigne();
    }
}

export default SocketJellyfin;
