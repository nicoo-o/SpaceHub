/**
 * SpaceHub — CardBuilder (composant)
 * Version: 0.3.0
 *
 * Constructeur de cartes médias SpaceHub.
 * Wraps le cardBuilder existant (scripts/cardBuilder.js) et ajoute
 * les styles SpaceHub via les design tokens.
 *
 * Usage:
 *   const builder = new CardBuilder();
 *   const card = builder.createCard({
 *       id: item.Id,
 *       title: item.Name,
 *       subtitle: String(item.ProductionYear ?? ''),
 *       imageUrl: SpaceHub.core.api.getClient('jellyfin').getImageUrl(item.Id),
 *       type: 'poster',    // 'poster' | 'backdrop' | 'thumb'
 *       badge: 'HD',
 *       progress: 0.65,    // 0..1 (barre de progression)
 *       rating: 8.4,
 *       onClick: () => navigateTo(item),
 *   });
 *   container.appendChild(card);
 */

'use strict';

import Logger from '../../core/Logger.js';

/** @typedef {'poster'|'backdrop'|'thumb'} CardType */

class CardBuilder {
    constructor() {
        this._log = new Logger('CardBuilder');
        this._injectStyles();
        this._injectContextMenu();
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
            type = 'poster', badge, progress, rating,
            rottenScore, codec = '4K DV • ATMOS',
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

        // Score Rotten Tomatoes calculé ou fourni (null si dossier / bibliothèque)
        const hasScores = (rottenScore !== null && rottenScore !== undefined) || (rating !== null && rating !== undefined);
        const rtScore = hasScores ? (rottenScore || (rating ? Math.min(99, Math.round(rating * 10 + 5)) : 92)) : null;
        const imdbScore = hasScores ? (rating ? Number(rating).toFixed(1) : '8.6') : null;

        card.innerHTML = `
            <div class="sh-card__image-wrap">
                ${imageUrl
                    ? `<img class="sh-card__image" src="${this._escape(imageUrl)}" alt="${this._escape(title)}" loading="lazy" onerror="this.onerror=null;this.src='${encodedFallback}';"/>`
                    : `<img class="sh-card__image" src="${encodedFallback}" alt="${this._escape(title)}" />`}
                
                <!-- Reflet de Bord Glass Glint -->
                <div class="sh-card__glint"></div>

                <!-- Dual Score Dark Frosted Glass Capsule (RT + ★) Ultra-Compact & Épuré -->
                ${hasScores ? `
                <div class="sh-card__dual-score" data-rt="${rtScore}" title="Rotten Tomatoes: ${rtScore}% | IMDb: ${imdbScore}/10">
                    <span class="sh-score-rt">🍅 ${rtScore}%</span>
                    <span class="sh-score-sep">│</span>
                    <!-- IMDb Stars hover fill -->
                    <span class="sh-score-imdb sh-score-imdb--stars" data-score="${imdbScore}">
                        <span class="sh-star-icon">★</span> ${imdbScore}
                    </span>
                    <!-- RT Consensus Popover -->
                    <div class="sh-rt-popover">
                        <span class="sh-rt-popover__text">${rtScore >= 90 ? 'Certified Fresh — Chef-d\'œuvre unanimement salué' : rtScore >= 70 ? 'Fresh — Fortement recommandé par la critique' : rtScore >= 60 ? 'Frais — Avis partagés mais positifs' : 'Rotten — Reçu négativement'}</span>
                    </div>
                </div>
                ` : ''}

                <!-- Bouton Favoris Rapide Quick Bookmark (Haut Droite) -->
                <button class="sh-card__bookmark-btn ${isFavorite ? 'active' : ''}" aria-label="Ajouter aux favoris" title="Ajouter à ma liste">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>

                ${badge ? `<span class="sh-card__badge">${this._escape(badge)}</span>` : ''}
                ${isNew ? `<span class="sh-card__badge sh-card__badge--new">NEW</span>` : ''}

                <!-- Master Codec Badge (Infuse Pro style) -->
                <div class="sh-card__codec-tag">${this._escape(codec)}</div>

                <!-- Liquid Action Pill (Apparaît au survol en bas de carte) -->
                <div class="sh-card__action-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>${typeof progress === 'number' ? 'Continuer' : (hasScores ? 'Regarder' : 'Ouvrir')}</span>
                    ${remainingMin ? `<span class="sh-pill-duration">• ${remainingMin}m</span>` : ''}
                </div>

                <!-- Barre de progression Glass avec lueur -->
                ${typeof progress === 'number'
                    ? `<div class="sh-card__progress">
                           <div class="sh-card__progress-bar" style="width:${Math.min(100, Math.round(progress * 100))}%"></div>
                       </div>`
                    : ''}
            </div>

            <!-- Informations sous la carte -->
            <div class="sh-card__info">
                <p class="sh-card__title sh-truncate">${this._escape(title)}</p>
                <div class="sh-card__meta-line">
                    ${subtitle ? `<span class="sh-card__subtitle">${this._escape(subtitle)}</span>` : ''}
                    ${remainingMin ? `<span class="sh-card__remaining-time">${remainingMin} min restantes</span>` : ''}
                </div>
            </div>
        `;

        // Action Favoris Rapide (Totalement isolée de la carte et synchronisée avec Jellyfin)
        const bookmarkBtn = card.querySelector('.sh-card__bookmark-btn');
        bookmarkBtn?.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        bookmarkBtn?.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        bookmarkBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            bookmarkBtn.classList.toggle('active');
            bookmarkBtn.classList.remove('sh-bookmark-btn--pulse');
            void bookmarkBtn.offsetWidth; // reflow
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

        // Effet Tilt 3D + Magnetic Pull Cursor (Approche < 40px → légère attraction)
        card.addEventListener('mousemove', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn')) return;
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

        // Tactile Spring Press Physics — compression organique au clic
        card.addEventListener('mousedown', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn')) return;
            card.style.transition = 'transform 80ms ease';
            card.style.transform = 'scale(0.97)';
        });
        card.addEventListener('mouseup', (e) => {
            if (e.target.closest('.sh-card__bookmark-btn')) return;
            card.style.transition = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.style.transform = '';
        });

        // Événements de clic
        if (onClick) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.sh-card__bookmark-btn')) return;
                onClick(e);
            });
            card.addEventListener('keydown', e => { 
                if (e.key === 'Enter' || e.key === ' ') { 
                    if (e.target.closest('.sh-card__bookmark-btn')) return;
                    e.preventDefault(); 
                    onClick(e); 
                } 
            });
        }

        // Clic-droit : Side-Flyout Popover Menu (À côté de la carte sans la cacher)
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e, { id, title, type }, card);
            if (onContextMenu) onContextMenu(e);
        });

        return card;
    }

    /**
     * Crée un skeleton (placeholder de chargement) pour une carte.
     * @param {'poster'|'backdrop'|'thumb'} [type]
     * @returns {HTMLElement}
     */
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

    /**
     * Crée une grille de N skeletons (état de chargement).
     * @param {number} count
     * @param {CardType} [type]
     * @returns {HTMLElement}
     */
    createSkeletonGrid(count = 8, type = 'poster') {
        const grid = document.createElement('div');
        grid.className = `sh-card-grid sh-card-grid--${type}`;
        for (let i = 0; i < count; i++) grid.appendChild(this.createSkeleton(type));
        return grid;
    }

    /**
     * Remplit une grille de cartes à partir d'un tableau d'items.
     */
    renderGrid(container, items, options = {}) {
        const { type = 'poster', getImageUrl, onClick } = options;
        container.innerHTML = '';
        container.className = `sh-card-grid sh-card-grid--${type}`;

        items.forEach(item => {
            const card = this.createCard({
                id:       item.Id,
                title:    item.Name ?? 'Inconnu',
                subtitle: item.subtitle || (item.ProductionYear ? String(item.ProductionYear) : (item.Type ?? '')),
                imageUrl: item.customImage || (getImageUrl?.(item) ?? ''),
                type,
                rottenScore: item.rottenScore,
                codec: item.codec || (type === 'backdrop' ? '4K DOLBY VISION' : '4K DV • ATMOS'),
                progress: item.UserData?.PlayedPercentage
                    ? item.UserData.PlayedPercentage / 100
                    : (item.UserData?.PlaybackPositionTicks ? item.UserData.PlaybackPositionTicks / (item.RunTimeTicks || 1) : undefined),
                rating: item.rottenScore === null && item.CommunityRating === null ? null : (item.CommunityRating !== undefined ? item.CommunityRating : null),
                isFavorite: Boolean(item.UserData?.IsFavorite),
                remainingMin: item.remainingMin || (item.UserData?.PlayedPercentage ? Math.round((100 - item.UserData.PlayedPercentage) * 1.2) : undefined),
                onClick: onClick ? (e) => onClick(item, e) : undefined,
            });
            container.appendChild(card);
        });

        // Attachement automatique du défilement et des chevrons de navigation
        setTimeout(() => {
            if (window.SpaceHub?.ui?.gooeyScroller) {
                window.SpaceHub.ui.gooeyScroller.attach(container);
            }
        }, 60);
    }

    // ─── Side-Flyout Context Menu (Arc / Linear Style) ──────────────────────────

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

        // Fermeture au clic extérieur avec animation fluide
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

        // Positionnement latéral Side-Flyout (ne cache jamais l'affiche)
        const cardRect = card ? card.getBoundingClientRect() : { right: e.clientX, left: e.clientX, top: e.clientY };
        const menuWidth = 220;
        const menuHeight = 250;

        let left = cardRect.right + 14;
        // Si débordement sur la droite de l'écran, bascule sur le côté gauche de la carte
        if (left + menuWidth > window.innerWidth - 20) {
            left = Math.max(10, cardRect.left - menuWidth - 14);
        }

        let top = Math.max(20, Math.min(cardRect.top, window.innerHeight - menuHeight - 20));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        // Animation en cascade décalée pour chaque item
        const items = menu.querySelectorAll('.sh-ctx-item');
        items.forEach((it, idx) => {
            it.style.setProperty('--idx', idx);
        });

        // Réinitialisation forcée de l'animation pour rejouer à chaque clic-droit consécutif
        menu.classList.remove('sh-context-menu--open');
        void menu.offsetWidth; // Force DOM reflow
        menu.classList.add('sh-context-menu--open');

        // Actions
        menu.querySelector('#sh-ctx-play').onclick = () => {
            this._hideContextMenu();
            if (window.Emby?.Page?.showItem) window.Emby.Page.showItem(item.id);
            else window.location.hash = `#/details?id=${item.id}`;
        };
        menu.querySelector('#sh-ctx-watchlist').onclick = () => {
            this._hideContextMenu();
            window.SpaceHub?.ui?.components?.toaster?.success(`"${item.title}" ajouté à votre liste.`);
        };
        menu.querySelector('#sh-ctx-trailer').onclick = () => {
            this._hideContextMenu();
            this._showTrailerLightbox(item.title);
        };
        menu.querySelector('#sh-ctx-details').onclick = () => {
            this._hideContextMenu();
            if (window.SpaceHub?.ui?.modalSlideUpSheet) {
                window.SpaceHub.ui.modalSlideUpSheet.open(item);
            } else {
                window.location.hash = `#/details?id=${item.id}`;
            }
        };
        menu.querySelector('#sh-ctx-watched').onclick = () => {
            this._hideContextMenu();
            window.SpaceHub?.ui?.components?.toaster?.info(`"${item.title}" marqué comme vu.`);
        };
    }

    _hideContextMenu() {
        const menu = document.getElementById('sh-context-menu');
        if (menu) {
            menu.classList.remove('sh-context-menu--open');
        }
    }

    // ─── Lightbox Bande-Annonce Vidéo ───────────────────────────────────────────

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

    // ─── Helpers ─────────────────────────────────────────────────────────────────

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
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
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
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(12, 12, 16, 0.82);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 9999px;
    padding: 3.5px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.60);
    cursor: pointer;
    transition: transform 200ms ease, background 200ms ease, border-color 200ms ease;
}
.sh-card__dual-score:hover {
    background: rgba(18, 18, 26, 0.94);
    border-color: rgba(255, 255, 255, 0.28);
    transform: scale(1.04);
}

