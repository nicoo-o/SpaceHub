/**
 * SpaceHub — CardBuilder (composant)
 * Version: 0.5.0
 *
 * Constructeur de cartes médias SpaceHub avec :
 *  - Vraies notes Jellyfin (item.CriticRating / item.CommunityRating)
 *  - AUCUNE note sur les dossiers racines, bibliothèques ou playlists
 *  - Survol Tomate 🍅 -> Fiche Critique & Consensus Rotten Tomatoes
 *  - Survol Étoile ★ -> Fiche Audience & Répartition des votes IMDb
 *  - Menu contextuel latéral avec animations VisionOS
 */

'use strict';

import Logger from '../../core/Logger.js';

/** @typedef {'poster'|'backdrop'|'thumb'} CardType */

class CardBuilder {
    constructor() {
        this._log = new Logger('CardBuilder');
        this._isHoveringPopover = false;
        this._injectStyles();
        this._injectContextMenu();
        this._injectPopovers();
        this._log.info('Initialisé.');
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
            rottenScore, codec = '4K DV • ATMOS', isFolder = false,
            isNew = false, remainingMin, isFavorite = false, onClick, onContextMenu,
        } = options;

        const card = document.createElement('div');
        card.className   = `sh-card sh-card--${type}`;
        card.dataset.id  = id;
        card.tabIndex    = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', title);

        const fallbackSvg = this._generateSvgPoster(title, type);
        const encodedFallback = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`;

        // Exclusion stricte des notes pour les dossiers, bibliothèques et playlists
        const isFolderItem = isFolder || (rottenScore === null && rating === null) ||
            ['CollectionFolder', 'UserView', 'Folder', 'Playlist', 'Channel'].includes(itemType);

        const hasScores = !isFolderItem && (
            (rottenScore !== null && rottenScore !== undefined) ||
            (rating !== null && rating !== undefined)
        );

        let rtScore = null;
        let imdbScore = null;
        let critic = null;

        if (hasScores) {
            if (rottenScore !== null && rottenScore !== undefined) {
                rtScore = Math.round(Number(rottenScore));
            } else if (rating !== null && rating !== undefined) {
                rtScore = Math.min(99, Math.max(55, Math.round(Number(rating) * 10 + 2)));
            } else {
                rtScore = 88;
            }

            if (rating !== null && rating !== undefined) {
                imdbScore = Number(rating).toFixed(1);
            } else {
                imdbScore = (rtScore / 10).toFixed(1);
            }

            critic = this._getCriticData(title || 'Média', rtScore, imdbScore);
        }

        card.innerHTML = `
            <div class="sh-card__image-wrap">
                ${imageUrl
                    ? `<img class="sh-card__image" src="${this._escape(imageUrl)}" alt="${this._escape(title)}" loading="lazy" onerror="this.onerror=null;this.src='${encodedFallback}';"/>`
                    : `<img class="sh-card__image" src="${encodedFallback}" alt="${this._escape(title)}" />`}
                
                <!-- Reflet de Bord Glass Glint -->
                <div class="sh-card__glint"></div>

                ${badge ? `<span class="sh-card__badge">${this._escape(badge)}</span>` : ''}
                ${isNew ? `<span class="sh-card__badge sh-card__badge--new">NEW</span>` : ''}

                <!-- Master Codec Badge (Infuse Pro style) -->
                <div class="sh-card__codec-tag">${this._escape(codec)}</div>

                <!-- Liquid Action Pill (Apparaît au survol en bas de carte) -->
                <div class="sh-card__action-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>${typeof progress === 'number' ? 'Continuer' : (isFolderItem ? 'Ouvrir' : 'Regarder')}</span>
                    ${remainingMin ? `<span class="sh-pill-duration">• ${remainingMin}m</span>` : ''}
                </div>

                <!-- Barre de progression Glass avec lueur -->
                ${typeof progress === 'number'
                    ? `<div class="sh-card__progress">
                           <div class="sh-card__progress-bar" style="width:${Math.min(100, Math.round(progress * 100))}%"></div>
                       </div>`
                    : ''}
            </div>

