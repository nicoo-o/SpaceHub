/**
 * SpaceHub — CardBuilder (composant)
 * Version: 0.9.0
 *
 * Constructeur de cartes médias SpaceHub avec :
 *  - Capsule de notes ultra-compacte, fine et discrète (9.5px, n'encombre plus l'affiche)
 *  - Icônes vectorielles SVG officielles (Rotten Tomatoes Certified Fresh / Fresh / Rotten & IMDb Gold Star)
 *  - Vraies notes Jellyfin (item.CriticRating / item.CommunityRating)
 *  - Détection d'intention au survol (140ms intent delay) anti-pollution visuelle
 *  - Exclusion totale des notes sur dossiers racines, bibliothèques ou playlists
 *  - Sous-titre enrichi avec Année & Genres cinématographiques
 */

'use strict';

import Logger from '../../core/Logger.js';

import './CardBuilder.css';
import * as svc from '../../core/services.js';
import { VirtualisationRangee, SEUIL_VIRTUALISATION } from './VirtualisationRangee.js';

/**
 * Types Jellyfin pour lesquels une radio a un sens.
 *
 * `/Items/{id}/InstantMix` ne compose que de la musique : sur un film, il
 * renvoie une liste vide sans erreur. Mieux vaut ne pas proposer le bouton que
 * de le laisser revenir bredouille.
 */
const EST_MUSIQUE = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'MusicGenre', 'Playlist']);
/** @typedef {'poster'|'backdrop'|'thumb'} CardType */

/**
 * Temps restant réel d'un média, en minutes.
 *
 * CE QUI ÉTAIT ÉCRIT ICI :
 *
 *     Math.round((100 - item.UserData.PlayedPercentage) * 1.2)
 *
 * Ce calcul suppose que TOUT média dure exactement 120 minutes. Un épisode de
 * 22 minutes vu à la moitié affichait « 60 min » ; un film de trois heures vu
 * à la moitié affichait « 60 min » lui aussi. Le chiffre avait l'apparence
 * d'une mesure, il n'en était pas une — et il était faux pour à peu près tout
 * le catalogue, les séries en premier.
 *
 * Jellyfin fournit ce qu'il faut : `RunTimeTicks` (durée totale) et
 * `UserData.PlaybackPositionTicks` (position réelle), en unités de 100 ns.
 * Le bon calcul existait déjà dans ce dépôt, à `ui/layouts/Dashboard.js` —
 * il n'avait simplement pas été repris ici.
 *
 * Sans ces deux valeurs, on ne renvoie rien : la carte n'affiche alors pas de
 * durée, ce qui est préférable à un nombre inventé.
 *
 * @param {Object} item  BaseItemDto Jellyfin.
 * @returns {number|undefined} Minutes restantes, ou `undefined` si inconnu.
 */
function tempsRestantMinutes(item) {
    const total = Number(item?.RunTimeTicks) || 0;
    const position = Number(item?.UserData?.PlaybackPositionTicks) || 0;
    if (total <= 0 || position <= 0 || position >= total) return undefined;
    // 600 000 000 ticks = 1 minute (10 000 000 ticks par seconde).
    return Math.max(1, Math.round((total - position) / 600000000));
}

class CardBuilder {
    constructor() {
        this._log = new Logger('CardBuilder');
        this._isHoveringPopover = false;
        this._popoverHideTimer = null;
        this._injectStyles();
        this._injectContextMenu();
        this._injectPopovers();
        this._setupGlobalHoverDelegation();
        this._setupGlobalFocusDelegation();
        this._log.info('Initialisé avec capsule ultra-compacte et détection d intention.');
    }

    // ─── SVG Icons Officielles ───────────────────────────────────────────────────

    getRtIconSvg(score) {
        if (!Number.isFinite(Number(score))) {
            // Aucun score critique Jellyfin : ne pas afficher d'icône ou de statut inventé.
            return '<span class="sh-score-placeholder" aria-hidden="true"></span>';
        }
        score = Number(score);
        if (score >= 75) {
            // Certified Fresh
            return `<svg class="sh-rt-svg" width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 8 3.5 8 3.5C8 3.5 9 5 11 5.5C8 6 4 9 4 14C4 18.5 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 6 13 5.5C15 5 16 3.5 16 3.5C16 3.5 14.5 2 12 2Z" fill="#FA320A"/><path d="M12 2C10.5 2 9 3 9 3.5C10 4 11 4.5 12 4.5C13 4.5 14 4 15 3.5C15 3 13.5 2 12 2Z" fill="#00C05B"/></svg>`;
        } else if (score >= 60) {
            // Fresh Tomato
            return `<svg class="sh-rt-svg" width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 8 3.5 8 3.5C8 3.5 9 5 11 5.5C8 6 4 9 4 14C4 18.5 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 6 13 5.5C15 5 16 3.5 16 3.5C16 3.5 14.5 2 12 2Z" fill="#FA320A"/><path d="M12 2C10.5 2 9 3 9 3.5C10 4 11 4.5 12 4.5C13 4.5 14 4 15 3.5C15 3 13.5 2 12 2Z" fill="#388E3C"/></svg>`;
        } else {
            // Rotten Splat
            return `<svg class="sh-rt-svg" width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 4C8 4 5 7 4 11C3 15 5 19 9 21C13 22 18 20 20 16C22 12 19 8 16 5C14 4 13 4 12 4Z" fill="#78B13F"/></svg>`;
        }
    }

