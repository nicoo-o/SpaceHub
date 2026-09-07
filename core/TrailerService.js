/**
 * SpaceHub — TrailerService
 *
 * Résolution et lecture des bandes-annonces, sans iframe externe brute :
 * 1. Trailers LOCAUX du serveur Jellyfin → lus dans notre VideoPlayer (flux authentifié)
 * 2. Repli YouTube (« de base ») : URL RemoteTrailer des métadonnées Jellyfin,
 *    sinon recherche par titre — affichée dans une fenêtre dédiée au design
 *    SpaceHub (barre de titre, glassmorphism, fermeture TV/Échap).
 *
 * Usage : TrailerService.open({ Id, Name }) — la première source part
 * IMMÉDIATEMENT ; s'il y en a d'autres, un bouton « Suivante » les enchaîne
 * depuis le lecteur.
 *
 * Il y avait auparavant un menu de choix flottant. Deux défauts, signalés en
 * usage réel : il imposait un clic pour rien dans l'immense majorité des cas
 * (on veut voir la bande-annonce, pas choisir laquelle), et il était positionné
 * en coordonnées de page à partir d'un rectangle de VIEWPORT — il partait donc
 * à la dérive dès qu'on touchait à la molette. Choisir se fait maintenant
 * pendant la lecture, là où on peut juger.
 */

'use strict';

import Logger from './Logger.js';

import './TrailerService.css';
import { escapeHtml , apresSortie } from './utils/domUtils.js';
import * as svc from './services.js';
import inputRouter, { PRIORITES } from './InputRouter.js';
import { fetchAvecDelai } from './utils/reseau.js';
class TrailerService {
    constructor() {
        this._log = new Logger('TrailerService');
        this._window = null;
        /** Toutes les sources du média en cours, et celle qui joue. */
        this._sources = [];
        this._sourceIndex = 0;
        this._injectStyles();
        this._onKeydown = (e) => {
            if (e.key === 'Escape') this.close();
        };
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans TrailerService.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }

    _getAuth() {
        const auth = svc.auth();
        return {
            base: (auth?.getServerUrl?.() || '').replace(/\/$/, ''),
            userId: auth?.getUserId?.() || '',
            headers: auth?.getAuthHeaders?.() || {}
        };
    }

    /** Extraction de l'ID YouTube depuis n'importe quel format d'URL. */
    extractYoutubeId(url) {
        if (!url || typeof url !== 'string') return null;
        const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
        return m ? m[1] : null;
    }

