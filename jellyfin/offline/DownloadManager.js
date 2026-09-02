/**
 * SpaceHub — Téléchargements hors-ligne
 * Version: 1.0.0
 *
 * Ce que ce module fait
 * ---------------------
 * Télécharge un média Jellyfin en flux, le range dans OfflineStore, et rend
 * compte de la progression. Un seul téléchargement à la fois : sur une liaison
 * domestique, deux téléchargements simultanés ne vont pas plus vite, ils se
 * partagent la bande passante et rendent la progression illisible. Les suivants
 * attendent leur tour dans une file.
 *
 * Le point délicat : la mémoire
 * -----------------------------
 * L'écriture naïve — accumuler tous les morceaux dans un tableau puis appeler
 * `new Blob(morceaux)` — garde le fichier entier dans le tas JavaScript pendant
 * toute la durée du téléchargement. Sur un film de 4 Go, l'onglet meurt avant
 * la fin.
 *
 * Ici les morceaux sont repliés dans le Blob tous les 8 Mo. Un Blob volumineux
 * est adossé au disque par le navigateur : le tas ne dépasse donc jamais la
 * taille d'un palier, quelle que soit celle du film.
 *
 * Ce qui est demandé au serveur
 * -----------------------------
 * `/Videos/{id}/stream?static=true`, c'est-à-dire **le fichier tel quel**, sans
 * transcodage. C'est délibéré : un téléchargement transcodé coûterait du CPU
 * serveur pendant des minutes et donnerait une copie dégradée. Si le fichier
 * n'est pas lisible par l'appareil, mieux vaut que la lecture hors ligne échoue
 * franchement que de stocker une version abîmée.
 */

'use strict';

import Logger from '../../core/Logger.js';
import * as svc from '../../core/services.js';

/** Taille d'un palier avant repli dans le Blob (8 Mo). */
const PALIER = 8 * 1024 * 1024;

/** Durée de validité par défaut d'un téléchargement : 30 jours. */
const VALIDITE_MS = 30 * 24 * 3600 * 1000;

/** Au-delà, on prévient avant de lancer : c'est beaucoup pour un navigateur. */
const SEUIL_AVERTISSEMENT = 3 * 1024 * 1024 * 1024;

class DownloadManager {
    /**
     * @param {Object} options
     * @param {import('../../core/OfflineStore.js').default} options.store
     * @param {Object} [options.auth]
     * @param {Object} [options.eventBus]
     * @param {Object} [options.settings]
     */
    constructor({ store, auth = null, eventBus = null, settings = null } = {}) {
        this._log = new Logger('Downloads');
        this._store = store;
        this._auth = auth;
        this._eventBus = eventBus;
        this._settings = settings;

        /** @type {Array<{item: Object, resolve: Function, reject: Function}>} */
        this._file = [];
        this._encours = null;      // { id, titre, recus, total, controleur }
        this._traite = false;
    }

    /** État courant, pour l'interface. */
    etat() {
        return {
            encours: this._encours
                ? {
                    id: this._encours.id,
                    titre: this._encours.titre,
                    recus: this._encours.recus,
                    total: this._encours.total,
                    pourcent: this._encours.total
                        ? Math.round((this._encours.recus / this._encours.total) * 100)
                        : null,
                }
                : null,
            enAttente: this._file.map(t => ({ id: t.item?.Id, titre: t.item?.Name })),
        };
    }

    /**
     * Met un média en file de téléchargement.
     * @returns {Promise<{ok: boolean, raison?: string}>} résolue à la fin du transfert
     */
    async telecharger(item) {
        const id = item?.Id || item?.id;
        if (!id) return { ok: false, raison: 'Média sans identifiant.' };

        if (await this._store.existe(id)) {
            return { ok: false, raison: 'Déjà téléchargé.' };
        }
        if (this._encours?.id === id || this._file.some(t => (t.item?.Id || t.item?.id) === id)) {
            return { ok: false, raison: 'Déjà en file d\'attente.' };
        }

        const promesse = new Promise((resolve, reject) => {
            this._file.push({ item, resolve, reject });
        });
        this._emettre();
        this._traiterFile();
        return promesse;
    }

    /** Annule le téléchargement en cours, ou retire un élément de la file. */
    annuler(id) {
        if (this._encours?.id === id) {
            this._encours.controleur.abort();
            return true;
        }
        const i = this._file.findIndex(t => (t.item?.Id || t.item?.id) === id);
        if (i !== -1) {
            const [t] = this._file.splice(i, 1);
            t.resolve({ ok: false, raison: 'Annulé.' });
            this._emettre();
            return true;
        }
        return false;
    }

    async _traiterFile() {
        if (this._traite || this._file.length === 0) return;
        this._traite = true;
        while (this._file.length) {
            const tache = this._file.shift();
            try {
                const res = await this._transferer(tache.item);
                tache.resolve(res);
            } catch (err) {
                tache.resolve({ ok: false, raison: err?.message || 'Échec du téléchargement.' });
            }
        }
        this._traite = false;
        this._emettre();
    }