    getImdbIconSvg() {
        return `<svg class="sh-imdb-star-svg" width="11" height="11" viewBox="0 0 24 24" fill="#F5C518"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`;
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Crée un élément DOM représentant une carte média.
     * @param {Object} options
     * @returns {HTMLElement}
     */
    createCard(options = {}) {
        const {
            id, title, subtitle = '', imageUrl = '',
            type = 'poster', itemType = '', badge, progress, rating,
            rottenScore, codec = '', isFolder = false,
            isNew = false, remainingMin, isFavorite = false, onClick, onContextMenu,
        } = options;

        const card = document.createElement('div');
        card.className   = `sh-card sh-card--${type}`;
        card.dataset.id  = id;
        card.tabIndex    = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('data-nav-focusable', 'true');
        card.setAttribute('data-nav-role', 'card');
        card.setAttribute('aria-label', title);

        const rawItem = options.rawItem || {};
        const rawGenres = Array.isArray(rawItem.Genres)
            ? rawItem.Genres
            : (typeof rawItem.Genres === 'string' ? rawItem.Genres.split(/[,•/]/).map(value => value.trim()) : []);
        if (rawGenres.length > 0) card.dataset.genres = rawGenres.join('|');

        // État "vu" initial (natif Jellyfin) — gardé à jour sur la carte elle-même
        // pour que le menu contextuel puisse basculer play/unplay sans reconstruire la carte.
        card._isPlayed = Boolean(rawItem?.UserData?.Played);

        // Mode enfant : le titre reste visible mais verrouillé, plutôt que de
        // disparaître. Un trou dans une rangée ressemble à un bug ; un cadenas
        // dit ce qui se passe, et l'adulte sait quoi faire pour y accéder.
        const parental = svc.parental();
        if (parental?.isEnabled?.() && !parental.isAllowed(rawItem)) {
            card.classList.add('sh-card--locked');
            card.setAttribute('aria-label', `${title} — verrouillé`);
        }

        const fallbackSvg = this._generateSvgPoster(title, type);
        const encodedFallback = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`;

        // Exclusion stricte des notes pour les dossiers racines, bibliothèques et playlists
        const isFolderItem = isFolder || ['CollectionFolder', 'UserView', 'Folder', 'Playlist', 'Channel'].includes(itemType);

        const numericRating = Number(rating);
        const hasRating = !isFolderItem && Number.isFinite(numericRating) && numericRating >= 0 && numericRating <= 10;
        const displayRating = hasRating ? numericRating.toFixed(1) : null;

        // 🍅 Note presse depuis Jellyfin (CriticRating, pourcentage 0-100)
        const criticScoreValue = Number(rottenScore);
        const hasCriticScore = !isFolderItem && Number.isFinite(criticScoreValue) && criticScoreValue > 0;

        if (!isFolderItem && (hasRating || hasCriticScore)) {
            card._criticData = {
                rtScore: hasCriticScore ? Math.round(criticScoreValue) : null,
                imdb: null,
                imdbVotes: null,
                metacritic: null,
                sourceLabel: hasCriticScore ? 'Jellyfin' : null
            };
        }

        card.innerHTML = `
            <div class="sh-card__image-wrap">
                ${imageUrl
                    ? `<img decoding="async" class="sh-card__image" src="${this._escape(imageUrl)}" alt="${this._escape(title)}" loading="lazy" onerror="this.onerror=null;this.src='${encodedFallback}';"/>`
                    : `<img decoding="async" class="sh-card__image" src="${encodedFallback}" alt="${this._escape(title)}" />`}
                
                <!-- Reflet de Bord Glass Glint -->
                <div class="sh-card__glint"></div>

                ${badge ? `<span class="sh-card__badge">${this._escape(badge)}</span>` : ''}
                ${isNew ? `<span class="sh-card__badge sh-card__badge--new">NEW</span>` : ''}
                ${card._isPlayed && !isFolderItem ? `<span class="sh-card__watched-badge" aria-label="Déjà vu" title="Déjà vu"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>` : ''}

                <!-- Master Codec Badge (Infuse Pro style) -->
                ${codec ? `<div class="sh-card__codec-tag">${this._escape(codec)}</div>` : ''}

                <!-- Liquid Action Pill (Apparaît au survol en bas de carte) -->
                ${(() => {
                    let label = 'Regarder';
                    if (isFolderItem) {
                        label = 'Ouvrir';
                    } else if (itemType === 'Series') {
                        const raw = options.rawItem;
                        const uData = raw?.UserData || options.userData;
                        const unplayed = uData?.UnplayedItemCount;
                        const total = raw?.ChildCount || raw?.RecursiveItemCount || raw?.ItemCounts?.ItemCount || raw?.ItemCounts?.EpisodeCount;
                        const isPlayed = Boolean(uData?.Played);
                        const hasPos = Boolean(uData?.PlaybackPositionTicks && uData.PlaybackPositionTicks > 0);
                        const hasPct = Boolean(uData?.PlayedPercentage && uData.PlayedPercentage > 0);
                        const hasStartedCount = (unplayed !== undefined && total !== undefined && unplayed < total);

                        const hasStarted = (typeof progress === 'number' && progress > 0) || hasPos || hasPct || isPlayed || hasStartedCount;
                        label = hasStarted ? 'Continuer' : 'Regarder S01E01';
                    } else if (typeof progress === 'number' && progress > 0) {
                        label = 'Continuer';
                    }

                    return `
                        <div class="sh-card__action-pill">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            <span>${label}</span>
                            ${remainingMin ? `<span class="sh-pill-duration">• ${remainingMin}m</span>` : ''}
                        </div>
                    `;
                })()}

                <!-- Barre de progression Glass avec lueur -->
                ${typeof progress === 'number'
                    ? `<div class="sh-card__progress">
                           <div class="sh-card__progress-bar" style="width:${Math.min(100, Math.round(progress * 100))}%"></div>
                       </div>`
                    : ''}
            </div>

            <!-- Capsule de notes : Jellyfin ★ + 🍅 presse (CriticRating) + notes externes asynchrones -->
            ${!isFolderItem ? `
            <div class="sh-card__dual-score" aria-hidden="true">
                ${hasRating ? `<span class="sh-score-btn sh-score-jellyfin" title="Note Jellyfin"><span aria-hidden="true">★</span><span class="sh-score-val">${displayRating}</span></span>` : ''}
                ${hasCriticScore ? `<span class="sh-score-btn sh-score-rt" title="Note presse (Jellyfin)">${this.getRtIconSvg(criticScoreValue)}<span class="sh-score-val">${Math.round(criticScoreValue)}%</span></span>` : ''}
                <span class="sh-score-ext" data-item-id="${this._escape(id || '')}"></span>
            </div>
            ` : ''}

            <!-- Bouton Favoris Rapide Quick Bookmark (Haut Droite) -->
            <button class="sh-card__bookmark-btn ${isFavorite ? 'active' : ''}" aria-label="Ajouter aux favoris" title="Ajouter à ma liste" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>

            <!-- Informations sous la carte -->
            <div class="sh-card__info">
                <p class="sh-card__title sh-truncate">${this._escape(title)}</p>
                <div class="sh-card__meta-line">
                    ${subtitle ? `<span class="sh-card__subtitle">${this._escape(subtitle)}</span>` : ''}
                    ${remainingMin ? `<span class="sh-card__remaining-time">${remainingMin} min</span>` : ''}
                </div>
            </div>
        `;

        // Action Favoris Rapide
        const bookmarkBtn = card.querySelector('.sh-card__bookmark-btn');
        bookmarkBtn?.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        bookmarkBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            bookmarkBtn.classList.toggle('active');
            bookmarkBtn.classList.remove('sh-bookmark-btn--pulse');
            void bookmarkBtn.offsetWidth;
            bookmarkBtn.classList.add('sh-bookmark-btn--pulse');
            const isFav = bookmarkBtn.classList.contains('active');
            const api = svc.jellyfinApi();
            if (api?.setFavorite && id) {
                try {
                    await api.setFavorite(id, isFav);
                } catch (err) {
                    console.warn('[CardBuilder] Erreur sync favori:', err);
                }
            }
            svc.toaster()?.info(
                isFav ? `Ajouté aux favoris : ${title}` : `Retiré des favoris : ${title}`
            );
        });

        // 🎬 Action Clic Direct sur la Pilule [ ▶ Continuer ] / [ ▶ Regarder S01E01 ]
        const actionPill = card.querySelector('.sh-card__action-pill');
        if (actionPill) {
            actionPill.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            actionPill.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (isFolderItem) {
                    onClick?.(e);
                    return;
                }

                const api = svc.jellyfinApi();
                const player = svc.player();
                if (!player?.play) {
                    onClick?.(e);
                    return;
                }

                // 📺 Traitement spécifique pour les Séries : Reprise NextUp ou S01E01
                if (itemType === 'Series') {
                    try {
                        // 1. Chercher si un épisode est en cours de visionnage ou suivant (NextUp)
                        if (api?.getNextUp) {
                            const nextUp = await api.getNextUp(id);
                            if (nextUp) {
                                player.play(nextUp);
                                return;
                            }
                        }
                        // 2. Sinon, prendre le 1er épisode de la série (S01E01)
                        if (api?.getEpisodes) {
                            const episodes = await api.getEpisodes(id);
                            if (episodes && episodes.length > 0) {
                                const sorted = episodes.sort((a, b) => ((a.ParentIndexNumber || 1) - (b.ParentIndexNumber || 1)) || ((a.IndexNumber || 1) - (b.IndexNumber || 1)));
                                player.play(sorted[0]);
                                return;
                            }
                        }
                    } catch (err) {
                        console.warn('[CardBuilder] Erreur résolution épisode série:', err);
                    }
                }

                // 🎬 Pour les Films ou Épisodes individuels
                const targetMedia = options.rawItem || { Id: id, id, Name: title, title, Type: itemType };
                if (api && id) {
                    api.getItem(id).then(fullItem => {
                        player.play(fullItem || targetMedia);
                    }).catch(() => {
                        player.play(targetMedia);
                    });
                } else {
                    player.play(targetMedia);
                }
            });
        }

        // Événements de clic sur la carte globale
        if (onClick) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score') || e.target.closest('.sh-card__action-pill')) return;
                onClick(e);
            });
            card.addEventListener('keydown', e => { 
                if (e.key === 'Enter' || e.key === ' ') { 
                    if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score') || e.target.closest('.sh-card__action-pill')) return;
                    e.preventDefault(); 
                    onClick(e); 
                } 
            });
        }

        // 🌟 3D Magnetic Parallax Tilt (Apple TV style)
        card.addEventListener('mouseenter', () => {
            card.style.transition = 'transform 100ms ease-out';
        });
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -10;
            const rotateY = ((x - centerX) / centerX) * 10;
            card.style.transform = `perspective(800px) translateY(-8px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transition = 'transform 360ms cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.transform = 'perspective(800px) translateY(0) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        });

        // Clic-droit : Context Menu
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e, { id, title, type }, card);
            if (onContextMenu) onContextMenu(e);
        });

        // Chargement asynchrone des notes externes (RT / IMDb / Metacritic)
        if (!isFolderItem) {
            this._attachExternalRatings(card, rawItem);
        }

        return card;
    }

    _attachExternalRatings(card, rawItem) {
        if (!rawItem?.Id) return;
        const ratingCache = svc.ratingCache();
        if (!ratingCache) return;
        card._rawItem = rawItem;

        // Rafraîchissement des cartes déjà montées après enregistrement d'une clé OMDb
        if (!this._ratingsRefreshBound) {
            this._ratingsRefreshBound = true;
            document.addEventListener('spacehub:ratings-updated', () => {
                document.querySelectorAll('.sh-card').forEach(c => {
                    if (!c._rawItem || !c.querySelector('.sh-score-ext')) return;
                    const ext = c.querySelector('.sh-score-ext');
                    ext.innerHTML = '';
                    this._attachExternalRatings(c, c._rawItem);
                });
            });
        }

        const extEl = card.querySelector('.sh-score-ext');
        const capsule = card.querySelector('.sh-card__dual-score');
        if (!extEl || !capsule) return;

        // D7 — NE RÉSOUDRE QUE CE QUI EST RÉELLEMENT VU.
        //
        // La résolution partait à la CRÉATION de la carte. Une rangée de deux
        // cents titres déclenchait donc deux cents résolutions, étalées trois
        // par trois — pour un quota OMDb de mille requêtes PAR JOUR. La
        // virtualisation limitait déjà les rangées longues, mais toute rangée
        // de moins de soixante éléments passait entière, et une page en
        // contient plusieurs.
        //
        // `IntersectionObserver` répond exactement à cette question, et existe
        // depuis Chrome 51 — bien en deçà du plancher de ce projet. Sans lui
        // (environnement de test, navigateur exotique), on retombe sur le
        // comportement d'avant plutôt que de ne rien afficher.
        this._quandVisible(card, () => this._resoudreNotes(card, rawItem, extEl, capsule));
    }

    /**
     * Exécute une action au premier passage à l'écran de l'élément.
     *
     * @param {HTMLElement} el
     * @param {() => void} action
     */
    _quandVisible(el, action) {
        if (typeof IntersectionObserver !== 'function') { action(); return; }

        if (!this._observateurNotes) {
            this._observateurNotes = new IntersectionObserver((entrees, obs) => {
                for (const entree of entrees) {
                    if (!entree.isIntersecting) continue;
                    // On cesse d'observer AVANT d'agir : une action qui
                    // modifierait la carte pourrait sinon redéclencher
                    // l'observateur sur le même élément.
                    obs.unobserve(entree.target);
                    const differee = this._actionsVisibilite?.get(entree.target);
                    this._actionsVisibilite?.delete(entree.target);
                    try { differee?.(); } catch { /* une carte fautive n'en bloque pas d'autres */ }
                }
            }, {
                // Une marge d'un demi-écran : les notes arrivent pendant que
                // la carte monte, pas une fois qu'elle est plantée sous les
                // yeux de la personne.
                rootMargin: '50% 0px',
            });
            this._actionsVisibilite = new WeakMap();
        }
        this._actionsVisibilite.set(el, action);
        this._observateurNotes.observe(el);
    }

    /** Le travail réel, une fois la carte à l'écran. */
    _resoudreNotes(card, rawItem, extEl, capsule) {
        const ratingCache = svc.ratingCache();
        if (!ratingCache || !document.contains(card)) return;
        ratingCache.get(rawItem).then(ratings => {
            if (!document.contains(card)) return;
            // Mise à jour du badge 🍅 Jellyfin avec la valeur OMDb — pas de doublon
            const existingRtBtn = capsule.querySelector('.sh-score-rt');
            if (ratings.rt != null && existingRtBtn) {
                const valEl = existingRtBtn.querySelector('.sh-score-val');
                if (valEl) valEl.textContent = `${ratings.rt}%`;
                existingRtBtn.title = 'Rotten Tomatoes (OMDb)';
            }
            // Hiérarchie : dès que l'OMDb fournit un score IMDb, le ★ Jellyfin fait doublon → retiré.
            // Sans clé / sans données OMDb, le ★ Jellyfin reste le repli.
            const jellyfinStar = capsule.querySelector('.sh-score-jellyfin');
            if (jellyfinStar && ratings.imdb != null) jellyfinStar.remove();

            let html = '';
            if (ratings.rt != null && !capsule.querySelector('.sh-score-rt')) {
                html += `<span class="sh-score-btn sh-score-rt" title="Rotten Tomatoes (OMDb)">${this.getRtIconSvg(ratings.rt)}<span class="sh-score-val">${ratings.rt}%</span></span>`;
            }
            if (ratings.imdb != null) {
                const imdbTitle = ratings.isSeriesFallback ? 'Note de la série — IMDb (OMDb)' : 'IMDb (OMDb)';
                html += `<span class="sh-score-btn sh-score-imdb" title="${imdbTitle}">${this.getImdbIconSvg()}<span class="sh-score-val">${ratings.imdb.toFixed(1)}</span></span>`;
            }
            if (ratings.metacritic != null) {
                html += `<span class="sh-score-btn sh-score-mc" title="Metacritic (OMDb)"><span class="sh-score-val">MC ${ratings.metacritic}</span></span>`;
            }
            if (html) {
                extEl.innerHTML = html;
            }
            // Fusion des données réelles : Jellyfin 🍅 (base) + OMDb (IMDb/MC/RT)
            const base = card._criticData || {};
            card._criticData = {
                rtScore: ratings.rt ?? base.rtScore ?? null,
                imdb: ratings.imdb ?? null,
                imdbVotes: ratings.imdbVotes ?? null,
                metacritic: ratings.metacritic ?? null,
                sourceLabel: ratings.rt != null ? 'OMDb' : (base.sourceLabel || null),
                isSeriesFallback: ratings.isSeriesFallback ?? base.isSeriesFallback ?? false
            };
            if (!html && !capsule.querySelector('.sh-score-jellyfin') && !capsule.querySelector('.sh-score-rt')) {
                capsule.style.display = 'none';
            }
        }).catch(() => {});
    }

    _setupGlobalHoverDelegation() {
        if (this._hasGlobalHoverSetup) return;
        this._hasGlobalHoverSetup = true;
        let intentTimer = null;

        document.addEventListener('mouseover', (e) => {
            const rtBtn = e.target.closest('.sh-score-rt');
            const imdbBtn = e.target.closest('.sh-score-imdb');
            const popoverEl = e.target.closest('.sh-global-popover');

            if (popoverEl) {
                this._isHoveringPopover = true;
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                if (intentTimer) clearTimeout(intentTimer);
                return;
            }

            if (rtBtn) {
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                const containerEl = rtBtn.closest('.sh-card') || rtBtn.closest('.sh-hero-meta') || rtBtn.closest('.sh-cinema-hero-details') || rtBtn.closest('.sh-cinema-meta-line') || rtBtn.closest('.sh-saga-movie-card') || rtBtn.closest('.sh-bento-card');
                const criticData = containerEl?._criticData || this._currentItemCriticData;
                
                if (criticData) {
                    if (intentTimer) clearTimeout(intentTimer);
                    // Intent-Based Hover : 140ms d'attente pour éviter les ouvertures intempestives lors du simple balayage
                    intentTimer = setTimeout(() => {
                        this._hideIMDbPopover();
                        this.showRTPopover(rtBtn, criticData);
                    }, 140);
                }
                return;
            }

            if (imdbBtn) {
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                const containerEl = imdbBtn.closest('.sh-card') || imdbBtn.closest('.sh-hero-meta') || imdbBtn.closest('.sh-cinema-hero-details') || imdbBtn.closest('.sh-cinema-meta-line') || imdbBtn.closest('.sh-saga-movie-card') || imdbBtn.closest('.sh-bento-card');
                const criticData = containerEl?._criticData || this._currentItemCriticData;
                
                if (criticData) {
                    if (intentTimer) clearTimeout(intentTimer);
                    intentTimer = setTimeout(() => {
                        this._hideRTPopover();
                        this.showIMDbPopover(imdbBtn, criticData);
                    }, 140);
                }
                return;
            }
        }, { passive: true });

        document.addEventListener('mouseout', (e) => {
            const rtBtn = e.target.closest('.sh-score-rt');
            const imdbBtn = e.target.closest('.sh-score-imdb');
            const popoverEl = e.target.closest('.sh-global-popover');

            if (rtBtn || imdbBtn) {
                if (intentTimer) clearTimeout(intentTimer);
            }

            if (rtBtn || imdbBtn || popoverEl) {
                const related = e.relatedTarget;
                if (related && (related.closest('.sh-score-rt') || related.closest('.sh-score-imdb') || related.closest('.sh-global-popover'))) {
                    return;
                }
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                this._popoverHideTimer = setTimeout(() => {
                    if (!this._isHoveringPopover) {
                        this._hideRTPopover();
                        this._hideIMDbPopover();
                    }
                }, 220);
            }
        }, { passive: true });
    }

    /**
     * Délégation globale du FOCUS (mode TV / télécommande) : les popovers 🍅/IMDb
     * s'ouvrent aussi quand une carte, le Hero ou la ligne de notes d'une fiche
     * reçoit le focus — aucun survol souris requis. Une stabilisation de 320 ms
     * évite le scintillement pendant le défilement rapide des rails.
     */
    _setupGlobalFocusDelegation() {
        if (this._hasGlobalFocusSetup) return;
        this._hasGlobalFocusSetup = true;
        const CONTAINER_SELECTOR = '.sh-card, .sh-hero-meta, .sh-hero-container, .sh-cinema-hero-details, .sh-cinema-meta-line, .sh-saga-movie-card, .sh-bento-card';
        let intentTimer = null;
        let lastFocusedContainer = null;

        const handleFocusCandidate = (target) => {
            // Focus à l'intérieur d'un popover : géré par le survol, ne pas interférer
            if (!target || target.closest?.('.sh-global-popover')) return;

            const containerEl = target.closest?.(CONTAINER_SELECTOR) || null;
            if (intentTimer) clearTimeout(intentTimer);

            // Changement de conteneur ou sortie : masquer immédiatement l'ancien popover
            if (!containerEl || containerEl !== lastFocusedContainer) {
                this._hideRTPopover(true);
                this._hideIMDbPopover(true);
            }
            lastFocusedContainer = containerEl;

            if (!containerEl) return;
            const criticData = containerEl._criticData || this._currentItemCriticData;
            if (!criticData) return;

            // Stabilisation : n'affiche que si le focus reste dans ce conteneur
            intentTimer = setTimeout(() => {
                if (!document.activeElement || !containerEl.contains(document.activeElement)) return;
                const rtBtn = containerEl.querySelector('.sh-score-rt');
                const imdbBtn = containerEl.querySelector('.sh-score-imdb');
                if (rtBtn) {
                    this._hideIMDbPopover(true);
                    this.showRTPopover(rtBtn, criticData);
                } else if (imdbBtn) {
                    this._hideRTPopover(true);
                    this.showIMDbPopover(imdbBtn, criticData);
                }
            }, 320);
        };

        // Source 1 : événements natifs de focus (souris/clavier/tab)
        document.addEventListener('focusin', (e) => handleFocusCandidate(e.target));

        // Source 2 : moteur de navigation spatiale (télécommande) — certains environnements
        // n'émettent pas focusin lors du focus programmatique.
        svc.eventBus()?.on?.('navigation:focusChanged', ({ current } = {}) => {
            if (current) handleFocusCandidate(current);
        });
    }

    /**
     * Les données Rotten Tomatoes/IMDb ne sont pas fournies par Jellyfin.
     * Retourner null évite de présenter des scores ou citations générés localement
     * comme des informations critiques vérifiées.
     */
    getCriticData() {
        return null;
        // LE BLOC DE 115 LIGNES QUI SE TROUVAIT ICI A ÉTÉ SUPPRIMÉ.
        //
        // Il contenait un corpus de fausses critiques de presse : des citations
        // inventées de toutes pièces, ATTRIBUÉES NOMMÉMENT à des journalistes
        // réels de Télérama, du Monde, de Libération et du Guardian, ainsi que
        // des notes « audience » et « Metacritic » dérivées d'un hachage du
        // titre du film. Le tout était neutralisé par le `return null;`
        // ci-dessus — mais conservé intact, à une paire de caractères de
        // remise en service.
        //
        // Mettre en commentaire du contenu diffamatoire n'est pas le
        // supprimer : la prochaine personne qui lit ce fichier peut décommenter
        // sans mesurer ce qu'elle publie. Les vraies critiques existent et
        // arrivent déjà par TMDB, avec leur auteur et leur URL d'origine
        // (`_renderTmdbReviews`) — c'est la seule source légitime.
    }

    _injectPopovers() {
        // 1. Popover Rotten Tomatoes
        if (!document.getElementById('sh-global-rt-popover')) {
            const rtPopover = document.createElement('div');
            rtPopover.id = 'sh-global-rt-popover';
            rtPopover.className = 'sh-global-popover sh-global-rt-popover';
            document.body.appendChild(rtPopover);

            rtPopover.addEventListener('mouseenter', () => {
                this._isHoveringPopover = true;
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
            });
            rtPopover.addEventListener('mouseleave', () => {
                this._isHoveringPopover = false;
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                this._popoverHideTimer = setTimeout(() => {
                    this._hideRTPopover();
                }, 160);
            });
        }

        // 2. Popover IMDb / Spectateurs
        if (!document.getElementById('sh-global-imdb-popover')) {
            const imdbPopover = document.createElement('div');
            imdbPopover.id = 'sh-global-imdb-popover';
            imdbPopover.className = 'sh-global-popover sh-global-imdb-popover';
            document.body.appendChild(imdbPopover);

            imdbPopover.addEventListener('mouseenter', () => {
                this._isHoveringPopover = true;
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
            });
            imdbPopover.addEventListener('mouseleave', () => {
                this._isHoveringPopover = false;
                if (this._popoverHideTimer) clearTimeout(this._popoverHideTimer);
                this._popoverHideTimer = setTimeout(() => {
                    this._hideIMDbPopover();
                }, 160);
            });
        }
    }

    _positionPopover(popover, targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const popoverWidth = 265;
        let top = rect.bottom + 8;
        let left = rect.left - 4;

        if (left + popoverWidth > window.innerWidth - 16) {
            left = window.innerWidth - popoverWidth - 16;
        }
        if (left < 16) left = 16;

        if (top + 230 > window.innerHeight - 16) {
            top = rect.top - 230;
        }

        popover.style.top = `${Math.max(12, Math.round(top))}px`;
        popover.style.left = `${Math.max(12, Math.round(left))}px`;
    }

    showRTPopover(btnEl, criticData) {
        this._injectPopovers();
        const popover = document.getElementById('sh-global-rt-popover');
        if (!popover || !btnEl || !criticData) return;
        const rtScore = Math.round(Number(criticData.rtScore));
        if (!Number.isFinite(rtScore) || rtScore <= 0) return; // aucune note réelle : aucun popover fabriqué

        const statusLabel = rtScore >= 75 ? 'Certified Fresh' : (rtScore >= 60 ? 'Fresh' : 'Rotten');

        popover.innerHTML = `
            <div class="sh-rt-popover__header">
                <div class="sh-rt-brand">
                    ${this.getRtIconSvg(rtScore)}
                    <span class="sh-rt-popover__title">${statusLabel} • ${rtScore}%</span>
                </div>
                ${criticData.imdb != null ? `<span class="sh-rt-popover__audience">★ ${Number(criticData.imdb).toFixed(1)}/10</span>` : ''}
            </div>
            <div class="sh-popover-tag">Note de la presse</div>
            <p class="sh-rt-popover__consensus" style="font-size:12px; color:rgba(var(--sh-ink, 255, 255, 255), 0.8); margin:6px 0;">Score agrégé Rotten Tomatoes.</p>
            <div class="sh-rt-popover__footer">
                ${criticData.metacritic != null ? `<span class="sh-meta-tag">🟢 ${criticData.metacritic} Metascore</span>` : ''}
                ${criticData.isSeriesFallback ? '<span class="sh-meta-tag">📺 Note de la série</span>' : ''}
                <span class="sh-rt-popover__dot">•</span>
                <span>Source : ${this._escape(criticData.sourceLabel || 'OMDb')}</span>
            </div>
        `;

        this._positionPopover(popover, btnEl);
        popover.classList.add('visible');
    }

    _hideRTPopover(force = false) {
        if (!force && this._isHoveringPopover) return;
        this._isHoveringPopover = false;
        const popover = document.getElementById('sh-global-rt-popover');
        popover?.classList.remove('visible');
    }

    showIMDbPopover(btnEl, criticData) {
        this._injectPopovers();
        const popover = document.getElementById('sh-global-imdb-popover');
        if (!popover || !btnEl || !criticData) return;
        const imdbScore = Number(criticData.imdb);
        if (!Number.isFinite(imdbScore) || imdbScore <= 0) return; // aucune note réelle : aucun popover fabriqué

        popover.innerHTML = `
            <div class="sh-imdb-popover__header">
                <div class="sh-imdb-brand">
                    <span class="sh-imdb-badge">IMDb</span>
                    <span class="sh-imdb-score">★ ${imdbScore.toFixed(1)}<small>/10</small></span>
                </div>
                ${criticData.imdbVotes ? `<span class="sh-imdb-votes" style="font-size:11px; color:rgba(var(--sh-ink, 255, 255, 255), 0.6);">${criticData.imdbVotes.toLocaleString('fr-FR')} votes</span>` : ''}
            </div>
            <div class="sh-popover-tag">Avis des spectateurs</div>
            <div class="sh-imdb-footer" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                ${criticData.metacritic != null ? `<span class="sh-meta-tag">🟢 ${criticData.metacritic} Metascore</span>` : ''}
                ${criticData.rtScore != null ? `<span class="sh-meta-tag">🍅 ${criticData.rtScore}% Rotten Tomatoes</span>` : ''}
                <span style="font-size:11px; color:rgba(var(--sh-ink, 255, 255, 255), 0.55);">Source : OMDb</span>
            </div>
        `;

        this._positionPopover(popover, btnEl);
        popover.classList.add('visible');
    }

    _hideIMDbPopover(force = false) {
        if (!force && this._isHoveringPopover) return;
        this._isHoveringPopover = false;
        const popover = document.getElementById('sh-global-imdb-popover');
        popover?.classList.remove('visible');
    }

    hideAllPopovers() {
        this._isHoveringPopover = false;
        document.getElementById('sh-global-rt-popover')?.classList.remove('visible');
        document.getElementById('sh-global-imdb-popover')?.classList.remove('visible');
    }

    createSkeleton(type = 'poster') {
        const el = document.createElement('div');
        el.className = `sh-card sh-card--${type} sh-card--skeleton`;
        el.innerHTML = `
            <div class="sh-card__image-wrap">
                <div class="sh-card__image sh-skeleton-block"></div>
            </div>
            <div class="sh-card__info">
                <div class="sh-skeleton-block" style="height:14px;width:80%;border-radius:4px;margin-bottom:6px"></div>
                <div class="sh-skeleton-block" style="height:11px;width:50%;border-radius:4px"></div>
            </div>
        `;
        return el;
    }

    createSkeletonGrid(count = 8, type = 'poster') {
        const grid = document.createElement('div');
        grid.className = `sh-card-grid sh-card-grid--${type}`;
        for (let i = 0; i < count; i++) grid.appendChild(this.createSkeleton(type));
        return grid;
    }

    renderGrid(container, items, options = {}) {
        const { type = 'poster', getImageUrl, onClick } = options;
        container.innerHTML = '';
        container.className = `sh-card-grid sh-card-grid--${type}`;

        // Une virtualisation en cours sur ce conteneur doit être arrêtée : ses
        // écouteurs pointent sur des cartes qu'on vient d'effacer.
        container._shVirtualisation?.detruire?.();
        container._shVirtualisation = null;

        /** Fabrique la carte n°i. Partagée par les deux chemins de rendu. */
        const fabriquer = (i) => this._carteDepuisItem(items[i], { type, getImageUrl, onClick, options });

        // Au-delà du seuil, on ne rend que la fenêtre visible : sur un
        // téléviseur d'entrée de gamme, quelques centaines de cartes dans le
        // DOM saturent la mémoire, même hors écran.
        if (items.length > SEUIL_VIRTUALISATION) {
            const virtuel = new VirtualisationRangee(container, items.length, fabriquer);
            if (virtuel.demarrer()) {
                container._shVirtualisation = virtuel;
                setTimeout(() => svc.gooeyScroller()?.attach?.(container), 60);
                return;
            }
        }

        items.forEach(item => {
            const isFolder = item.Type === 'CollectionFolder' || item.Type === 'UserView' || item.Type === 'Folder' || item.Type === 'Playlist' || item.CollectionType !== undefined || options.isFolder;
            
            // Récupération et formatage des genres
            const genresArr = Array.isArray(item.Genres) ? item.Genres : (typeof item.Genres === 'string' ? item.Genres.split(/[,•/]/).map(s => s.trim()) : []);
            const genresText = genresArr.slice(0, 2).join(' • ');

            // Récupération des vraies notes Jellyfin
            const rating = !isFolder && item.CommunityRating !== undefined && item.CommunityRating !== null
                ? item.CommunityRating
                : null;
            const rottenScore = !isFolder && Number(item.CriticRating) > 0 ? Number(item.CriticRating) : null;

            const subtitleText = item.customSubtitle || (isFolder ? (item.CollectionType || 'Dossier racine') : (item.subtitle || (item.ProductionYear ? `${item.ProductionYear}${genresText ? ' • ' + genresText : ''}` : (genresText || item.Type || ''))));

            const card = this.createCard({
                rawItem:  item,
                id:       item.Id,
                title:    item.customTitle || item.Name || 'Inconnu',
                subtitle: subtitleText,
                imageUrl: item.customImage || (getImageUrl?.(item) ?? ''),
                type,
                itemType: item.Type,
                isFolder,
                rottenScore: rottenScore,
                rating: rating,
                codec: item.codec || (isFolder ? (item.CollectionType || 'DOSSIER') : ''),
                progress: item.UserData?.PlayedPercentage
                    ? item.UserData.PlayedPercentage / 100
                    : (item.UserData?.PlaybackPositionTicks 
                        ? item.UserData.PlaybackPositionTicks / (item.RunTimeTicks || 1) 
                        : (item.UserData?.UnplayedItemCount !== undefined && (item.ChildCount || item.RecursiveItemCount) && item.UserData.UnplayedItemCount < (item.ChildCount || item.RecursiveItemCount)
                            ? (1 - (item.UserData.UnplayedItemCount / (item.ChildCount || item.RecursiveItemCount)))
                            : (item.UserData?.Played ? 1 : undefined))),
                isFavorite: Boolean(item.UserData?.IsFavorite),
                remainingMin: item.remainingMin ?? tempsRestantMinutes(item),
                onClick: onClick ? (e) => onClick(item, e) : undefined,
            });
            container.appendChild(card);
        });

        setTimeout(() => {
            if (svc.gooeyScroller()) {
                svc.gooeyScroller().attach(container);
            }
        }, 60);
    }

    /**
     * Construit une carte à partir d'un élément Jellyfin.
     *
     * Extrait de `renderGrid` pour que le rendu complet et le rendu virtualisé
     * produisent EXACTEMENT la même carte — s'ils divergeaient, les rangées
     * longues finiraient par ne plus ressembler aux courtes, et le défaut
     * serait invisible tant qu'on ne teste pas au-delà du seuil.
     *
     * @param {Object} item
     * @param {{ type: string, getImageUrl?: Function, onClick?: Function, options: Object }} ctx
     * @returns {HTMLElement}
     */
    _carteDepuisItem(item, { type, getImageUrl, onClick, options }) {
        const isFolder = item.Type === 'CollectionFolder' || item.Type === 'UserView' || item.Type === 'Folder' || item.Type === 'Playlist' || item.CollectionType !== undefined || options.isFolder;

        const genresArr = Array.isArray(item.Genres) ? item.Genres : (typeof item.Genres === 'string' ? item.Genres.split(/[,•/]/).map(s => s.trim()) : []);
        const genresText = genresArr.slice(0, 2).join(' • ');

        const rating = !isFolder && item.CommunityRating !== undefined && item.CommunityRating !== null
            ? item.CommunityRating
            : null;
        const rottenScore = !isFolder && Number(item.CriticRating) > 0 ? Number(item.CriticRating) : null;

        const subtitleText = item.customSubtitle || (isFolder ? (item.CollectionType || 'Dossier racine') : (item.subtitle || (item.ProductionYear ? `${item.ProductionYear}${genresText ? ' • ' + genresText : ''}` : (genresText || item.Type || ''))));

        return this.createCard({
            rawItem:  item,
            id:       item.Id,
            title:    item.customTitle || item.Name || 'Inconnu',
            subtitle: subtitleText,
            imageUrl: item.customImage || (getImageUrl?.(item) ?? ''),
            type,
            itemType: item.Type,
            isFolder,
            rottenScore,
            rating,
            codec: item.codec || (isFolder ? (item.CollectionType || 'DOSSIER') : ''),
            progress: item.UserData?.PlayedPercentage
                ? item.UserData.PlayedPercentage / 100
                : (item.UserData?.PlaybackPositionTicks
                    ? item.UserData.PlaybackPositionTicks / (item.RunTimeTicks || 1)
                    : (item.UserData?.UnplayedItemCount !== undefined && (item.ChildCount || item.RecursiveItemCount) && item.UserData.UnplayedItemCount < (item.ChildCount || item.RecursiveItemCount)
                        ? (1 - (item.UserData.UnplayedItemCount / (item.ChildCount || item.RecursiveItemCount)))
                        : (item.UserData?.Played ? 1 : undefined))),
            isFavorite: Boolean(item.UserData?.IsFavorite),
            remainingMin: item.remainingMin ?? tempsRestantMinutes(item),
            onClick: onClick ? (e) => onClick(item, e) : undefined,
        });
    }

    _injectContextMenu() {
        if (document.getElementById('sh-context-menu')) return;
        const menu = document.createElement('div');
        menu.id = 'sh-context-menu';
        menu.className = 'sh-context-menu';
        menu.innerHTML = `
            <div class="sh-context-menu__header sh-truncate" id="sh-ctx-title">Média</div>
            <hr class="sh-ctx-sep"/>
            <button class="sh-ctx-item" id="sh-ctx-play" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Lire maintenant</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-play-next" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 13 12 5 20 5 4" fill="currentColor" stroke="none"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                <span>Lire ensuite</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-queue" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="16" y2="6"></line><line x1="4" y1="12" x2="16" y2="12"></line><line x1="4" y1="18" x2="12" y2="18"></line><line x1="19" y1="14" x2="19" y2="20"></line><line x1="16" y1="17" x2="22" y2="17"></line></svg>
                <span>Ajouter à la file</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-download" type="button" style="display:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Télécharger</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-radio" type="button" style="display:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"></circle><path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48"></path></svg>
                <span>Lancer une radio</span>
            </button>
            <!-- Actions de greffons. Vide et masqué quand aucun greffon n'en
                 apporte, ce qui est le cas par défaut : un séparateur seul
                 dans un menu ressemble à une entrée qui n'a pas chargé. -->
            <div id="sh-ctx-greffons" hidden></div>
            <button class="sh-ctx-item" id="sh-ctx-cast" type="button" style="display:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><line x1="2" y1="20" x2="2.01" y2="20"></line></svg>
                <span>Lire sur un autre appareil</span>
            </button>
            <hr class="sh-ctx-sep"/>
            <button class="sh-ctx-item" id="sh-ctx-watchlist" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Ajouter à ma liste</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-trailer" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                <span>Bande-annonce</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-details" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <span>Détails & Casting</span>
            </button>
            <hr class="sh-ctx-sep"/>
            <button class="sh-ctx-item" id="sh-ctx-watched" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Marquer comme vu</span>
            </button>
        `;
        document.body.appendChild(menu);

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                this._hideContextMenu();
            }
        });
    }

    /**
     * Petit sélecteur d'appareil pour la lecture à distance.
     *
     * Construit par le DOM et non par innerHTML : les noms d'appareils viennent
     * du serveur et sont saisis par les utilisateurs eux-mêmes.
     */
    _choisirAppareil(cibles, item) {
        document.getElementById('sh-cast-picker')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'sh-cast-picker';
        overlay.className = 'sh-cast-picker';

        const carte = document.createElement('div');
        carte.className = 'sh-cast-picker__card';

        const titre = document.createElement('p');
        titre.className = 'sh-cast-picker__title';
        titre.textContent = `Lire « ${item.title} » sur…`;
        carte.appendChild(titre);

        const distant = svc.remote();
        const toaster = svc.toaster();

        for (const cible of cibles) {
            const b = document.createElement('button');
            b.className = 'sh-cast-picker__item';
            b.setAttribute('tabindex', '0');
            b.setAttribute('data-nav-focusable', 'true');

            const nom = document.createElement('span');
            nom.className = 'sh-cast-picker__name';
            nom.textContent = cible.Nom;

            const etat = document.createElement('span');
            etat.className = 'sh-cast-picker__state';
            etat.textContent = cible.EnLecture ? `lit « ${cible.EnLecture} »` : (cible.Client || 'disponible');

            b.append(nom, etat);
            b.addEventListener('click', async () => {
                overlay.remove();
                try {
                    await distant.playOn(cible.Id, item.id);
                    toaster?.success?.(`Envoyé sur ${cible.Nom}.`);
                } catch (err) {
                    toaster?.error?.(`Impossible d'envoyer sur ${cible.Nom}.`);
                }
            });
            carte.appendChild(b);
        }

        const annuler = document.createElement('button');
        annuler.className = 'sh-btn sh-btn--ghost sh-cast-picker__cancel';
        annuler.textContent = 'Annuler';
        annuler.setAttribute('tabindex', '0');
        annuler.setAttribute('data-nav-focusable', 'true');
        annuler.addEventListener('click', () => overlay.remove());
        carte.appendChild(annuler);

        overlay.appendChild(carte);
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        carte.querySelector('.sh-cast-picker__item')?.focus();
    }

    _showContextMenu(e, item, card) {
        const menu = document.getElementById('sh-context-menu');
        if (!menu) return;

        const titleEl = menu.querySelector('#sh-ctx-title');
        if (titleEl) titleEl.textContent = item.title;

        const watchedLabelEl = menu.querySelector('#sh-ctx-watched span');
        if (watchedLabelEl) {
            watchedLabelEl.textContent = card?._isPlayed ? 'Marquer comme non vu' : 'Marquer comme vu';
        }

        const cardRect = card ? card.getBoundingClientRect() : { right: e.clientX, left: e.clientX, top: e.clientY };
        const menuWidth = 220;

        let left = cardRect.right + 14;
        if (left + menuWidth > window.innerWidth) {
            left = cardRect.left - menuWidth - 14;
        }

        let top = cardRect.top;
        if (top + 260 > window.innerHeight) {
            top = window.innerHeight - 270;
        }

        menu.style.top = `${Math.max(12, top)}px`;
        menu.style.left = `${Math.max(12, left)}px`;
        menu.classList.remove('sh-context-menu--closing');

        // Le déroulé en cascade des entrées est piloté par `--idx`
        // (CardBuilder.css : `animation-delay: calc(var(--idx, 0) * 28ms …)`).
        // Cette variable n'était posée nulle part : les neuf entrées
        // apparaissaient donc toutes ensemble, et la cascade décrite dans la
        // feuille n'a jamais existé. On ne compte que les entrées RÉELLEMENT
        // affichées — « Télécharger » et « Diffuser » sont masquées selon le
        // contexte, et les inclure creusait des trous dans le rythme.
        let rang = 0;
        for (const entree of menu.querySelectorAll('.sh-ctx-item')) {
            if (entree.style.display === 'none') continue;
            entree.style.setProperty('--idx', String(rang++));
        }

        menu.classList.add('sh-context-menu--open');

        menu.querySelector('#sh-ctx-play').onclick = () => {
            this._hideContextMenu();
            const api = svc.jellyfinApi();
            if (api && item.id) {
                api.getItem(item.id).then(fullItem => {
                    svc.player()?.play?.(fullItem || item);
                });
            }
        };

        menu.querySelector('#sh-ctx-details').onclick = () => {
            this._hideContextMenu();
            const api = svc.jellyfinApi();
            if (api && item.id) {
                api.getItem(item.id).then(fullItem => {
                    svc.slideUpSheet()?.open?.(fullItem || item);
                });
            }
        };

        // « Lire ensuite » et « Ajouter à la file » : mêmes données, deux places
        // dans la file. On récupère l'élément complet auprès du serveur avant de
        // l'empiler — la carte ne porte qu'un résumé, et le lecteur a besoin des
        // MediaSources pour négocier la lecture le moment venu.
        const empiler = (mode) => async () => {
            this._hideContextMenu();
            const file = svc.queue();
            const toaster = svc.toaster();
            if (!file || !item.id) {
                toaster?.info?.("La file d'attente n'est pas disponible.");
                return;
            }
            try {
                const complet = await svc.jellyfinApi()?.getItem?.(item.id);
                const media = complet || { Id: item.id, Name: item.title };
                if (mode === 'next') file.addNext(media);
                else file.addToEnd(media);
                const position = file.length;
                toaster?.success?.(mode === 'next'
                    ? `« ${item.title} » sera lu ensuite.`
                    : `« ${item.title} » ajouté à la file (${position}).`);
            } catch (err) {
                toaster?.error?.("Impossible d'ajouter ce titre à la file.");
            }
        };
        menu.querySelector('#sh-ctx-play-next').onclick = empiler('next');
        menu.querySelector('#sh-ctx-queue').onclick = empiler('end');

        // A5 — Actions apportées par des greffons.
        //
        // Le menu contextuel d'une carte est l'endroit NATUREL d'un greffon :
        // « chercher les paroles », « marquer sur Trakt », « envoyer à… ». Le
        // type de contribution `action` existait, était validé, stocké — et
        // jamais relu par personne.
        //
        // Les entrées sont lues À L'OUVERTURE du menu, pas à l'enregistrement :
        // un greffon activé après le premier rendu doit apparaître sans qu'on
        // recharge la page.
        this._poserActionsGreffons(menu, item);

        // Radio d'artiste — le serveur compose une file à partir de ce titre.
        //
        // N'apparaît QUE pour de la musique : proposer « lancer une radio » sur
        // un film promettrait quelque chose que /InstantMix ne sait pas faire,
        // et le bouton reviendrait bredouille sans que la personne comprenne
        // pourquoi.
        const boutonRadio = menu.querySelector('#sh-ctx-radio');
        const radio = svc.radioMusique?.();
        if (boutonRadio && radio && item.id && EST_MUSIQUE.has(item.type)) {
            boutonRadio.style.display = '';
            boutonRadio.onclick = async () => {
                this._hideContextMenu();
                const toaster = svc.toaster();
                const res = await radio.composer(item.id);
                if (!res.ok) { toaster?.error?.(res.raison || 'Radio impossible.'); return; }
                const file = svc.queue();
                file?.setQueue?.(res.titres, 0);
                svc.player()?.play?.(res.titres[0]);
                toaster?.success?.(`Radio lancée : ${res.titres.length} titres.`);
            };
        }

        // Téléchargement hors-ligne — masqué si le navigateur ne sait pas stocker
        // ou si un dossier existe déjà pour ce titre. L'intitulé bascule alors
        // vers la suppression, pour que l'action soit réversible au même endroit.
        const boutonTelecharger = menu.querySelector('#sh-ctx-download');
        const magasin = svc.offlineStore();
        const telechargements = svc.downloads();
        if (boutonTelecharger && magasin && telechargements && item.id) {
            boutonTelecharger.style.display = 'none';
            magasin.existe(item.id).then(dejaLa => {
                boutonTelecharger.style.display = '';
                const libelle = boutonTelecharger.querySelector('span');
                if (libelle) libelle.textContent = dejaLa ? 'Supprimer le téléchargement' : 'Télécharger';
                boutonTelecharger.onclick = async () => {
                    this._hideContextMenu();
                    const toaster = svc.toaster();
                    if (dejaLa) {
                        await telechargements.supprimer(item.id);
                        return;
                    }
                    toaster?.info?.(`Téléchargement de « ${item.title} » lancé.`);
                    try {
                        const complet = await svc.jellyfinApi()?.getItem?.(item.id);
                        const res = await telechargements.telecharger(complet || { Id: item.id, Name: item.title });
                        if (res.ok) toaster?.success?.(`« ${item.title} » est disponible hors ligne.`);
                        else toaster?.error?.(res.raison || 'Téléchargement impossible.');
                    } catch (err) {
                        toaster?.error?.(err?.message || 'Téléchargement impossible.');
                    }
                };
            }).catch(() => { /* stockage indisponible : le bouton reste caché */ });
        }

        // « Lire sur un autre appareil » n'apparaît que s'il existe une cible.
        // Un bouton qui ouvre une liste vide est pire que pas de bouton : il
        // fait croire à une panne alors qu'il n'y a simplement rien à commander.
        const boutonCast = menu.querySelector('#sh-ctx-cast');
        if (boutonCast) {
            boutonCast.style.display = 'none';
            const distant = svc.remote();
            distant?.listTargets?.().then(cibles => {
                if (!cibles?.length) return;
                boutonCast.style.display = '';
                boutonCast.onclick = () => {
                    this._hideContextMenu();
                    this._choisirAppareil(cibles, item);
                };
            }).catch(() => { /* pas de cible : le bouton reste caché */ });
        }

        menu.querySelector('#sh-ctx-trailer').onclick = () => {
            this._hideContextMenu();
            // Bandes-annonces via notre TrailerService : serveur Jellyfin d'abord,
            // puis YouTube dans la fenêtre SpaceHub (plus d'iframe brute).
            if (svc.trailers()) {
                svc.trailers().open({ Id: item.id, Name: item.title });
            } else {
                svc.toaster()?.info?.('Bande-annonce indisponible.');
            }
        };

        menu.querySelector('#sh-ctx-watchlist').onclick = () => {
            this._hideContextMenu();
            // Réutilise le bouton favori déjà présent sur la carte (même logique de
            // bascule + appel API + toast) plutôt que de dupliquer l'appel setFavorite ici.
            const bookmarkBtn = card?.querySelector?.('.sh-card__bookmark-btn');
            if (bookmarkBtn) {
                bookmarkBtn.click();
            } else {
                svc.toaster()?.info?.('Action indisponible.');
            }
        };

        menu.querySelector('#sh-ctx-watched').onclick = async () => {
            this._hideContextMenu();
            const api = svc.jellyfinApi();
            if (!api?.setPlayedStatus || !item.id) return;
            const nextPlayed = !card?._isPlayed;
            try {
                await api.setPlayedStatus(item.id, nextPlayed);
                if (card) card._isPlayed = nextPlayed;
                // Synchronise le badge "Déjà vu" affiché sur la carte, sans la reconstruire.
                const wrap = card?.querySelector?.('.sh-card__image-wrap');
                const existingBadge = wrap?.querySelector('.sh-card__watched-badge');
                if (nextPlayed && wrap && !existingBadge) {
                    const badgeEl = document.createElement('span');
                    badgeEl.className = 'sh-card__watched-badge';
                    badgeEl.setAttribute('aria-label', 'Déjà vu');
                    badgeEl.title = 'Déjà vu';
                    badgeEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    wrap.appendChild(badgeEl);
                } else if (!nextPlayed && existingBadge) {
                    existingBadge.remove();
                }
                svc.toaster()?.info?.(
                    nextPlayed ? `Marqué comme vu : ${item.title}` : `Marqué comme non vu : ${item.title}`
                );
            } catch (err) {
                console.warn('[CardBuilder] Erreur marquage vu/non vu:', err);
                svc.toaster()?.info?.('Impossible de mettre à jour le statut vu.');
            }
        };
    }

    /**
     * Ajoute au menu contextuel les actions apportées par des greffons.
     *
     * @param {HTMLElement} menu
     * @param {object} item  la carte, telle que l'interface la connaît.
     */
    _poserActionsGreffons(menu, item) {
        const conteneur = menu.querySelector('#sh-ctx-greffons');
        if (!conteneur) return;
        conteneur.textContent = '';

        const actions = svc.plugins()?.getContributions?.('action') || [];
        let posees = 0;
        for (const { pluginId, contribution } of actions) {
            const libelle = String(contribution?.libelle || contribution?.label || '').trim();
            if (!libelle || typeof contribution.executer !== 'function') continue;
            // Un greffon peut restreindre son action à certains types de média.
            // On le laisse décider, mais on le protège : un filtre qui jette ne
            // doit pas faire disparaître le menu entier.
            try {
                if (typeof contribution.convient === 'function' && !contribution.convient(item)) continue;
            } catch { continue; }

            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sh-ctx-item';
            bouton.dataset.pluginId = pluginId;
            // `textContent` et jamais `innerHTML` : ce libellé vient d'un
            // greffon, c'est-à-dire de code tiers.
            const texte = document.createElement('span');
            texte.textContent = libelle;
            bouton.appendChild(texte);
            bouton.addEventListener('click', async () => {
                this._hideContextMenu();
                try {
                    await contribution.executer(item);
                } catch (err) {
                    // L'échec d'un greffon se dit, et ne remonte pas à la
                    // frontière d'erreur globale comme si l'application avait
                    // planté.
                    svc.toaster()?.error?.(`« ${libelle} » a échoué : ${err?.message || err}`);
                }
            });
            conteneur.appendChild(bouton);
            posees += 1;
        }
        conteneur.hidden = posees === 0;
    }

    _hideContextMenu() {
        const menu = document.getElementById('sh-context-menu');
        if (!menu || !menu.classList.contains('sh-context-menu--open')) return;
        menu.classList.remove('sh-context-menu--open');
        menu.classList.add('sh-context-menu--closing');
        setTimeout(() => {
            menu.classList.remove('sh-context-menu--closing');
        }, 160);
    }

    _generateSvgPoster(title = 'Média', type = 'poster') {
        const width = type === 'backdrop' ? 500 : 300;
        const height = type === 'backdrop' ? 280 : 450;
        const safeTitle = this._escape(title);

        let hash = 0;
        for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
        const hue1 = Math.abs(hash % 360);
        const hue2 = (hue1 + 45) % 360;

        const color1 = `hsl(${hue1}, 65%, 18%)`;
        const color2 = `hsl(${hue2}, 75%, 8%)`;
        const accent = `hsl(${hue1}, 85%, 60%)`;

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="g_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${color1}"/>
                    <stop offset="100%" stop-color="${color2}"/>
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#g_${Math.abs(hash)})"/>
            <circle cx="${width*0.8}" cy="${height*0.2}" r="${width*0.4}" fill="rgba(255,255,255,0.03)"/>
            <circle cx="${width*0.2}" cy="${height*0.8}" r="${width*0.5}" fill="${accent}" opacity="0.10" filter="blur(20px)"/>
            <g transform="translate(${width/2 - 24}, ${height/2 - 36})" opacity="0.75">
                <rect width="48" height="48" rx="14" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
                <polygon points="19,14 35,24 19,34" fill="#ffffff"/>
            </g>
            <text x="50%" y="${height - 32}" font-family="-apple-system, SF Pro Display, Inter, sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">${safeTitle}</text>
        </svg>`;
    }

    _escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans CardBuilder.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default CardBuilder;