    /**
     * Résout toutes les sources de bande-annonce d'un média.
     * Les cartes Jellyfin ne portent pas RemoteTrailers : on récupère les
     * métadonnées complètes au besoin pour proposer les vraies URLs officielles.
     * @param {{Id: string, Name?: string, RemoteTrailers?: Array<{Url?: string, Name?: string}>}} item
     * @returns {Promise<Array<{type: 'local'|'youtube', label: string, trailerItem?: Object, videoId?: string}>>}
     */
    async resolve(item) {
        if (!item?.Id) return [];
        const sources = [];
        const { base, userId, headers } = this._getAuth();

        // Les listes/cartes ne demandent pas le champ RemoteTrailers → fetch ciblé.
        let full = item;
        if (!Array.isArray(item?.RemoteTrailers) && base && userId) {
            try {
                const res = await fetchAvecDelai(`${base}/Users/${userId}/Items/${item.Id}?Fields=RemoteTrailers`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data?.RemoteTrailers)) full = { ...item, RemoteTrailers: data.RemoteTrailers };
                }
            } catch {
                // Le média reste avec ses champs fournis.
            }
        }

        // 1. Trailers locaux du serveur Jellyfin (vrais items jouables, lus dans notre player)
        try {
            if (base && userId) {
                const res = await fetchAvecDelai(`${base}/Users/${userId}/Items/${item.Id}/Trailers`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    const locals = Array.isArray(data?.Items) ? data.Items.filter(t => t?.Id) : [];
                    locals.slice(0, 4).forEach((t, i) => {
                        sources.push({
                            type: 'local',
                            label: locals.length > 1 ? `Version serveur ${i + 1}` : 'Version du serveur',
                            trailerItem: t
                        });
                    });
                }
            }
        } catch {
            // Serveur injoignable : on continue avec les sources distantes.
        }

        // 2. RemoteTrailers officiels — curation : uniquement les vrais trailers/teasers,
        //    jamais les clips promo (« Get Tickets », « Watch at Home »…).
        const remotes = Array.isArray(full?.RemoteTrailers) ? full.RemoteTrailers : [];
        const scored = remotes
            .map(r => {
                const n = String(r?.Name || '').toLowerCase();
                let score = 0;
                if (/official\s+trailer/.test(n)) score = 4;
                else if (/\btrailer\b/.test(n)) score = 3;
                else if (/teaser/.test(n)) score = 2;
                return { r, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
        scored.forEach(({ r }) => {
            const videoId = this.extractYoutubeId(r?.Url);
            if (!videoId) {
                // URL sans ID exploitable : repli recherche YouTube par titre.
                if (sources.length === 0 && item?.Name) {
                    sources.push({ type: 'youtube', label: 'Recherche YouTube', videoId: null, searchTitle: item.Name });
                }
                return;
            }
            if (!sources.some(s => s.videoId === videoId)) {
                const name = String(r?.Name || '').trim();
                sources.push({
                    type: 'youtube',
                    label: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Bande-annonce YouTube',
                    videoId
                });
            }
        });
        // RemoteTrailers sans nom exploitable ( Jellyfin fournit souvent Name: null ) :
        // curation par vidéo — on garde les URLs « watch » qui sont de vrais trailers,
        // filtrées contre les patterns promo connus, max 3 entrées.
        if (scored.length === 0 && sources.length === 0) {
            const promoPattern = /(tickets|in cinemas|in theaters|watch at home|home release|now streaming|big game|spot|clip|featurette|behind|interview|cast announce|premiere|event|podcast|reaction|contest|prom)/i;
            remotes
                .map(r => ({ r, videoId: this.extractYoutubeId(r?.Url) }))
                .filter(x => x.videoId && !promoPattern.test(String(x.r?.Name || '')))
                .slice(0, 3)
                .forEach(({ r, videoId }) => {
                    if (!sources.some(s => s.videoId === videoId)) {
                        const name = String(r?.Name || '').trim();
                        sources.push({
                            type: 'youtube',
                            label: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Bande-annonce YouTube',
                            videoId
                        });
                    }
                });
        }

        // 3. Dernier recours : recherche YouTube par titre (comportement « de base »)
        if (sources.length === 0 && item?.Name) {
            sources.push({ type: 'youtube', label: 'Recherche YouTube', videoId: null, searchTitle: item.Name });
        }

        // Menu propre : maximum 6 entrées, locales d'abord.
        return sources.slice(0, 6);
    }

    /**
     * Point d'entrée unique : la première source part tout de suite.
     * @param {Object} item — { Id, Name, RemoteTrailers? }
     * @param {HTMLElement} [_anchorEl] — conservé pour les appelants existants,
     *   sans effet depuis la suppression du menu de choix.
     */
    async open(item, _anchorEl = null) {
        const toaster = svc.toaster();
        if (!item?.Id) {
            toaster?.error?.('Média inconnu — impossible de charger la bande-annonce.');
            return;
        }
        // Anti-rebonds : une résolution déjà en cours pour ce média n'est pas relancée
        // (évite les doubles menus / double chargement d'iframe en cas de double-clic).
        if (this._openingId === item.Id && this._openingPromise) {
            return this._openingPromise;
        }
        // Fenêtre déjà ouverte pour ce même média : simple no-op.
        if (this._window?._trailerItemId === item.Id) return;

        this._openingId = item.Id;
        this._currentMediaId = item.Id;
        this._currentMediaTitle = item.Name || 'Bande-annonce';
        this._openingPromise = (async () => {
            let sources = [];
            try {
                sources = await this.resolve(item);
            } catch (err) {
                this._log.warn('Résolution des trailers échouée :', err);
            }

            if (sources.length === 0) {
                toaster?.info?.('Aucune bande-annonce disponible pour ce titre.');
                return;
            }
            // Les sources sont retenues pour le bouton « Suivante » : c'est le
            // même choix qu'offrait le menu, rendu au moment où il a un sens.
            this._sources = sources;
            this._sourceIndex = 0;
            this._launch(sources[0]);
        })().finally(() => {
            this._openingId = null;
            this._openingPromise = null;
        });
        return this._openingPromise;
    }

    /**
     * Passe à la bande-annonce suivante, en boucle.
     * Le lecteur local et la fenêtre YouTube y mènent tous deux : c'est
     * `_launch` qui sait laquelle des deux ouvrir pour la source choisie.
     */
    suivante() {
        if (!this._sources || this._sources.length < 2) return false;
        this._sourceIndex = (this._sourceIndex + 1) % this._sources.length;
        this._launch(this._sources[this._sourceIndex]);
        return true;
    }

    /** Nombre de sources disponibles pour le média en cours. */
    get nombreDeSources() { return this._sources?.length || 0; }

    /**
     * Ouvre une source, dans le bon lecteur.
     *
     * Deux lecteurs coexistent et ils ne se connaissent pas : une
     * bande-annonce LOCALE passe par le lecteur Jellyfin (flux authentifié,
     * pleine qualité), une source YouTube par la fenêtre dédiée. Enchaîner de
     * l'une à l'autre demande donc de FERMER l'autre — sans quoi la première
     * continue de jouer derrière la seconde, et l'on entend deux bandes-annonces
     * à la fois.
     */
    _launch(source) {
        if (source.type === 'local' && source.trailerItem) {
            const player = svc.player();
            if (!player?.play) {
                svc.toaster()?.error?.('Lecteur indisponible.');
                return;
            }
            this.close({ immediat: true });     // ferme la fenêtre YouTube
            player.play(source.trailerItem, 0, { isTrailer: true });
        } else {
            // Si le lecteur Jellyfin jouait la bande-annonce précédente, il doit
            // se taire avant que l'iframe ne démarre.
            const player = svc.player();
            if (player?._playbackOptions?.isTrailer) player.close?.();
            this.openYoutubeWindow(source);
        }
    }

    /**
     * Fenêtre lecteur YouTube au design SpaceHub (plus d'iframe brute flottante).
     * @param {{videoId: ?string, searchTitle: ?string, label?: string}} source
     * @param {string} [title]
     */
    openYoutubeWindow(source, title = this._currentMediaTitle || 'Bande-annonce') {
        // Fermeture IMMÉDIATE, sans animation de sortie : on remplace la
        // fenêtre, on ne la referme pas. La sortie animée laissait l'ancienne
        // 220 ms de plus dans le DOM, donc deux `.sh-trailer-window` en même
        // temps — et tout ce qui fait `querySelector('.sh-trailer-window')`
        // (la garde de `close`, le focus initial) tombait sur la périmée.
        this.close({ immediat: true });
        const label = source?.label || 'Bande-annonce YouTube';
        const safeTitle = String(title).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const videoId = source?.videoId || null;
        const search = source?.searchTitle ? encodeURIComponent(source.searchTitle + ' official trailer') : null;
        // Le bouton n'apparaît que s'il y a réellement quelque chose après :
        // un « Suivante » qui rejoue la même chose est pire que pas de bouton.
        const plusieurs = this.nombreDeSources > 1;

        const win = document.createElement('div');
        win.className = 'sh-trailer-window';
        win.innerHTML = `
            <div class="sh-trailer-window__box">
                <div class="sh-trailer-window__bar">
                    <span class="sh-trailer-window__badge">🎬 ${escapeHtml(label)}</span>
                    <span class="sh-trailer-window__title">${safeTitle}</span>
                    ${plusieurs ? `<button class="sh-trailer-window__next" tabindex="0" data-nav-focusable="true"
                        aria-label="Bande-annonce suivante">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"/><rect x="17" y="4" width="2.5" height="16" rx="1"/></svg>
                        <span>Suivante <span class="sh-trailer-window__rang">${this._sourceIndex + 1}/${this._sources.length}</span></span>
                    </button>` : ''}
                    <button class="sh-trailer-window__close" aria-label="Fermer la bande-annonce" tabindex="0" data-nav-focusable="true">✕</button>
                </div>
                <div class="sh-trailer-window__stage">
                    <!-- AUDIT A17 — le cadre était sans sandbox ni referrerpolicy.
                         Sans sandbox, la page embarquée peut ouvrir des fenêtres,
                         déclencher des téléchargements et naviguer la page hôte.
                         Sans referrerpolicy, l'URL complète de SpaceHub — qui
                         contient l'identifiant de l'item Jellyfin en cours —
                         part chez Google à chaque bande-annonce.
                         allow-scripts + allow-same-origin ensemble annulent
                         l'isolation d'origine, mais l'origine ici est
                         youtube-nocookie.com, distincte de la nôtre : le lecteur
                         garde son propre bac à sable, pas le nôtre. -->
                    <iframe
                        src="${videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3` : `https://www.youtube-nocookie.com/embed?listType=search&list=${search}&autoplay=1&modestbranding=1&iv_load_policy=3`}"
                        title="Bande-annonce"
                        frameborder="0"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                        referrerpolicy="strict-origin"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowfullscreen></iframe>
                </div>
            </div>
        `;
        document.body.appendChild(win);
        this._window = win;
        win._trailerItemId = this._currentMediaId || null;
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(() => win.classList.add('sh-trailer-window--open'));

        win.querySelector('.sh-trailer-window__close').addEventListener('click', () => this.close());
        win.querySelector('.sh-trailer-window__next')?.addEventListener('click', (e) => {
            e.stopPropagation();   // sinon le clic remonte au fond et referme
            this.suivante();
        });
        win.addEventListener('click', (e) => {
            if (e.target === win) this.close();
        });
        this._retirerClavier = inputRouter.inscrire('trailer', this._onKeydown,
            { priorite: PRIORITES.trailer });

        // Focus TV initial sur le bouton fermer
        const spatialNav = svc.nav() || svc.nav();
        const closeBtn = win.querySelector('.sh-trailer-window__close');
        setTimeout(() => {
            if (document.querySelector('.sh-trailer-window--open')) closeBtn?.focus?.();
        }, 80);
        void spatialNav;
    }

    /**
     * Ferme la fenêtre lecteur et restaure l'état.
     * @param {{ immediat?: boolean }} [options] `immediat` retire le nœud tout
     *   de suite, sans attendre l'animation de sortie — c'est ce qu'il faut
     *   quand une autre fenêtre prend sa place dans la foulée.
     */
    close({ immediat = false } = {}) {
        if (!this._window) return;
        const win = this._window;
        this._window = null;
        this._retirerClavier?.();
        this._retirerClavier = null;
        document.body.style.overflow = '';
        win.classList.remove('sh-trailer-window--open');
        const iframe = win.querySelector('iframe');
        if (iframe) iframe.src = 'about:blank';
        if (immediat) win.remove();
        else apresSortie(() => win.remove());
    }
}

export default TrailerService;
