/**
 * SpaceHub — synchronisation d'horloge avec le serveur
 *
 * POURQUOI CE FICHIER EXISTE SÉPARÉMENT
 * -------------------------------------
 * SyncPlay ne demande pas « lis maintenant » : il demande « lis À CET INSTANT
 * PRÉCIS », en donnant un horodatage SERVEUR. Trois appareils dont les horloges
 * diffèrent de deux secondes démarreront donc à deux secondes d'écart, quelle
 * que soit la qualité du reste.
 *
 * L'écart entre l'horloge locale et celle du serveur se mesure exactement comme
 * le fait NTP, sur quatre horodatages :
 *
 *     t1  la requête part          (local)
 *     t2  le serveur la reçoit     (serveur, `RequestReceptionTime`)
 *     t3  le serveur répond        (serveur, `ResponseTransmissionTime`)
 *     t4  la réponse arrive        (local)
 *
 *     décalage = ((t2 − t1) + (t3 − t4)) / 2
 *     latence  = (t4 − t1) − (t3 − t2)
 *
 * LE DÉTAIL QUI FAIT LA DIFFÉRENCE ENTRE « ÇA MARCHE » ET « ÇA MARCHE BIEN »
 * --------------------------------------------------------------------------
 * On ne fait pas la MOYENNE des mesures : on garde celle de **latence
 * minimale**. La formule ci-dessus suppose que le trajet aller et le trajet
 * retour durent autant ; la gigue du réseau brise cette hypothèse, et elle la
 * brise TOUJOURS dans le même sens — un paquet peut être retardé, jamais
 * accéléré. Une mesure lente est donc une mesure fausse, et la moyenner avec
 * les bonnes contamine le résultat. C'est le même raisonnement que NTP.
 *
 * CADENCE. Trois mesures rapprochées au démarrage — une par seconde — puis une
 * par minute. Interroger toutes les secondes en régime établi produirait 3 600
 * requêtes par heure pour corriger une dérive de quartz de quelques
 * millisecondes.
 */

'use strict';

import Logger from '../../core/Logger.js';

/** Phase gloutonne : mesures rapprochées jusqu'à en avoir assez. */
export const MESURES_INITIALES = 3;
export const PERIODE_GLOUTONNE_MS = 1000;
export const PERIODE_ENTRETIEN_MS = 60000;

/** Au-delà, la mesure est trop bruitée pour être retenue. */
export const LATENCE_MAX_MS = 2000;

export class HorlogeServeur {
    /**
     * @param {Object} options
     * @param {Object} options.api  client Jellyfin
     */
    constructor({ api } = {}) {
        this._log = new Logger('HorlogeServeur');
        this._api = api || null;
        /** @type {{decalageMs: number, latenceMs: number}|null} */
        this._meilleure = null;
        this._mesures = 0;
        this._minuteur = null;
    }

    /** Vrai dès qu'une mesure exploitable existe. */
    get calee() { return this._meilleure !== null; }

    /** Décalage local → serveur, en millisecondes. */
    get decalageMs() { return this._meilleure?.decalageMs ?? 0; }

    /** Latence de la meilleure mesure retenue. */
    get latenceMs() { return this._meilleure?.latenceMs ?? null; }

    /** Démarre les mesures et les entretient. */
    demarrer() {
        this.arreter();
        this._mesures = 0;
        this._programmer(0);
    }

    arreter() {
        if (this._minuteur) { clearTimeout(this._minuteur); this._minuteur = null; }
    }

    /** Oublie tout : appelé quand on change de serveur. */
    reinitialiser() {
        this.arreter();
        this._meilleure = null;
        this._mesures = 0;
    }

    /**
     * Convertit un horodatage SERVEUR en horodatage local.
     * @param {string|number|Date} instantServeur
     * @returns {number|null} millisecondes locales, ou `null` si illisible.
     */
    versLocal(instantServeur) {
        const t = this._ms(instantServeur);
        if (t === null) return null;
        return t - this.decalageMs;
    }

    /** L'heure serveur, maintenant. */
    maintenantServeur() { return Date.now() + this.decalageMs; }

    /**
     * Effectue UNE mesure.
     *
     * @returns {Promise<{decalageMs: number, latenceMs: number}|null>}
     */
    async mesurer() {
        if (!this._api?.get) return null;
        const t1 = Date.now();
        let rep;
        try {
            rep = await this._api.get('/SyncPlay/Time');
        } catch {
            return null;
        }
        const t4 = Date.now();

        const t2 = this._ms(rep?.RequestReceptionTime);
        const t3 = this._ms(rep?.ResponseTransmissionTime);
        if (t2 === null || t3 === null) return null;

        const decalageMs = ((t2 - t1) + (t3 - t4)) / 2;
        // La latence retire le temps passé DANS le serveur : deux appareils sur
        // le même réseau doivent obtenir la même valeur même si le serveur est
        // chargé.
        const latenceMs = (t4 - t1) - (t3 - t2);

        if (!Number.isFinite(decalageMs) || !Number.isFinite(latenceMs)) return null;
        if (latenceMs < 0 || latenceMs > LATENCE_MAX_MS) {
            // Latence négative : les horloges ont bougé pendant la mesure, ou
            // le serveur a horodaté de travers. On jette plutôt que de caler
            // l'horloge sur une absurdité.
            return null;
        }

        const mesure = { decalageMs, latenceMs };
        // ON GARDE LA MEILLEURE, ON NE MOYENNE PAS. Voir l'en-tête : la gigue
        // ne retarde jamais moins que zéro, une mesure lente est donc fausse.
        if (!this._meilleure || latenceMs < this._meilleure.latenceMs) {
            this._meilleure = mesure;
            this._log.info(
                `Horloge calée : décalage ${Math.round(decalageMs)} ms, latence ${Math.round(latenceMs)} ms.`);
        }
        return mesure;
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _programmer(delai) {
        this._minuteur = setTimeout(async () => {
            await this.mesurer();
            this._mesures += 1;
            // Phase gloutonne tant qu'on n'a pas assez de mesures, entretien
            // ensuite : 3 600 requêtes par heure pour une dérive de quartz de
            // quelques millisecondes serait absurde.
            const suivant = this._mesures < MESURES_INITIALES
                ? PERIODE_GLOUTONNE_MS
                : PERIODE_ENTRETIEN_MS;
            this._programmer(suivant);
        }, delai);
    }

    /** Accepte une date ISO, un nombre de millisecondes ou un Date. */
    _ms(valeur) {
        if (valeur instanceof Date) return valeur.getTime();
        if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
        if (typeof valeur === 'string') {
            const t = Date.parse(valeur);
            return Number.isFinite(t) ? t : null;
        }
        return null;
    }
}

export default HorlogeServeur;
