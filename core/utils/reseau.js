/**
 * SpaceHub — Utilitaires réseau
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit (constat B6) a relevé sept appels `fetch` qui contournent
 * `core/ApiClient.js` : l'authentification Jellyfin, l'API qBittorrent, et les
 * webhooks Discord/Telegram. Ils ont de bonnes raisons de ne pas passer par le
 * client (schéma d'authentification différent, repli sur le proxy, service
 * tiers), mais ils héritaient d'un défaut commun : AUCUN DÉLAI D'ATTENTE.
 *
 * Un `fetch` sans `signal` n'abandonne jamais de lui-même dans un délai utile.
 * Concrètement : un NAS éteint, un pare-feu qui laisse tomber les paquets sans
 * répondre, et l'appel reste en suspens — le bouton « Se connecter » tourne
 * indéfiniment, la synchronisation qBittorrent ne rend jamais la main, et la
 * notification bloque la file d'événements. Ce n'était visible dans aucun
 * journal : la promesse n'échoue pas, elle n'aboutit simplement pas.
 *
 * `fetchAvecDelai` corrige cela sans rien changer d'autre au comportement des
 * appelants : même signature, même réponse, mais une erreur explicite au bout
 * du délai.
 */

'use strict';

/** Délai par défaut. Assez large pour un NAS lent, assez court pour être humain. */
export const DELAI_DEFAUT_MS = 15000;

/**
 * `fetch` avec plafond de temps.
 *
 * @param {string|URL} url
 * @param {RequestInit} [options]      Options passées telles quelles à `fetch`.
 * @param {number} [delaiMs]           Plafond en millisecondes.
 * @returns {Promise<Response>}
 * @throws {Error} `err.nomCourt === 'delai-depasse'` si le plafond est atteint.
 */
export async function fetchAvecDelai(url, options = {}, delaiMs = DELAI_DEFAUT_MS) {
    // Un appelant qui fournit déjà son propre signal garde la main : on
    // n'écrase pas son abandon, on ajoute seulement le nôtre s'il n'y en a pas.
    if (options.signal) return fetch(url, options);

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), delaiMs);
    try {
        return await fetch(url, { ...options, signal: controleur.signal });
    } catch (err) {
        if (err?.name === 'AbortError') {
            const depasse = new Error(
                `Aucune réponse après ${Math.round(delaiMs / 1000)} s. `
                + 'Le serveur est peut-être éteint ou injoignable depuis ce réseau.');
            depasse.nomCourt = 'delai-depasse';
            depasse.cause = err;
            throw depasse;
        }
        throw err;
    } finally {
        clearTimeout(minuteur);
    }
}

/**
 * Vrai si le navigateur se sait hors ligne.
 *
 * `navigator.onLine === false` est FIABLE (pas d'interface réseau) ; `true`
 * ne prouve rien (connecté à un routeur sans Internet). On ne s'en sert donc
 * que pour éviter des tentatives certainement vaines, jamais pour affirmer
 * que la connexion fonctionne.
 *
 * @returns {boolean}
 */
export function estHorsLigne() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export default { fetchAvecDelai, estHorsLigne, DELAI_DEFAUT_MS };
