/**
 * SpaceHub — Full-Bleed Monochromic Hero Spotlight (KefinTweaks Style)
 * Version: 2.0.0
 *
 * Présentation cinéma immersive plein écran (Edge-to-Edge) :
 * - Occupe toute la largeur sans bordures avec fondu dégradé dans le fond OLED
 * - Vidéo d'arrière-plan / bande-annonce automatique en boucle (son muet avec toggle 🔊)
 * - Titre haute définition, synopsis complet et badges de qualité (4K HDR, Dolby, Note IMDb)
 * - Affiche / Poster 3D flottant à droite
 * - Boutons d'action immédiats Monochromic épurés (Style Apple TV / Netflix)
 */

'use strict';

import Logger from '../../core/Logger.js';

class HeroSpotlightComponent {
    constructor() {
        this._log = new Logger('HeroSpotlight');
        this._featuredItem = null;
        this._videoEl = null;
        this._isMuted = true;
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
            const resumeRes = await fetch(`${serverUrl}/Users/${userId}/Items/Resume?Limit=1&Fields=Overview,Genres,PrimaryImageAspectRatio,BackdropImageTags,ImageTags,CommunityRating,PremiereDate,RunTimeTicks,MediaSources`, { headers });
            if (resumeRes.ok) {
                const data = await resumeRes.json();
                if (data.Items && data.Items.length > 0) {
                    this._featuredItem = data.Items[0];
                    return this._featuredItem;
                }
            }

            // 2. Sinon chercher le dernier film populaire ajouté
            const latestRes = await fetch(`${serverUrl}/Users/${userId}/Items/Latest?IncludeItemTypes=Movie&Limit=1&Fields=Overview,Genres,PrimaryImageAspectRatio,BackdropImageTags,ImageTags,CommunityRating,PremiereDate,RunTimeTicks,MediaSources`, { headers });
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

        // Récupération de l'affiche (Poster)
        let posterUrl = '';
        if (feat.ImageTags?.Primary) {
            posterUrl = `${serverUrl}/Items/${feat.Id}/Images/Primary?tag=${feat.ImageTags.Primary}&maxWidth=600&quality=90&api_key=${token}`;
        }

        // Flux vidéo pour le background trailer preview
        const videoStreamUrl = `${serverUrl}/Videos/${feat.Id}/stream?static=true&api_key=${token}`;

        const year = feat.PremiereDate ? new Date(feat.PremiereDate).getFullYear() : (feat.ProductionYear || '');
        const rating = feat.CommunityRating ? `★ ${feat.CommunityRating.toFixed(1)}` : '';
        const genres = (feat.Genres || []).slice(0, 3).join(' · ');
        const overview = (feat.Overview || 'Découvrez ce chef-d\'œuvre disponible dès maintenant sur votre serveur SpaceHub.').slice(0, 280) + '…';

        const isResume = !!(feat.UserData?.PlaybackPositionTicks);
        const playLabel = isResume ? '▶ Reprendre' : '▶ Regarder';

        container.innerHTML = `
            <div class="sh-hero-monochromic">
                <!-- Vidéo d'arrière-plan muette (Trailer Preview) -->
                <video class="sh-hero-bg-video" autoplay muted loop playsinline poster="${backdropUrl}">
                    <source src="${videoStreamUrl}" type="video/mp4">
                </video>

                <!-- Calque d'image de secours & dégradé cinématographique -->
                <div class="sh-hero-backdrop-fallback" style="background-image: url('${backdropUrl}');"></div>
                <div class="sh-hero-gradient-overlay"></div>

                <div class="sh-hero-inner">
                    <!-- Colonne de gauche : Infos & Actions -->
                    <div class="sh-hero-left">
                        <div class="sh-hero-badges">
                            <span class="sh-hero-badge-featured">🌟 À LA UNE</span>
                            ${rating ? `<span class="sh-hero-badge-rating">${rating}</span>` : ''}
                            ${year ? `<span class="sh-hero-badge-meta">${year}</span>` : ''}
                            <span class="sh-hero-badge-meta">4K ULTRA HD</span>
                            <span class="sh-hero-badge-meta">DOLBY VISION</span>
                        </div>

                        <h1 class="sh-hero-title">${this._escape(feat.Name)}</h1>
                        ${genres ? `<div class="sh-hero-genres">${this._escape(genres)}</div>` : ''}
                        <p class="sh-hero-overview">${this._escape(overview)}</p>

                        <div class="sh-hero-actions">
                            <button class="sh-hero-btn-play" id="hero-btn-play">
                                ${playLabel}
                            </button>
                            <button class="sh-hero-btn-glass" id="hero-btn-trailer">
                                🍿 Bande-Annonce
                            </button>
                            <button class="sh-hero-btn-glass" id="hero-btn-watchlist" title="Ajouter à ma liste">
                                ➕ Ma Liste
                            </button>
                            <button class="sh-hero-btn-icon" id="hero-btn-sound" title="Activer / Couper le son de l'aperçu">
                                <span id="hero-sound-icon">🔇</span>
                            </button>
                        </div>
                    </div>

                    <!-- Colonne de droite : Affiche / Poster 3D flottante -->
                    ${posterUrl ? `
                        <div class="sh-hero-right">
                            <div class="sh-hero-poster-frame">
                                <img src="${posterUrl}" alt="${this._escape(feat.Name)}" class="sh-hero-poster-img" />
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindEvents(container, feat);
    }

