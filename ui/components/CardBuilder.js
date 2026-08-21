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
        this._log.info('Initialisé.');
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Crée un élément DOM représentant une carte média.
     * @param {{
     *   id: string,
     *   title: string,
     *   subtitle?: string,
     *   imageUrl?: string,
     *   type?: CardType,
     *   badge?: string,
     *   progress?: number,
     *   rating?: number,
     *   isNew?: boolean,
     *   onClick?: Function,
     *   onContextMenu?: Function,
     * }} options
     * @returns {HTMLElement}
     */
    createCard(options = {}) {
        const {
            id, title, subtitle = '', imageUrl = '',
            type = 'poster', badge, progress, rating,
            isNew = false, onClick, onContextMenu,
        } = options;

        const card = document.createElement('div');
        card.className   = `sh-card sh-card--${type}`;
        card.dataset.id  = id;
        card.tabIndex    = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', title);

        card.innerHTML = `
            <div class="sh-card__image-wrap">
                ${imageUrl
                    ? `<img class="sh-card__image" src="${this._escape(imageUrl)}" alt="${this._escape(title)}" loading="lazy"/>`
                    : `<div class="sh-card__image sh-card__image--placeholder"><span>🎬</span></div>`}
                ${badge ? `<span class="sh-card__badge">${this._escape(badge)}</span>` : ''}
                ${isNew ? `<span class="sh-card__badge sh-card__badge--new">NEW</span>` : ''}
                ${typeof progress === 'number'
                    ? `<div class="sh-card__progress">
                           <div class="sh-card__progress-bar" style="width:${Math.min(100, Math.round(progress * 100))}%"></div>
                       </div>`
                    : ''}
                <div class="sh-card__overlay">
                    <button class="sh-card__play" aria-label="Lire ${this._escape(title)}">▶</button>
                </div>
            </div>
            <div class="sh-card__info">
                <p class="sh-card__title sh-truncate">${this._escape(title)}</p>
                ${subtitle ? `<p class="sh-card__subtitle sh-truncate">${this._escape(subtitle)}</p>` : ''}
                ${typeof rating === 'number'
                    ? `<p class="sh-card__rating">⭐ ${rating.toFixed(1)}</p>`
                    : ''}
            </div>
        `;

        // Événements
        if (onClick) {
            card.addEventListener('click',  onClick);
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } });
        }
        if (onContextMenu) {
            card.addEventListener('contextmenu', e => { e.preventDefault(); onContextMenu(e); });
        }

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
     * Remplit une grille de cartes à partir d'un tableau d'items Jellyfin.
     * @param {HTMLElement} container
     * @param {Array<*>} items
     * @param {{ type?: CardType, getImageUrl: Function, onClick?: Function }} options
     */
    renderGrid(container, items, options = {}) {
        const { type = 'poster', getImageUrl, onClick } = options;
        container.innerHTML = '';
        container.className = `sh-card-grid sh-card-grid--${type}`;

        items.forEach(item => {
            const card = this.createCard({
                id:       item.Id,
                title:    item.Name ?? 'Inconnu',
                subtitle: item.ProductionYear ? String(item.ProductionYear) : (item.Type ?? ''),
                imageUrl: getImageUrl?.(item) ?? '',
                type,
                progress: item.UserData?.PlayedPercentage
                    ? item.UserData.PlayedPercentage / 100
                    : undefined,
                rating:   item.CommunityRating ?? undefined,
                onClick:  onClick ? (e) => onClick(item, e) : undefined,
            });
            container.appendChild(card);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

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
/* ── Grille ─────────────────────────────────────────────── */
.sh-card-grid {
    display: grid;
    gap: var(--sh-space-4, 16px);
}
.sh-card-grid--poster   { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.sh-card-grid--backdrop { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.sh-card-grid--thumb    { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }

@media (max-width: 640px) {
    .sh-card-grid--poster   { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
    .sh-card-grid--backdrop { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
}

/* ── Carte ───────────────────────────────────────────────── */
.sh-card {
    background: var(--sh-card-bg, var(--sh-bg-surface));
    border: 1px solid var(--sh-card-border, var(--sh-border-color));
    border-radius: var(--sh-card-radius, var(--sh-radius-md));
    box-shadow: var(--sh-card-shadow, var(--sh-shadow-md));
    overflow: hidden;
    cursor: pointer;
    transition: transform var(--sh-transition-base, 250ms), box-shadow var(--sh-transition-base, 250ms);
    position: relative;
}
.sh-card:hover, .sh-card:focus-visible {
    transform: translateY(-4px) scale(1.02);
    box-shadow: var(--sh-card-shadow-hover, var(--sh-shadow-lg));
    outline: 2px solid var(--sh-color-primary);
    outline-offset: 2px;
}

/* ── Image ───────────────────────────────────────────────── */
.sh-card__image-wrap { position: relative; overflow: hidden; }
.sh-card--poster   .sh-card__image-wrap { aspect-ratio: var(--sh-card-aspect-poster, 2/3); }
.sh-card--backdrop .sh-card__image-wrap { aspect-ratio: var(--sh-card-aspect-backdrop, 16/9); }
.sh-card--thumb    .sh-card__image-wrap { aspect-ratio: var(--sh-card-aspect-thumb, 4/3); }

.sh-card__image {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: transform var(--sh-transition-slow, 400ms);
}
.sh-card:hover .sh-card__image { transform: scale(1.06); }

.sh-card__image--placeholder {
    background: var(--sh-bg-surface-2);
    display: flex; align-items: center; justify-content: center;
    font-size: 48px; color: var(--sh-text-muted);
}

/* ── Badge ───────────────────────────────────────────────── */
.sh-card__badge {
    position: absolute; top: 8px; right: 8px;
    background: rgba(0,0,0,0.75);
    color: #fff;
    font-size: var(--sh-text-xs, 11px); font-weight: var(--sh-font-bold, 700);
    padding: 2px 6px;
    border-radius: var(--sh-radius-xs, 4px);
    backdrop-filter: blur(6px);
    text-transform: uppercase;
}
.sh-card__badge--new {
    background: var(--sh-color-primary);
    right: auto; left: 8px;
}

/* ── Barre de progression ────────────────────────────────── */
.sh-card__progress {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 3px; background: rgba(255,255,255,0.15);
}
.sh-card__progress-bar {
    height: 100%;
    background: var(--sh-color-primary);
    transition: width 0.3s ease;
}

/* ── Overlay (hover) ─────────────────────────────────────── */
.sh-card__overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
    transition: opacity var(--sh-transition-base, 250ms);
}
.sh-card:hover .sh-card__overlay { opacity: 1; }
.sh-card__play {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: rgba(var(--sh-color-primary-rgb, 124,106,255), 0.9);
    border: none; cursor: pointer; color: #fff;
    font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    transition: transform var(--sh-transition-spring, 350ms);
    transform: scale(0.8);
}
.sh-card:hover .sh-card__play { transform: scale(1); }

/* ── Infos ───────────────────────────────────────────────── */
.sh-card__info {
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px) var(--sh-space-3, 12px);
}
.sh-card__title {
    margin: 0;
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    color: var(--sh-text-primary, #f0f0f8);
    line-height: var(--sh-leading-tight, 1.25);
}
.sh-card__subtitle, .sh-card__rating {
    margin: 4px 0 0;
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
}

/* ── Skeleton ────────────────────────────────────────────── */
.sh-skeleton-block {
    background: linear-gradient(90deg, var(--sh-bg-surface-2) 25%, var(--sh-bg-surface-3) 50%, var(--sh-bg-surface-2) 75%);
    background-size: 200% 100%;
    animation: sh-shimmer 1.6s infinite;
}
@keyframes sh-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
}
.sh-card--skeleton { pointer-events: none; }
.sh-card--skeleton .sh-card__image-wrap { background: var(--sh-bg-surface-2); }
        `;
        document.head.appendChild(style);
    }
}

export default CardBuilder;
