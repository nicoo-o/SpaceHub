/**
 * SpaceHub — TrailerService
 *
 * Résolution et lecture des bandes-annonces, sans iframe externe brute :
 * 1. Trailers LOCAUX du serveur Jellyfin → lus dans notre VideoPlayer (flux authentifié)
 * 2. Repli YouTube (« de base ») : URL RemoteTrailer des métadonnées Jellyfin,
 *    sinon recherche par titre — affichée dans une fenêtre dédiée au design
 *    SpaceHub (barre de titre, glassmorphism, fermeture TV/Échap).
 *
 * Usage : TrailerService.open({ Id, Name }) — menu si plusieurs sources,
 * ouverture directe si une seule.
 */

'use strict';

import Logger from './Logger.js';

import './TrailerService.css';
import { escapeHtml } from './utils/domUtils.js';
import * as svc from './services.js';
import inputRouter, { PRIORITES } from './InputRouter.js';
class TrailerService {
    constructor() {
        this._log = new Logger('TrailerService');
        this._window = null;
        this._menuEl = null;
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
                const res = await fetch(`${base}/Users/${userId}/Items/${item.Id}?Fields=RemoteTrailers`, { headers });
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
                const res = await fetch(`${base}/Users/${userId}/Items/${item.Id}/Trailers`, { headers });
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
     * Point d'entrée unique : menu si plusieurs sources, ouverture directe sinon.
     * @param {Object} item — { Id, Name, RemoteTrailers? }
     * @param {HTMLElement} [anchorEl] — ancre d'affichage du menu (optionnel)
     */
    async open(item, anchorEl = null) {
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
            if (sources.length === 1) {
                this._launch(sources[0]);
                return;
            }
            this._openMenu(sources, anchorEl);
        })().finally(() => {
            this._openingId = null;
            this._openingPromise = null;
        });
        return this._openingPromise;
    }

    /** Menu personnalisé SpaceHub listant les sources disponibles. */
    _openMenu(sources, anchorEl) {
        this.closeMenu();
        const menu = document.createElement('div');
        menu.className = 'sh-trailer-menu';
        menu.innerHTML = `
            <div class="sh-trailer-menu__title">🎬 Bandes-annonces</div>
            ${sources.map((s, i) => `
                <button class="sh-trailer-menu__item" data-index="${i}" tabindex="0" data-nav-focusable="true">
                    <span class="sh-trailer-menu__icon">${s.type === 'local' ? '📺' : '▶'}</span>
                    <span>${escapeHtml(s.label)}</span>
                </button>
            `).join('')}
        `;
        document.body.appendChild(menu);
        this._menuEl = menu;

        if (anchorEl && anchorEl.getBoundingClientRect) {
            const r = anchorEl.getBoundingClientRect();
            menu.style.top = `${Math.max(12, r.top - 8)}px`;
            menu.style.left = `${Math.min(window.innerWidth - 240, Math.max(12, r.left))}px`;
        } else {
            menu.style.top = '30%';
            menu.style.left = '50%';
            menu.style.transform = 'translateX(-50%)';
        }

        menu.querySelectorAll('.sh-trailer-menu__item').forEach(btn => {
            btn.addEventListener('click', () => {
                const source = sources[Number(btn.dataset.index)];
                this.closeMenu();
                this._launch(source);
            });
        });
        setTimeout(() => {
            document.addEventListener('click', this._onDocClick = (e) => {
                if (this._menuEl && !this._menuEl.contains(e.target)) this.closeMenu();
            }, { once: true });
        }, 0);
    }

    closeMenu() {
        this._menuEl?.remove();
        this._menuEl = null;
    }

    _launch(source) {
        if (source.type === 'local' && source.trailerItem) {
            const player = svc.player();
            if (!player?.play) {
                svc.toaster()?.error?.('Lecteur indisponible.');
                return;
            }
            this.close();
            player.play(source.trailerItem, 0, { isTrailer: true });
        } else {
            this.openYoutubeWindow(source);
        }
    }

    /**
     * Fenêtre lecteur YouTube au design SpaceHub (plus d'iframe brute flottante).
     * @param {{videoId: ?string, searchTitle: ?string, label?: string}} source
     * @param {string} [title]
     */
    openYoutubeWindow(source, title = this._currentMediaTitle || 'Bande-annonce') {
        this.close();
        const label = source?.label || 'Bande-annonce YouTube';
        const safeTitle = String(title).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const videoId = source?.videoId || null;
        const search = source?.searchTitle ? encodeURIComponent(source.searchTitle + ' official trailer') : null;

        const win = document.createElement('div');
        win.className = 'sh-trailer-window';
        win.innerHTML = `
            <div class="sh-trailer-window__box">
                <div class="sh-trailer-window__bar">
                    <span class="sh-trailer-window__badge">🎬 ${escapeHtml(label)}</span>
                    <span class="sh-trailer-window__title">${safeTitle}</span>
                    <button class="sh-trailer-window__close" aria-label="Fermer la bande-annonce" tabindex="0" data-nav-focusable="true">✕</button>
                </div>
                <div class="sh-trailer-window__stage">
                    <iframe
                        src="${videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0` : `https://www.youtube-nocookie.com/embed?listType=search&list=${search}&autoplay=1`}"
                        frameborder="0"
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

    /** Ferme la fenêtre lecteur et restaure l'état. */
    close() {
        if (!this._window) return;
        const win = this._window;
        this._window = null;
        this._retirerClavier?.();
        this._retirerClavier = null;
        document.body.style.overflow = '';
        win.classList.remove('sh-trailer-window--open');
        const iframe = win.querySelector('iframe');
        if (iframe) iframe.src = 'about:blank';
        setTimeout(() => win.remove(), 220);
    }
}

export default TrailerService;