.sh-score-rt {
    color: #ff5252;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    gap: 2px;
}
.sh-score-sep { opacity: 0.35; font-size: 10px; }
.sh-score-imdb {
    color: #ffd600;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    gap: 2px;
}

/* Rating Stars Hover Fill Animation */
.sh-score-imdb--stars .sh-star-icon {
    display: inline-block;
    transition: transform 260ms cubic-bezier(0.175, 0.885, 0.32, 1.275), color 200ms ease;
}
.sh-card:hover .sh-score-imdb--stars .sh-star-icon {
    transform: scale(1.25) rotate(12deg);
    color: #ffe066;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.8);
}

/* RT Consensus Popover */
.sh-rt-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 100;
    width: 190px;
    background: rgba(14, 14, 20, 0.94);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    backdrop-filter: blur(28px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    padding: 8px 10px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: flex-start;
    gap: 8px;
    opacity: 0;
    transform: translateY(6px) scale(0.95);
    pointer-events: none;
    transition: opacity 220ms ease, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sh-card__dual-score:hover .sh-rt-popover {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}
.sh-rt-popover__icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 1px;
}
.sh-rt-popover__text {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.88);
}

/* ── Bouton Favoris Rapide (Quick Bookmark Pill) ─────────── */
.sh-card__bookmark-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
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
    background: rgba(255, 255, 255, 0.20);
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

/* ── Side-Flyout Context Menu (Déroulement Volet & Cascade) ── */
.sh-context-menu {
    position: fixed;
    z-index: 9999;
    width: 220px;
    background: rgba(18, 18, 24, 0.92);
    -webkit-backdrop-filter: blur(36px) saturate(200%);
    backdrop-filter: blur(36px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.90), 0 0 0 1px rgba(255, 255, 255, 0.08);
    padding: 8px;
    opacity: 0;
    transform-origin: top left;
    transform: scaleY(0.4) scaleX(0.88) translateY(-8px);
    pointer-events: none;
    transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-context-menu.sh-context-menu--open {
    opacity: 1;
    transform: scaleY(1) scaleX(1) translateY(0);
    pointer-events: auto;
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
