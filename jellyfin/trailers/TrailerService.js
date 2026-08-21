/**
 * SpaceHub — Trailer Service & Player
 * Version: 1.0.0
 *
 * Service de recherche et lecture de bandes-annonces intégrées (Trailers).
 * Récupère les trailers depuis Jellyfin (RemoteTrailers), YouTube ou TMDB,
 * et les lit dans un lecteur cinématographique sans interrompre la navigation.
 */

'use strict';

import Logger from '../../core/Logger.js';

class TrailerService {
    constructor() {
        this._log = new Logger('TrailerService');
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Recherche l'URL de bande-annonce pour un média Jellyfin.
     * @param {Object} item - Média Jellyfin (Movie ou Series)
     * @returns {Promise<string|null>} URL embed YouTube ou vidéo directe
     */
    async getTrailerUrl(item) {
        if (!item) return null;

        // 1. Vérifier si Jellyfin a déjà un RemoteTrailer
        if (item.RemoteTrailers && item.RemoteTrailers.length > 0) {
            const trailer = item.RemoteTrailers[0];
            return this._formatTrailerUrl(trailer.Url);
        }

        // 2. Chercher via l'API Item Details de Jellyfin si pas déjà chargé
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Users/${this._auth?.getUserId()}/Items/${item.Id}`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (res.ok) {
                const fullItem = await res.json();
                if (fullItem.RemoteTrailers && fullItem.RemoteTrailers.length > 0) {
                    return this._formatTrailerUrl(fullItem.RemoteTrailers[0].Url);
                }
            }
        } catch (err) {
            this._log.warn('Erreur récupération RemoteTrailers:', err.message);
        }

        // 3. Fallback recherche YouTube Embed basée sur le titre
        const query = encodeURIComponent(`${item.Name} ${item.ProductionYear || ''} trailer officiel vf vostfr`);
        return `https://www.youtube-nocookie.com/embed?listType=search&list=${query}&autoplay=1`;
    }

    _formatTrailerUrl(url) {
        if (!url) return null;
        // Si c'est un lien YouTube standard (watch?v=... ou youtu.be/...)
        const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (ytMatch && ytMatch[1]) {
            return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1`;
        }
        return url;
    }

    /**
     * Ouvre la modale de lecture de bande-annonce.
     * @param {Object} item
     */
    async openTrailer(item) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const trailerUrl = await this.getTrailerUrl(item);

        const modal = new Modal({
            id: `trailer-${item.Id}`,
            title: `🎬 Bande-annonce : ${item.Name}`,
            size: 'xl',
            content: `
                <div class="sh-trailer-player-container">
                    <div class="sh-trailer-video-wrapper">
                        <iframe 
                            src="${trailerUrl}" 
                            title="${item.Name} - Bande-annonce"
                            frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                            allowfullscreen>
                        </iframe>
                    </div>
                    <div class="sh-trailer-footer">
                        <div>
                            <h4>${item.Name} ${item.ProductionYear ? `(${item.ProductionYear})` : ''}</h4>
                            <p class="sh-truncate" style="color:var(--sh-text-secondary); font-size:13px; max-width:600px;">
                                ${item.Overview || 'Aucun résumé disponible.'}
                            </p>
                        </div>
                        <button class="sh-btn sh-btn--primary" id="btn-play-from-trailer">
                            ▶ Lancer le film
                        </button>
                    </div>
                </div>
            `
        });

        modal.open();

        modal._el.querySelector('#btn-play-from-trailer')?.addEventListener('click', () => {
            modal.close();
            window.SpaceHub?.player?.play(item);
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-trailer-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-trailer-styles';
        style.textContent = `
.sh-trailer-player-container {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-4, 16px);
}

.sh-trailer-video-wrapper {
    position: relative;
    padding-bottom: 56.25%; /* 16:9 Ratio */
    height: 0;
    overflow: hidden;
    border-radius: var(--sh-radius-md, 12px);
    background: #000;
    box-shadow: 0 12px 36px rgba(0,0,0,0.6);
}

.sh-trailer-video-wrapper iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
}

.sh-trailer-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--sh-space-4, 16px);
    padding-top: var(--sh-space-2, 8px);
}

.sh-trailer-footer h4 {
    margin: 0 0 4px 0;
    font-size: var(--sh-text-lg, 18px);
    color: var(--sh-text-primary, #f0f0f8);
}
        `;
        document.head.appendChild(style);
    }
}

export default TrailerService;