    _bindEvents(container, feat) {
        this._videoEl = container.querySelector('.sh-hero-bg-video');

        // Play principal
        container.querySelector('#hero-btn-play')?.addEventListener('click', () => {
            window.SpaceHub?.player?.play(feat);
        });

        // Trailer modal
        container.querySelector('#hero-btn-trailer')?.addEventListener('click', () => {
            window.SpaceHub?.trailerService?.openTrailerModal(feat);
        });

        // Watchlist
        container.querySelector('#hero-btn-watchlist')?.addEventListener('click', () => {
            window.SpaceHub?.core?.discovery?.toggleWatchlist?.(feat);
            window.SpaceHub?.ui?.components?.toaster?.success(`"${feat.Name}" ajouté à votre liste.`);
        });

        // Toggle Audio Preview
        const soundBtn = container.querySelector('#hero-btn-sound');
        const soundIcon = container.querySelector('#hero-sound-icon');

        soundBtn?.addEventListener('click', () => {
            if (!this._videoEl) return;
            this._isMuted = !this._isMuted;
            this._videoEl.muted = this._isMuted;
            if (soundIcon) {
                soundIcon.textContent = this._isMuted ? '🔇' : '🔊';
            }
        });
    }

    _escape(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    }

    _injectStyles() {
        if (document.getElementById('sh-hero-spotlight-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-hero-spotlight-styles';
        style.textContent = `
/* Grand Hero Plein Écran (Monochromic / KefinTweaks) */
.sh-hero-monochromic {
    position: relative;
    width: 100vw;
    margin-left: calc(-50vw + 50%);
    height: 76vh;
    min-height: 520px;
    max-height: 720px;
    overflow: hidden;
    margin-top: -24px;
    margin-bottom: 36px;
    background: #050505;
}

/* Vidéo de fond en boucle */
.sh-hero-bg-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
    z-index: 1;
    opacity: 0.85;
}

/* Fallback image avec zoom lent */
.sh-hero-backdrop-fallback {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center 20%;
    z-index: 0;
    animation: shKenBurns 25s infinite alternate ease-in-out;
}

@keyframes shKenBurns {
    0% { transform: scale(1); }
    100% { transform: scale(1.08); }
}

/* Dégradés cinématiques Monochromic (fond noir profond) */
.sh-hero-gradient-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: 
        linear-gradient(to right, #050505 0%, rgba(5, 5, 5, 0.85) 35%, rgba(5, 5, 5, 0.4) 65%, rgba(5, 5, 5, 0.7) 100%),
        linear-gradient(to top, #050505 0%, rgba(5, 5, 5, 0.8) 25%, transparent 60%),
        linear-gradient(to bottom, rgba(5, 5, 5, 0.7) 0%, transparent 20%);
}

.sh-hero-inner {
    position: relative;
    z-index: 3;
    width: 100%;
    max-width: 1560px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 48px;
    box-sizing: border-box;
}

/* Colonne Gauche */
.sh-hero-left {
    max-width: 680px;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.sh-hero-badges {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}

.sh-hero-badge-featured {
    background: #ffffff;
    color: #050505;
    font-size: 11px;
    font-weight: 900;
    padding: 4px 10px;
    border-radius: 6px;
    letter-spacing: 1px;
}

.sh-hero-badge-rating {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-size: 12px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 6px;
    backdrop-filter: blur(10px);
}

.sh-hero-badge-meta {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 6px;
    backdrop-filter: blur(8px);
}

.sh-hero-title {
    font-size: 48px;
    font-weight: 900;
    color: #ffffff;
    margin: 0 0 10px 0;
    line-height: 1.12;
    letter-spacing: -0.8px;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.9);
}

.sh-hero-genres {
    font-size: 14px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 14px;
    letter-spacing: 0.5px;
}

.sh-hero-overview {
    font-size: 15px;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.85);
    margin: 0 0 28px 0;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.9);
}

/* Boutons Monochromic */
.sh-hero-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}

.sh-hero-btn-play {
    background: #ffffff;
    color: #050505;
    border: none;
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 800;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(255, 255, 255, 0.25);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.sh-hero-btn-play:hover {
    transform: scale(1.04);
    box-shadow: 0 12px 32px rgba(255, 255, 255, 0.4);
}

.sh-hero-btn-glass {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 13px 22px;
    font-size: 14px;
    font-weight: 700;
    border-radius: 12px;
    cursor: pointer;
    backdrop-filter: blur(16px);
    transition: all 0.2s ease;
}

.sh-hero-btn-glass:hover {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.35);
    transform: translateY(-2px);
}

.sh-hero-btn-icon {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(16px);
    transition: all 0.2s ease;
}

.sh-hero-btn-icon:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.08);
}

/* Colonne Droite : Poster 3D */
.sh-hero-right {
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-hero-poster-frame {
    width: 240px;
    aspect-ratio: 2 / 3;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.18);
    transform: perspective(800px) rotateY(-8deg) scale(1.02);
    transition: transform 0.4s ease, box-shadow 0.4s ease;
}

.sh-hero-poster-frame:hover {
    transform: perspective(800px) rotateY(0deg) scale(1.06);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(255, 255, 255, 0.2);
}

.sh-hero-poster-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

@media (max-width: 1024px) {
    .sh-hero-right { display: none; }
    .sh-hero-inner { padding: 0 24px; }
    .sh-hero-title { font-size: 34px; }
}

@media (max-width: 768px) {
    .sh-hero-monochromic { height: 440px; min-height: auto; }
    .sh-hero-title { font-size: 26px; }
    .sh-hero-overview { display: none; }
}
        `;
        document.head.appendChild(style);
    }
}

export default HeroSpotlightComponent;