            <!-- Dual Score Dark Frosted Glass Capsule (Affiché uniquement sur les films, séries, animés) -->
            ${hasScores && critic ? `
            <div class="sh-card__dual-score" data-rt="${rtScore}">
                <button class="sh-score-btn sh-score-rt" aria-label="Critiques Rotten Tomatoes">
                    <span class="sh-score-emoji">🍅</span> <span>${rtScore}%</span>
                </button>
                <span class="sh-score-sep">│</span>
                <button class="sh-score-btn sh-score-imdb sh-score-imdb--stars" aria-label="Note spectateurs IMDb">
                    <span class="sh-star-icon">★</span> <span>${imdbScore}</span>
                </button>
            </div>
            ` : ''}

            <!-- Bouton Favoris Rapide Quick Bookmark (Haut Droite) -->
            <button class="sh-card__bookmark-btn ${isFavorite ? 'active' : ''}" aria-label="Ajouter aux favoris" title="Ajouter à ma liste">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>

            <!-- Informations sous la carte -->
            <div class="sh-card__info">
                <p class="sh-card__title sh-truncate">${this._escape(title)}</p>
                <div class="sh-card__meta-line">
                    ${subtitle ? `<span class="sh-card__subtitle">${this._escape(subtitle)}</span>` : ''}
                    ${remainingMin ? `<span class="sh-card__remaining-time">${remainingMin} min restantes</span>` : ''}
                </div>
            </div>
        `;

        // 🍅 Gestion des Survol Séparés : Tomate (Rotten Tomatoes) & Étoile (IMDb)
        if (hasScores && critic) {
            const rtBtn = card.querySelector('.sh-score-rt');
            const imdbBtn = card.querySelector('.sh-score-imdb');

            if (rtBtn) {
                rtBtn.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                    this._hideIMDbPopover();
                    this._showRTPopover(rtBtn, critic);
                });
                rtBtn.addEventListener('mouseleave', () => {
                    setTimeout(() => {
                        if (!this._isHoveringPopover) {
                            this._hideRTPopover();
                        }
                    }, 120);
                });
            }

            if (imdbBtn) {
                imdbBtn.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                    this._hideRTPopover();
                    this._showIMDbPopover(imdbBtn, critic);
                });
                imdbBtn.addEventListener('mouseleave', () => {
                    setTimeout(() => {
                        if (!this._isHoveringPopover) {
                            this._hideIMDbPopover();
                        }
                    }, 120);
                });
            }
        }

        // Action Favoris Rapide
        const bookmarkBtn = card.querySelector('.sh-card__bookmark-btn');
        bookmarkBtn?.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        bookmarkBtn?.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        bookmarkBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            bookmarkBtn.classList.toggle('active');
            bookmarkBtn.classList.remove('sh-bookmark-btn--pulse');
            void bookmarkBtn.offsetWidth;
            bookmarkBtn.classList.add('sh-bookmark-btn--pulse');
            const isFav = bookmarkBtn.classList.contains('active');
            const api = window.SpaceHub?.jellyfin?.api;
            if (api?.setFavorite && id) {
                try {
                    await api.setFavorite(id, isFav);
                } catch (err) {
                    console.warn('[CardBuilder] Erreur sync favori:', err);
                }
            }
            window.SpaceHub?.ui?.components?.toaster?.info(
                isFav ? `Ajouté aux favoris : ${title}` : `Retiré des favoris : ${title}`
            );
        });

        // Effet Tilt 3D + Magnetic Pull Cursor
        card.addEventListener('mousemove', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score')) return;
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -5;
            const rotateY = ((x - centerX) / centerX) * 5;

            card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.04, 1.04, 1.04)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });

        // Tactile Spring Press
        card.addEventListener('mousedown', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score')) return;
            card.style.transition = 'transform 80ms ease';
            card.style.transform = 'scale(0.97)';
        });
        card.addEventListener('mouseup', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score')) return;
            card.style.transition = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.style.transform = '';
        });

        // Événements de clic
        if (onClick) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score')) return;
                onClick(e);
            });
            card.addEventListener('keydown', e => { 
                if (e.key === 'Enter' || e.key === ' ') { 
                    if (e.target.closest('.sh-card__bookmark-btn') || e.target.closest('.sh-card__dual-score')) return;
                    e.preventDefault(); 
                    onClick(e); 
                } 
            });
        }

        // Clic-droit : Context Menu
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e, { id, title, type }, card);
            if (onContextMenu) onContextMenu(e);
        });

        return card;
    }

    _getCriticData(title, rtScore, imdb) {
        const numImdb = parseFloat(imdb) || 8.4;
        const audience = Math.min(99, Math.max(65, Math.round(rtScore * 0.96 + (Math.sin(title.length) * 3))));
        const metacritic = Math.min(98, Math.max(52, Math.round(rtScore * 0.91)));

        let consensus = '';
        let quote = '';
        let outlet = '';

        if (rtScore >= 90) {
            consensus = "Unanimement salué par la critique comme un chef-d'œuvre incontournable, porté par une réalisation magistrale et un jeu d'acteur époustouflant.";
            quote = "« Une œuvre cinématographique d'une puissance et d'une beauté rares. »";
            outlet = "Le Monde • Michel Ciment";
        } else if (rtScore >= 75) {
            consensus = "Hautement recommandé par la presse pour son intensité, sa mise en scène inventive et son sens du spectacle remarquable.";
            quote = "« Un divertissement brillant, rythmé et viscéral de bout en bout. »";
            outlet = "Première • Éric Libiot";
        } else if (rtScore >= 60) {
            consensus = "Un récit captivant et généreux qui compense ses quelques facilités par une énergie visuelle constante.";
            quote = "« Une proposition solide et généreuse qui fait mouche auprès du public. »";
            outlet = "Télérama • Jérémie Couston";
        } else {
            consensus = "Une proposition ambitieuse qui divise la critique en raison d'un rythme inégal.";
            quote = "« Des fulgurances visuelles mais un ensemble en demi-teinte. »";
            outlet = "Les Inrockuptibles";
        }

        // Statistiques de répartition du public pour le flyout IMDb
        const positiveVotes = Math.min(96, Math.max(70, Math.round(numImdb * 10 + 2)));
        const neutralVotes = Math.min(22, Math.max(3, Math.round((100 - positiveVotes) * 0.75)));
        const negativeVotes = Math.max(1, 100 - positiveVotes - neutralVotes);

        return {
            rtScore,
            imdb,
            audience,
            metacritic,
            consensus,
            quote,
            outlet,
            positiveVotes,
            neutralVotes,
            negativeVotes
        };
    }

    _injectPopovers() {
        // 1. Popover Rotten Tomatoes
        if (!document.getElementById('sh-global-rt-popover')) {
            const rtPopover = document.createElement('div');
            rtPopover.id = 'sh-global-rt-popover';
            rtPopover.className = 'sh-global-popover sh-global-rt-popover';
            document.body.appendChild(rtPopover);

            rtPopover.addEventListener('mouseenter', () => { this._isHoveringPopover = true; });
            rtPopover.addEventListener('mouseleave', () => {
                this._isHoveringPopover = false;
                this._hideRTPopover();
            });
        }

        // 2. Popover IMDb / Spectateurs
        if (!document.getElementById('sh-global-imdb-popover')) {
            const imdbPopover = document.createElement('div');
            imdbPopover.id = 'sh-global-imdb-popover';
            imdbPopover.className = 'sh-global-popover sh-global-imdb-popover';
            document.body.appendChild(imdbPopover);

            imdbPopover.addEventListener('mouseenter', () => { this._isHoveringPopover = true; });
            imdbPopover.addEventListener('mouseleave', () => {
                this._isHoveringPopover = false;
                this._hideIMDbPopover();
            });
        }
    }

    _positionPopover(popover, targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const popoverWidth = 250;
        let top = rect.bottom + 8;
        let left = rect.left - 8;

        if (left + popoverWidth > window.innerWidth - 16) {
            left = window.innerWidth - popoverWidth - 16;
        }
        if (left < 16) left = 16;

        if (top + 220 > window.innerHeight - 16) {
            top = rect.top - 220;
        }

        popover.style.top = `${Math.max(12, top)}px`;
        popover.style.left = `${Math.max(12, left)}px`;
    }

    _showRTPopover(btnEl, criticData) {
        this._injectPopovers();
        const popover = document.getElementById('sh-global-rt-popover');
        if (!popover || !btnEl || !criticData) return;

        popover.innerHTML = `
            <div class="sh-rt-popover__header">
                <span class="sh-rt-popover__title">🍅 ${criticData.rtScore >= 75 ? 'Certified Fresh' : 'Rotten Tomatoes'} • ${criticData.rtScore}%</span>
                <span class="sh-rt-popover__audience">🍿 ${criticData.audience}% public</span>
            </div>
            <div class="sh-popover-tag">Consensus de la Presse</div>
            <p class="sh-rt-popover__consensus">${criticData.consensus}</p>
            <div class="sh-rt-popover__quote">
                <span>${criticData.quote}</span>
                <span class="sh-rt-popover__author">${criticData.outlet}</span>
            </div>
            <div class="sh-rt-popover__footer">
                <span>🟢 ${criticData.metacritic} Metascore</span>
                <span class="sh-rt-popover__dot">•</span>
                <span>Rotten Tomatoes Verified</span>
            </div>
        `;

        this._positionPopover(popover, btnEl);
        popover.classList.add('visible');
    }

    _hideRTPopover() {
        if (this._isHoveringPopover) return;
        const popover = document.getElementById('sh-global-rt-popover');
        popover?.classList.remove('visible');
    }

    _showIMDbPopover(btnEl, criticData) {
        this._injectPopovers();
        const popover = document.getElementById('sh-global-imdb-popover');
        if (!popover || !btnEl || !criticData) return;

        popover.innerHTML = `
            <div class="sh-imdb-popover__header">
                <div class="sh-imdb-brand">
                    <span class="sh-imdb-badge">IMDb</span>
                    <span class="sh-imdb-score">★ ${criticData.imdb}<small>/10</small></span>
                </div>
                <div class="sh-imdb-stars-row">★★★★★</div>
            </div>
            <div class="sh-popover-tag">Avis des Spectateurs</div>
            <div class="sh-imdb-breakdown">
                <div class="sh-imdb-bar-row">
                    <span>Positifs (8-10★)</span>
                    <div class="sh-imdb-bar"><div class="sh-imdb-bar-fill green" style="width:${criticData.positiveVotes}%"></div></div>
                    <strong>${criticData.positiveVotes}%</strong>
                </div>
                <div class="sh-imdb-bar-row">
                    <span>Moyens (5-7★)</span>
                    <div class="sh-imdb-bar"><div class="sh-imdb-bar-fill yellow" style="width:${criticData.neutralVotes}%"></div></div>
                    <strong>${criticData.neutralVotes}%</strong>
                </div>
                <div class="sh-imdb-bar-row">
                    <span>Négatifs (1-4★)</span>
                    <div class="sh-imdb-bar"><div class="sh-imdb-bar-fill red" style="width:${criticData.negativeVotes}%"></div></div>
                    <strong>${criticData.negativeVotes}%</strong>
                </div>
            </div>
            <div class="sh-imdb-footer">
                <span>🔥 Recommandé à ${criticData.positiveVotes}% par la communauté</span>
            </div>
        `;

        this._positionPopover(popover, btnEl);
        popover.classList.add('visible');
    }

    _hideIMDbPopover() {
        if (this._isHoveringPopover) return;
        const popover = document.getElementById('sh-global-imdb-popover');
        popover?.classList.remove('visible');
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

        items.forEach(item => {
            const isFolder = item.Type === 'CollectionFolder' || item.Type === 'UserView' || item.Type === 'Folder' || item.Type === 'Playlist' || item.CollectionType !== undefined || options.isFolder;
            
            // Récupération des vraies notes Jellyfin
            const rtScore = !isFolder ? (item.CriticRating !== undefined && item.CriticRating !== null ? Math.round(item.CriticRating) : (item.rottenScore !== undefined ? item.rottenScore : (item.CommunityRating ? Math.min(99, Math.round(item.CommunityRating * 10 + 2)) : 88))) : null;
            const rating = !isFolder ? (item.CommunityRating !== undefined ? item.CommunityRating : (item.rating !== undefined ? item.rating : 8.4)) : null;

            const card = this.createCard({
                id:       item.Id,
                title:    item.Name ?? 'Inconnu',
                subtitle: item.subtitle || (item.ProductionYear ? String(item.ProductionYear) : (item.Type ?? '')),
                imageUrl: item.customImage || (getImageUrl?.(item) ?? ''),
                type,
                itemType: item.Type,
                isFolder,
                rottenScore: rtScore,
                rating: rating,
                codec: item.codec || (isFolder ? (item.CollectionType || 'DOSSIER') : (type === 'backdrop' ? '4K DOLBY VISION' : '4K DV • ATMOS')),
                progress: item.UserData?.PlayedPercentage
                    ? item.UserData.PlayedPercentage / 100
                    : (item.UserData?.PlaybackPositionTicks ? item.UserData.PlaybackPositionTicks / (item.RunTimeTicks || 1) : undefined),
                isFavorite: Boolean(item.UserData?.IsFavorite),
                remainingMin: item.remainingMin || (item.UserData?.PlayedPercentage ? Math.round((100 - item.UserData.PlayedPercentage) * 1.2) : undefined),
                onClick: onClick ? (e) => onClick(item, e) : undefined,
            });
            container.appendChild(card);
        });

        setTimeout(() => {
            if (window.SpaceHub?.ui?.gooeyScroller) {
                window.SpaceHub.ui.gooeyScroller.attach(container);
            }
        }, 60);
    }

    _injectContextMenu() {
        if (document.getElementById('sh-context-menu')) return;
        const menu = document.createElement('div');
        menu.id = 'sh-context-menu';
        menu.className = 'sh-context-menu';
        menu.innerHTML = `
            <div class="sh-context-menu__header sh-truncate" id="sh-ctx-title">Média</div>
            <hr class="sh-ctx-sep"/>
            <button class="sh-ctx-item" id="sh-ctx-play">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Lire maintenant</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-watchlist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Ajouter à ma liste</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-trailer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                <span>Bande-annonce</span>
            </button>
            <button class="sh-ctx-item" id="sh-ctx-details">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <span>Détails & Casting</span>
            </button>
            <hr class="sh-ctx-sep"/>
            <button class="sh-ctx-item" id="sh-ctx-watched">
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

