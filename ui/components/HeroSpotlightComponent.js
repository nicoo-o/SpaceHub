/**
 * SpaceHub — Hero Spotlight Component (Apple TV & Netflix Style)
 * Version: 1.0.0
 *
 * Grand bandeau immersif "Hero Spotlight" affiché en haut du dashboard :
 * - Backdrop haute résolution en plein écran avec dégradés cinématiques
 * - Titre / ClearLogo, note IMDb, année, genre et durée
 * - Boutons d'action immédiats : ▶ Regarder / Reprendre, 🍿 Bande-Annonce, ➕ Ma Liste, ℹ️ Détails
 */

'use strict';

import Logger from '../../core/Logger.js';

class HeroSpotlightComponent {
    constructor() {
        this._log = new Logger('HeroSpotlight');
        this._featuredItem = null;
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère l'élément à la une (le film le plus récent ou en cours de lecture).
     * @returns {Promise<Object|null>}
     */
    async fetchFeaturedItem() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const userId = this._auth?.getUserId();
            const headers = this._auth?.getAuthHeaders();

            if (!serverUrl || !userId) return null;

            // 1. Chercher d'abord dans les reprises de lecture (Resume)
            const resumeRes = await fetch(`${serverUrl}/Users/${userId}/Items/Resume?Limit=1&Fields=Overview,Genres,PrimaryImageAspectRatio,BackdropImageTags,CommunityRating,PremiereDate,RunTimeTicks`, { headers });
            if (resumeRes.ok) {
                const data = await resumeRes.json();
                if (data.Items && data.Items.length > 0) {
                    this._featuredItem = data.Items[0];
                    return this._featuredItem;
                }
            }

            // 2. Sinon chercher le dernier film populaire ajouté
            const latestRes = await fetch(`${serverUrl}/Users/${userId}/Items/Latest?IncludeItemTypes=Movie&Limit=1&Fields=Overview,Genres,PrimaryImageAspectRatio,BackdropImageTags,CommunityRating,PremiereDate,RunTimeTicks`, { headers });
            if (latestRes.ok) {
                const data = await latestRes.json();
                if (Array.isArray(data) && data.length > 0) {
                    this._featuredItem = data[0];
                    return this._featuredItem;
                }
            }
        } catch (err) {
            this._log.warn('Erreur récupération Hero Spotlight:', err.message);
        }

