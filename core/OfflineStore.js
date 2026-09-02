/**
 * SpaceHub — Stockage hors-ligne
 * Version: 1.0.0
 *
 * Ce que ce module garde, et où
 * -----------------------------
 * Deux magasins IndexedDB :
 *   - `medias` : le fichier lui-même, en Blob. Un Blob volumineux est adossé au
 *     disque par le navigateur, pas au tas JavaScript — c'est ce qui rend un
 *     film de plusieurs gigaoctets stockable sans faire exploser la mémoire.
 *   - `fiches` : les métadonnées (titre, affiche, durée, taille, expiration,
 *     position de lecture). Séparées volontairement : lister les téléchargements
 *     ne doit jamais charger les Blobs.
 *
 * Sur le chiffrement — la question honnête
 * ----------------------------------------
 * J'avais annoncé le chiffrement des médias comme prérequis. Après examen, je
 * ne l'implémente pas, et voici pourquoi plutôt qu'un silence :
 *
 * Chiffrer dans le navigateur suppose d'y garder aussi la clé. Quiconque peut
 * lire IndexedDB peut lire la clé au même endroit : le chiffrement ne protège
 * de personne, il ajoute du code, du coût de calcul, et surtout l'illusion
 * d'une protection. Ce qui protège réellement ces fichiers, c'est le
 * cloisonnement par origine du navigateur, qui s'applique déjà.
 *
 * Ce qui a un effet réel, et qui est fait :
 *   - **aucun jeton n'est stocké** avec le média. Un téléchargement volé ne
 *     donne accès ni au serveur ni au compte ;
 *   - **une date d'expiration** est portée par chaque fiche et vérifiée à la
 *     lecture, pas seulement au ménage : un média expiré ne se lit pas, même si
 *     la purge n'est pas encore passée ;
 *   - **la purge** est déclenchée à l'ouverture et supprime ce qui a expiré.
 *
 * Un stockage vraiment opaque suppose une application native. C'est une limite
 * du navigateur, pas un raccourci que j'ai pris.
 */

'use strict';

import Logger from './Logger.js';

const BASE = 'spacehub-offline';
const VERSION = 1;
const MEDIAS = 'medias';
const FICHES = 'fiches';

class OfflineStore {
    constructor({ eventBus = null } = {}) {
        this._log = new Logger('OfflineStore');
        this._eventBus = eventBus;
        this._db = null;
    }

    /** Le navigateur sait-il faire ? (IndexedDB peut manquer en navigation privée) */
    static estDisponible() {
        return typeof indexedDB !== 'undefined';
    }

    async _ouvrir() {
        if (this._db) return this._db;
        this._db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(BASE, VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(MEDIAS)) db.createObjectStore(MEDIAS);
                if (!db.objectStoreNames.contains(FICHES)) db.createObjectStore(FICHES);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this._db;
    }

    _tx(magasins, mode) {
        return this._ouvrir().then(db => db.transaction(magasins, mode));
    }

    _promesse(requete) {
        return new Promise((resolve, reject) => {
            requete.onsuccess = () => resolve(requete.result);
            requete.onerror = () => reject(requete.error);
        });
    }

    // ─── Quota ───────────────────────────────────────────────────────────────

    /**
     * Place disponible, en octets.
     *
     * `navigator.storage.estimate()` renvoie un quota volontairement approximatif
     * (le navigateur ne veut pas qu'on l'utilise pour identifier l'appareil).
     * On l'utilise donc pour prévenir, jamais pour décider seul : un téléchargement
     * qui dépasse est signalé à l'utilisateur, pas refusé en silence.
     */
    async quota() {
        try {
            const est = await navigator.storage?.estimate?.();
            if (!est) return { utilise: 0, total: 0, disponible: 0, connu: false };
            return {
                utilise: est.usage || 0,
                total: est.quota || 0,
                disponible: Math.max(0, (est.quota || 0) - (est.usage || 0)),
                connu: true,
            };
        } catch {
            return { utilise: 0, total: 0, disponible: 0, connu: false };
        }
    }

    /**
     * Demande au navigateur de ne pas effacer ce stockage sous pression disque.
     *
     * Sans cela, les téléchargements sont « au mieux » : le navigateur peut les
     * supprimer sans prévenir. Le résultat est renvoyé pour pouvoir le dire à
     * l'utilisateur plutôt que de le laisser croire à une garantie.
     */
    async demanderPersistance() {
        try {
            if (await navigator.storage?.persisted?.()) return true;
            return (await navigator.storage?.persist?.()) === true;
        } catch {
            return false;
        }
    }