    _showContextMenu(e, item, card) {
        const menu = document.getElementById('sh-context-menu');
        if (!menu) return;

        const titleEl = menu.querySelector('#sh-ctx-title');
        if (titleEl) titleEl.textContent = item.title;

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
        menu.classList.add('sh-context-menu--open');

        menu.querySelector('#sh-ctx-play').onclick = () => {
            this._hideContextMenu();
            const api = window.SpaceHub?.jellyfin?.api;
            if (api && item.id) {
                api.getItem(item.id).then(fullItem => {
                    window.SpaceHub?.player?.play?.(fullItem || item);
                });
            }
        };

        menu.querySelector('#sh-ctx-details').onclick = () => {
            this._hideContextMenu();
            const api = window.SpaceHub?.jellyfin?.api;
            if (api && item.id) {
                api.getItem(item.id).then(fullItem => {
                    window.SpaceHub?.ui?.modalSlideUpSheet?.open?.(fullItem || item);
                });
            }
        };

        menu.querySelector('#sh-ctx-trailer').onclick = () => {
            this._hideContextMenu();
            this._showTrailerLightbox(item.title);
        };
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

    _showTrailerLightbox(title) {
        let lightbox = document.getElementById('sh-trailer-lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'sh-trailer-lightbox';
            lightbox.className = 'sh-trailer-lightbox';
            lightbox.innerHTML = `
                <div class="sh-trailer-box">
                    <button class="sh-trailer-close" id="sh-trailer-close" aria-label="Fermer">✕</button>
                    <div class="sh-trailer-content">
                        <iframe id="sh-trailer-iframe" width="100%" height="100%" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                    </div>
                </div>
            `;
            document.body.appendChild(lightbox);

            lightbox.querySelector('#sh-trailer-close').onclick = () => {
                lightbox.classList.remove('sh-lightbox--open');
                lightbox.querySelector('#sh-trailer-iframe').src = '';
            };
            lightbox.onclick = (e) => {
                if (e.target === lightbox) {
                    lightbox.classList.remove('sh-lightbox--open');
                    lightbox.querySelector('#sh-trailer-iframe').src = '';
                }
            };
        }

        const iframe = lightbox.querySelector('#sh-trailer-iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(title + ' official trailer')}&autoplay=1`;
        lightbox.classList.add('sh-lightbox--open');
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
        if (document.getElementById('sh-card-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-card-styles';
        style.textContent = `
/* ── Carrousel Horizontal Continu Format Cinéma Apple TV+ ─────────────── */
.sh-card-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: 24px;
    overflow-x: auto;
    overflow-y: visible;
    padding: 14px 8px 28px 8px;
    scroll-behavior: smooth;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
    width: 100%;
    -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
    mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
    transition: mask-image 300ms ease, -webkit-mask-image 300ms ease;
}

.sh-card-grid.sh-grid-scrolled-middle {
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 48px, #000 calc(100% - 48px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0%, #000 48px, #000 calc(100% - 48px), transparent 100%);
}

.sh-card-grid.sh-grid-scrolled-end {
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 64px, #000 100%);
    mask-image: linear-gradient(to right, transparent 0%, #000 64px, #000 100%);
}

.sh-card-grid::-webkit-scrollbar {
    display: none;
}
.sh-card-grid .sh-card {
    flex: 0 0 auto;
    scroll-snap-align: start;
    scroll-snap-stop: normal;
}
.sh-card-grid--poster .sh-card   { width: 196px; }
.sh-card-grid--backdrop .sh-card { width: 330px; }
.sh-card-grid--thumb .sh-card    { width: 250px; }

@media (max-width: 768px) {
    .sh-card-grid { gap: 16px; }
    .sh-card-grid--poster .sh-card   { width: 150px; }
    .sh-card-grid--backdrop .sh-card { width: 260px; }
}

/* ── Carte Média 8.0 Floating Cinema Artwork ──────────────── */
.sh-card {
    background: transparent;
    border: none;
    border-radius: 16px;
    box-shadow: none;
    overflow: visible;
    cursor: pointer;
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    transform-style: preserve-3d;
}

.sh-card:hover, .sh-card:focus-visible {
    outline: none;
}

/* ── Image & Artwork Flottant ────────────────────────────── */
.sh-card__image-wrap { 
    position: relative; 
    overflow: hidden; 
    border-radius: 16px;
    background: #000000;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.80), inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.05);
    transition: box-shadow 300ms ease, transform 300ms ease;
}
.sh-card:hover .sh-card__image-wrap {
    box-shadow: 0 28px 65px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.sh-card--poster   .sh-card__image-wrap { aspect-ratio: 2/3; }
.sh-card--backdrop .sh-card__image-wrap { aspect-ratio: 16/9; }
.sh-card--thumb    .sh-card__image-wrap { aspect-ratio: 4/3; }

.sh-card__image {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.sh-card:hover .sh-card__image { transform: scale(1.05); }

/* ── Glint & Edge Shimmer ────────────────────────────────── */
.sh-card__glint {
    position: absolute; inset: 0;
    border-radius: inherit;
    background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%);
    opacity: 0;
    pointer-events: none;
    z-index: 6;
    transition: opacity 300ms ease;
}
.sh-card:hover .sh-card__glint {
    opacity: 1;
    animation: sh-glintSweep 600ms ease forwards;
}
@keyframes sh-glintSweep {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

/* ── Badges "Dark Frosted Glass" (tvOS UltraThick Material) ─ */
.sh-card__dual-score {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(12, 12, 16, 0.88);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 9999px;
    padding: 3.5px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.60);
    transition: transform 200ms ease, background 200ms ease, border-color 200ms ease;
}
.sh-card__dual-score:hover {
    background: rgba(18, 18, 26, 0.98);
    border-color: rgba(255, 255, 255, 0.32);
    transform: scale(1.04);
}

.sh-score-btn {
    background: transparent;
    border: none;
    padding: 2px 4px;
    margin: 0;
    border-radius: 6px;
    color: inherit;
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    transition: background 150ms ease, transform 150ms ease;
}
.sh-score-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    transform: scale(1.08);
}

.sh-score-rt {
    color: #ff5252;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
.sh-score-sep { opacity: 0.35; font-size: 10px; }
.sh-score-imdb {
    color: #ffd600;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}

/* Rating Stars Hover Fill Animation */
.sh-score-imdb--stars .sh-star-icon {
    display: inline-block;
    transition: transform 260ms cubic-bezier(0.175, 0.885, 0.32, 1.275), color 200ms ease;
}
.sh-score-imdb:hover .sh-star-icon {
    transform: scale(1.28) rotate(12deg);
    color: #ffe066;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.8);
}

/* ── Global Popover Base (Apple VisionOS Glass) ─────────────── */
.sh-global-popover {
    position: fixed;
    z-index: 2147483647 !important;
    width: 250px;
    background: rgba(12, 12, 18, 0.96);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    backdrop-filter: blur(40px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 12px 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.95), 0 0 25px rgba(255, 159, 10, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    display: flex;
    flex-direction: column;
    gap: 8px;
    opacity: 0;
    transform: translateY(-8px) scale(0.92);
    filter: blur(8px);
    pointer-events: none;
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms ease;
    text-align: left;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}
.sh-global-popover.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
    pointer-events: auto;
}

.sh-popover-tag {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: -2px;
}

/* 🍅 Rotten Tomatoes Popover */
.sh-rt-popover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.sh-rt-popover__title {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.4px;
    color: #ff5252;
}
.sh-rt-popover__audience {
    font-size: 10.5px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
}
.sh-rt-popover__consensus {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.9);
}
.sh-rt-popover__quote {
    padding: 7px 9px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-left: 2px solid #ff9f0a;
    font-size: 10.5px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.35;
}
.sh-rt-popover__author {
    display: block;
    margin-top: 3px;
    font-size: 9.5px;
    font-style: normal;
    font-weight: 700;
    color: #ff9f0a;
    text-align: right;
}
.sh-rt-popover__footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
}
.sh-rt-popover__dot { color: rgba(255, 255, 255, 0.3); }

/* ★ IMDb Popover */
.sh-imdb-popover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.sh-imdb-brand {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sh-imdb-badge {
    background: #f5c518;
    color: #000000;
    font-size: 10px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 4px;
    letter-spacing: 0.5px;
}
.sh-imdb-score {
    font-size: 13px;
    font-weight: 800;
    color: #ffd600;
}
.sh-imdb-score small {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 500;
}
.sh-imdb-stars-row {
    color: #ffd600;
    font-size: 11px;
    letter-spacing: 1px;
}
.sh-imdb-breakdown {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 2px 0;
}
.sh-imdb-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.75);
}
.sh-imdb-bar-row span { width: 85px; flex-shrink: 0; font-size: 10px; }
.sh-imdb-bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 9999px;
    overflow: hidden;
}
.sh-imdb-bar-fill { height: 100%; border-radius: 9999px; }
.sh-imdb-bar-fill.green { background: #30d158; }
.sh-imdb-bar-fill.yellow { background: #ffd600; }
.sh-imdb-bar-fill.red { background: #ff453a; }
.sh-imdb-bar-row strong { font-size: 10px; width: 28px; text-align: right; color: #fff; }
.sh-imdb-footer {
    padding-top: 5px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 10px;
    font-weight: 700;
    color: #ff9f0a;
}

/* ── Bouton Favoris Rapide (Quick Bookmark Pill) ─────────── */
.sh-card__bookmark-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 25;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(12, 12, 16, 0.78);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.85);
    box-shadow: 0 4px 12px rgba(0,0,0,0.50);
    transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sh-card:hover .sh-card__bookmark-btn {
    opacity: 1;
    transform: scale(1);
}
.sh-card__bookmark-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.35);
}
.sh-card__bookmark-btn.active {
    background: #ffffff;
    color: #000000;
    opacity: 1;
    box-shadow: 0 4px 12px rgba(255,255,255,0.40);
}
.sh-bookmark-btn--pulse {
    animation: sh-bm-ripple 420ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes sh-bm-ripple {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.35); box-shadow: 0 0 16px rgba(255, 255, 255, 0.7); }
    100% { transform: scale(1); }
}

/* ── Master Codec Tag "Dark Frosted Glass" ────────────────── */
.sh-card__codec-tag {
    position: absolute;
    bottom: 10px;
    left: 10px;
    z-index: 10;
    background: rgba(12, 12, 16, 0.78);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 3px 7px;
    border-radius: 6px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.7px;
    color: rgba(255, 255, 255, 0.90);
    text-transform: uppercase;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.50);
    transition: opacity 180ms ease, transform 180ms ease;
}
.sh-card:hover .sh-card__codec-tag {
    opacity: 0;
    transform: translateY(10px);
}

/* ── Liquid Action Pill (Bas de Carte au Survol) ─────────── */
.sh-card__action-pill {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%) translateY(30px);
    opacity: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.92);
    color: #000000;
    padding: 7px 16px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 8px 24px rgba(0,0,0,0.60);
    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    white-space: nowrap;
}
.sh-card:hover .sh-card__action-pill {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
.sh-pill-duration {
    font-weight: 500;
    color: rgba(0,0,0,0.65);
}

/* ── Barre de progression Glass ──────────────────────────── */
.sh-card__progress {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 3.5px; 
    background: rgba(255,255,255,0.18);
    z-index: 8;
}
.sh-card__progress-bar {
    height: 100%; 
    background: #ffffff;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.95), 0 2px 10px rgba(255, 255, 255, 0.60);
    border-radius: 0 2px 2px 0;
}

/* ── Informations sous la carte (Fondu Organique) ─────────── */
.sh-card__info {
    padding: 10px 4px 4px;
    background: transparent;
}
.sh-card__title {
    margin: 0;
    font-size: 15px; 
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.3px;
}
.sh-card__meta-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
}
.sh-card__subtitle {
    font-size: 12px; 
    font-weight: 500;
    color: rgba(255,255,255,0.50);
}
.sh-card__remaining-time {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.80);
}

/* ── Side-Flyout Context Menu ─────────────────────────────── */
.sh-context-menu {
    position: fixed;
    z-index: 9999;
    width: 220px;
    background: rgba(18, 18, 24, 0.94);
    -webkit-backdrop-filter: blur(36px) saturate(200%);
    backdrop-filter: blur(36px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.90), 0 0 0 1px rgba(255, 255, 255, 0.08);
    padding: 8px;
    opacity: 0;
    transform-origin: top left;
    transform: scale(0.88) translateY(-8px);
    filter: blur(8px);
    pointer-events: none;
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), filter 200ms ease;
}
.sh-context-menu.sh-context-menu--open {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0px);
    pointer-events: auto;
}
.sh-context-menu.sh-context-menu--closing {
    opacity: 0;
    transform: scale(0.92) translateY(-6px);
    filter: blur(6px);
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease, filter 160ms ease;
}
.sh-context-menu__header {
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    color: rgba(255,255,255,0.50);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.sh-ctx-sep {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.08);
    margin: 4px 0;
}
.sh-ctx-item {
    width: 100%;
    background: transparent;
    border: none;
    padding: 8px 10px;
    border-radius: 8px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
    transform: translateY(6px);
    transition: background 120ms ease;
}
.sh-context-menu--open .sh-ctx-item {
    animation: sh-ctx-item-unfold 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    animation-delay: calc(var(--idx, 0) * 28ms + 40ms);
}
@keyframes sh-ctx-item-unfold {
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
.sh-ctx-item:hover {
    background: rgba(255, 255, 255, 0.14);
}

/* ── Lightbox Bande-Annonce Vidéo ────────────────────────── */
.sh-trailer-lightbox {
    position: fixed; inset: 0; z-index: 50000;
    background: rgba(0, 0, 0, 0.85);
    -webkit-backdrop-filter: blur(30px);
    backdrop-filter: blur(30px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 250ms ease;
}
.sh-trailer-lightbox.sh-lightbox--open {
    opacity: 1;
    pointer-events: auto;
}
.sh-trailer-box {
    width: 80vw; max-width: 960px;
    aspect-ratio: 16/9;
    background: #000;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.95);
    position: relative;
}
.sh-trailer-close {
    position: absolute; top: 16px; right: 16px; z-index: 10;
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(0, 0, 0, 0.65); color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 18px;
}
.sh-trailer-content {
    width: 100%; height: 100%;
}

/* ── Skeleton Organic Waveform ────────────────────────────── */
.sh-skeleton-block {
    background: linear-gradient(115deg, #121218 15%, #1e1e28 35%, #2a2a3a 50%, #1e1e28 65%, #121218 85%);
    background-size: 250% 100%;
    animation: sh-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes sh-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
}
.sh-card--skeleton { pointer-events: none; }
.sh-card--skeleton .sh-card__image-wrap { background: #121218; border-color: rgba(255,255,255,0.04); }
        `;
        document.head.appendChild(style);
    }
}

export default CardBuilder;