        return null;
    }

    render(container, item = null) {
        const feat = item || this._featuredItem;
        if (!feat) return;

        const serverUrl = this._auth?.getServerUrl();
        const token = this._auth?.getToken();

        // Récupération de l'image de fond (Backdrop)
        let backdropUrl = '';
        if (feat.BackdropImageTags && feat.BackdropImageTags.length > 0) {
            backdropUrl = `${serverUrl}/Items/${feat.Id}/Images/Backdrop/0?tag=${feat.BackdropImageTags[0]}&maxWidth=1920&quality=90&api_key=${token}`;
        } else if (feat.ImageTags?.Primary) {
            backdropUrl = `${serverUrl}/Items/${feat.Id}/Images/Primary?tag=${feat.ImageTags.Primary}&maxWidth=1920&quality=90&api_key=${token}`;
        }

        const year = feat.PremiereDate ? new Date(feat.PremiereDate).getFullYear() : (feat.ProductionYear || '');
        const rating = feat.CommunityRating ? `★ ${feat.CommunityRating.toFixed(1)}` : '';
        const genres = (feat.Genres || []).slice(0, 3).join(' · ');
        const overview = (feat.Overview || 'Découvrez ce chef-d\'œuvre disponible dès maintenant sur votre serveur SpaceHub.').slice(0, 220) + '…';

        const isResume = !!(feat.UserData?.PlaybackPositionTicks);
        const playLabel = isResume ? '▶ Reprendre' : '▶ Regarder';

        container.innerHTML = `
            <div class="sh-hero-spotlight" style="background-image: url('${backdropUrl}');">
                <div class="sh-hero-gradient-overlay"></div>
                <div class="sh-hero-content">
                    <div class="sh-hero-badges">
                        <span class="sh-hero-badge-featured">🌟 À LA UNE</span>
                        ${rating ? `<span class="sh-hero-badge-rating">${rating}</span>` : ''}
                        ${year ? `<span class="sh-hero-badge-meta">${year}</span>` : ''}
                        <span class="sh-hero-badge-meta">4K HDR</span>
                    </div>

                    <h1 class="sh-hero-title">${feat.Name}</h1>
                    ${genres ? `<div class="sh-hero-genres">${genres}</div>` : ''}
                    <p class="sh-hero-overview">${overview}</p>

                    <div class="sh-hero-actions">
                        <button class="sh-btn sh-btn--primary sh-hero-btn-play" id="hero-btn-play">
                            ${playLabel}
                        </button>
                        <button class="sh-btn sh-btn--ghost sh-hero-btn-trailer" id="hero-btn-trailer">
                            🍿 Bande-Annonce
                        </button>
                        <button class="sh-btn sh-btn--ghost sh-hero-btn-watchlist" id="hero-btn-watchlist" title="Ajouter à ma liste">
                            ➕ Ma Liste
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindEvents(container, feat);
    }

    _bindEvents(container, feat) {
        container.querySelector('#hero-btn-play')?.addEventListener('click', () => {
            window.SpaceHub?.player?.play(feat);
        });

        container.querySelector('#hero-btn-trailer')?.addEventListener('click', () => {
            window.SpaceHub?.trailerService?.openTrailerModal(feat);
        });

        container.querySelector('#hero-btn-watchlist')?.addEventListener('click', () => {
            window.SpaceHub?.core?.discovery?.toggleWatchlist?.(feat);
            window.SpaceHub?.ui?.components?.toaster?.success(`"${feat.Name}" ajouté à votre liste.`);
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-hero-spotlight-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-hero-spotlight-styles';
        style.textContent = `
.sh-hero-spotlight {
    position: relative;
    width: 100%;
    height: 480px;
    background-size: cover;
    background-position: center 20%;
    border-radius: 20px;
    overflow: hidden;
    margin-bottom: 32px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.sh-hero-gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        to right,
        rgba(8, 8, 12, 0.95) 0%,
        rgba(8, 8, 12, 0.75) 45%,
        rgba(8, 8, 12, 0.2) 100%
    ),
    linear-gradient(
        to top,
        rgba(8, 8, 12, 1) 0%,
        transparent 50%
    );
}

.sh-hero-content {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 48px 48px;
    max-width: 680px;
}

.sh-hero-badges {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.sh-hero-badge-featured {
    background: var(--sh-color-primary, #7c6aff);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 6px;
    letter-spacing: 1px;
}

.sh-hero-badge-rating {
    background: rgba(243, 156, 18, 0.25);
    color: #f39c12;
    border: 1px solid rgba(243, 156, 18, 0.5);
    font-size: 12px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
}

.sh-hero-badge-meta {
    background: rgba(255, 255, 255, 0.1);
    color: var(--sh-text-secondary, #b0b0cc);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    backdrop-filter: blur(8px);
}

.sh-hero-title {
    font-size: 42px;
    font-weight: 900;
    color: #ffffff;
    margin: 0 0 8px 0;
    line-height: 1.15;
    text-shadow: 0 4px 24px rgba(0,0,0,0.8);
}

.sh-hero-genres {
    font-size: 13px;
    font-weight: 600;
    color: var(--sh-color-primary, #7c6aff);
    margin-bottom: 12px;
    letter-spacing: 0.5px;
}

.sh-hero-overview {
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.85);
    margin: 0 0 24px 0;
    text-shadow: 0 2px 10px rgba(0,0,0,0.9);
}

.sh-hero-actions {
    display: flex;
    gap: 14px;
    align-items: center;
}

.sh-hero-btn-play {
    padding: 12px 28px;
    font-size: 15px;
    font-weight: 800;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(124, 106, 255, 0.4);
    transition: transform 0.2s, box-shadow 0.2s;
}

.sh-hero-btn-play:hover {
    transform: scale(1.04);
    box-shadow: 0 12px 32px rgba(124, 106, 255, 0.6);
}

.sh-hero-btn-trailer, .sh-hero-btn-watchlist {
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(12px);
    color: #fff;
    transition: all 0.2s;
}

.sh-hero-btn-trailer:hover, .sh-hero-btn-watchlist:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
}

@media (max-width: 768px) {
    .sh-hero-spotlight { height: 380px; }
    .sh-hero-content { padding: 24px; }
    .sh-hero-title { font-size: 26px; }
    .sh-hero-overview { display: none; }
}
        `;
        document.head.appendChild(style);
    }
}

export default HeroSpotlightComponent;