    async _transferer(item) {
        const id = item.Id || item.id;
        const titre = item.Name || 'Média';
        const serveur = (this._auth?.getServerUrl?.() || '').replace(/\/$/, '');
        const jeton = this._auth?.getToken?.() || '';
        if (!serveur || !jeton) return { ok: false, raison: 'Session Jellyfin absente.' };

        // Le fichier tel quel : pas de transcodage pour un téléchargement.
        const url = `${serveur}/Videos/${encodeURIComponent(id)}/stream?static=true`;
        const controleur = new AbortController();
        this._encours = { id, titre, recus: 0, total: 0, controleur };
        this._emettre();

        try {
            const reponse = await fetch(url, {
                // Le jeton passe par un en-tête, jamais par l'URL : un
                // téléchargement n'a pas la contrainte de l'élément <video>.
                headers: { Authorization: `MediaBrowser Token="${jeton}"` },
                signal: controleur.signal,
            });
            if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}.`);

            const total = Number(reponse.headers.get('Content-Length')) || 0;
            this._encours.total = total;

            const place = await this._store.quota();
            if (place.connu && total && total > place.disponible) {
                throw new Error(
                    `Place insuffisante : ${(total / 1073741824).toFixed(1)} Go nécessaires, `
                    + `${(place.disponible / 1073741824).toFixed(1)} Go disponibles.`);
            }
            if (total > SEUIL_AVERTISSEMENT) {
                this._log.warn(`« ${titre} » pèse ${(total / 1073741824).toFixed(1)} Go — transfert long.`);
            }

            const typeMime = reponse.headers.get('Content-Type') || 'video/mp4';
            const blob = await this._lireEnBlob(reponse, typeMime);

            const validite = Number(this._settings?.get?.('offline.validityDays', 30)) || 30;
            await this._store.enregistrer(id, blob, {
                titre,
                type: item.Type || 'Video',
                serie: item.SeriesName || null,
                saison: item.ParentIndexNumber ?? null,
                episode: item.IndexNumber ?? null,
                afficheTag: item.ImageTags?.Primary || null,
                dureeTicks: item.RunTimeTicks || 0,
                expireLe: Date.now() + validite * 24 * 3600 * 1000,
            });

            this._eventBus?.emit('offline:downloaded', { id, titre });
            return { ok: true };
        } catch (err) {
            if (err?.name === 'AbortError') {
                this._log.info(`Téléchargement de « ${titre} » annulé.`);
                return { ok: false, raison: 'Annulé.' };
            }
            this._log.error(`Échec du téléchargement de « ${titre} » :`, err);
            return { ok: false, raison: err?.message || 'Échec du téléchargement.' };
        } finally {
            this._encours = null;
            this._emettre();
        }
    }

    /**
     * Lit la réponse en flux et replie régulièrement dans le Blob.
     * C'est ce repli qui borne l'usage mémoire, quelle que soit la taille.
     */
    async _lireEnBlob(reponse, typeMime) {
        if (!reponse.body?.getReader) {
            // Navigateur sans flux lisible : repli sans progression.
            return await reponse.blob();
        }
        const lecteur = reponse.body.getReader();
        let blob = new Blob([], { type: typeMime });
        let paliers = [];
        let taillePalier = 0;

        for (;;) {
            const { done, value } = await lecteur.read();
            if (done) break;
            paliers.push(value);
            taillePalier += value.byteLength;
            this._encours.recus += value.byteLength;

            if (taillePalier >= PALIER) {
                blob = new Blob([blob, ...paliers], { type: typeMime });
                paliers = [];
                taillePalier = 0;
                this._emettre();
            }
        }
        if (paliers.length) blob = new Blob([blob, ...paliers], { type: typeMime });
        // Dernière émission : sans elle la barre s'arrête au dernier palier
        // (67 % sur un fichier de 12 Mo) et disparaît sans jamais afficher 100 %,
        // ce qui laisse croire à un téléchargement interrompu.
        this._emettre();
        return blob;
    }

    _emettre() {
        this._eventBus?.emit('offline:progress', this.etat());
    }

    // ─── Confort ─────────────────────────────────────────────────────────────

    /** Supprime un téléchargement et prévient l'interface. */
    async supprimer(id) {
        await this._store.supprimer(id);
        svc.toaster()?.info?.('Téléchargement supprimé.');
    }

    /** Liste, avec la place occupée et le temps restant avant expiration. */
    async lister() {
        const fiches = await this._store.lister();
        return fiches.map(f => ({
            ...f,
            expire: f.expireLe ? Date.now() > f.expireLe : false,
            joursRestants: f.expireLe
                ? Math.max(0, Math.ceil((f.expireLe - Date.now()) / 86400000))
                : null,
        }));
    }
}

export default DownloadManager;