    // ─── Écriture ────────────────────────────────────────────────────────────

    /**
     * @param {string} id      identifiant Jellyfin
     * @param {Blob} blob      le média
     * @param {Object} fiche   métadonnées (titre, type, affiche, durée, expireLe…)
     */
    async enregistrer(id, blob, fiche) {
        const tx = await this._tx([MEDIAS, FICHES], 'readwrite');
        tx.objectStore(MEDIAS).put(blob, id);
        tx.objectStore(FICHES).put({
            ...fiche,
            id,
            octets: blob.size,
            type: blob.type || 'video/mp4',
            telechargeLe: Date.now(),
        }, id);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        this._eventBus?.emit('offline:changed', { id, action: 'ajout' });
        this._log.info(`Média « ${fiche?.titre || id} » enregistré (${(blob.size / 1048576).toFixed(0)} Mo).`);
    }

    async supprimer(id) {
        const tx = await this._tx([MEDIAS, FICHES], 'readwrite');
        tx.objectStore(MEDIAS).delete(id);
        tx.objectStore(FICHES).delete(id);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        this._eventBus?.emit('offline:changed', { id, action: 'suppression' });
    }

    async vider() {
        const tx = await this._tx([MEDIAS, FICHES], 'readwrite');
        tx.objectStore(MEDIAS).clear();
        tx.objectStore(FICHES).clear();
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        this._eventBus?.emit('offline:changed', { action: 'vidage' });
    }

    // ─── Lecture ─────────────────────────────────────────────────────────────

    /** Fiche seule — ne charge pas le Blob. */
    async fiche(id) {
        const tx = await this._tx([FICHES], 'readonly');
        return this._promesse(tx.objectStore(FICHES).get(id));
    }

    /** Toutes les fiches, les plus récentes d'abord. */
    async lister() {
        const tx = await this._tx([FICHES], 'readonly');
        const fiches = await this._promesse(tx.objectStore(FICHES).getAll());
        return (fiches || []).sort((a, b) => (b.telechargeLe || 0) - (a.telechargeLe || 0));
    }

    async existe(id) {
        return Boolean(await this.fiche(id));
    }

    /**
     * Le média est-il utilisable maintenant ?
     * Un média expiré est traité comme absent — l'expiration est vérifiée ICI,
     * et pas seulement au moment de la purge : sinon un appareil resté longtemps
     * hors ligne lirait indéfiniment des téléchargements périmés.
     */
    async estUtilisable(id) {
        const f = await this.fiche(id);
        if (!f) return false;
        if (f.expireLe && Date.now() > f.expireLe) return false;
        return true;
    }

    /** Blob du média, ou null s'il est absent ou expiré. */
    async media(id) {
        if (!(await this.estUtilisable(id))) return null;
        const tx = await this._tx([MEDIAS], 'readonly');
        return (await this._promesse(tx.objectStore(MEDIAS).get(id))) || null;
    }

    /**
     * URL lisible par un élément <video>.
     * L'appelant DOIT appeler `URL.revokeObjectURL` : sans cela le Blob reste
     * référencé et le navigateur ne peut pas libérer la place à la suppression.
     */
    async urlObjet(id) {
        const blob = await this.media(id);
        return blob ? URL.createObjectURL(blob) : null;
    }

    // ─── Entretien ───────────────────────────────────────────────────────────

    /** Supprime les médias expirés. Renvoie la liste des identifiants purgés. */
    async purger() {
        const fiches = await this.lister();
        const expires = fiches.filter(f => f.expireLe && Date.now() > f.expireLe);
        for (const f of expires) await this.supprimer(f.id);
        if (expires.length) {
            this._log.info(`${expires.length} téléchargement(s) expiré(s) supprimé(s).`);
        }
        return expires.map(f => f.id);
    }

    /** Place occupée par les téléchargements, en octets. */
    async placeUtilisee() {
        const fiches = await this.lister();
        return fiches.reduce((n, f) => n + (f.octets || 0), 0);
    }

    /** Met à jour la position de lecture, pour reprendre hors ligne. */
    async memoriserPosition(id, secondes) {
        const f = await this.fiche(id);
        if (!f) return;
        const tx = await this._tx([FICHES], 'readwrite');
        tx.objectStore(FICHES).put({ ...f, positionSecondes: secondes }, id);
    }
}

export default OfflineStore;
