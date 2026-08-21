/**
 * SpaceHub — Photos View (Immich)
 * Version: 1.0.0
 *
 * Affiche la bibliothèque de photos personnelles via l'intégration Immich.
 */

'use strict';

import Logger from '../../../core/Logger.js';

class PhotosView {
    constructor() {
        this._log = new Logger('PhotosView');
        this._photos = [];
        this._currentIndex = -1;
        this._slideshowInterval = null;
    }

    async render(container) {
        this._injectStyles();
        container.innerHTML = `
            <div class="sh-view sh-photos-view">
                <header class="sh-view__header">
                    <div class="sh-view__titles">
                        <h2 class="sh-view__title">📸 Photos & Souvenirs</h2>
                        <p class="sh-view__subtitle">Propulsé par Immich</p>
                    </div>
                    <div class="sh-view__actions">
                        <button class="sh-btn sh-btn--primary sh-btn-slideshow">▶ Diaporama</button>
                    </div>
                </header>
                <div class="sh-photos-grid" id="sh-photos-grid">
                    <div class="sh-loader">Chargement des photos...</div>
                </div>
            </div>

            <!-- Lightbox -->
            <div class="sh-lightbox" id="sh-lightbox" style="display:none;">
                <button class="sh-lightbox__close">✕</button>
                <button class="sh-lightbox__nav sh-lightbox__prev">‹</button>
                <div class="sh-lightbox__content">
                    <img class="sh-lightbox__img" src="" alt="">
                </div>
                <button class="sh-lightbox__nav sh-lightbox__next">›</button>
                <div class="sh-lightbox__footer">
                    <span class="sh-lightbox__index"></span>
                </div>
            </div>
        `;

        this._loadPhotos();
        this._bindEvents(container);
    }

    _bindEvents(container) {
        container.querySelector('.sh-btn-slideshow').addEventListener('click', () => this._startSlideshow());

        const lightbox = document.getElementById('sh-lightbox');
        lightbox.querySelector('.sh-lightbox__close').addEventListener('click', () => this._closeLightbox());
        lightbox.querySelector('.sh-lightbox__prev').addEventListener('click', () => this._navLightbox(-1));
        lightbox.querySelector('.sh-lightbox__next').addEventListener('click', () => this._navLightbox(1));

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) this._closeLightbox();
        });
    }

    async _loadPhotos() {
        const grid = document.getElementById('sh-photos-grid');
        const service = window.SpaceHub?.integrations?.immich;

        if (!service || !service.api) {
            grid.innerHTML = `<div class="sh-no-data">Intégration Immich non configurée.</div>`;
            return;
        }

        try {
            this._photos = await service.getRecentPhotos();
            if (this._photos.length === 0) {
                grid.innerHTML = `<div class="sh-no-data">Aucune photo trouvée.</div>`;
                return;
            }

            grid.innerHTML = this._photos.map((p, i) => `
                <div class="sh-photo-item" data-index="${i}">
                    <img src="${service.api.getThumbnailUrl(p.id)}" loading="lazy" alt="">
                </div>
            `).join('');

            grid.querySelectorAll('.sh-photo-item').forEach(item => {
                item.addEventListener('click', () => this._openLightbox(parseInt(item.dataset.index)));
            });

        } catch (err) {
            this._log.error('Erreur chargement photos:', err);
            grid.innerHTML = `<div class="sh-no-data">Erreur de connexion à Immich.</div>`;
        }
    }

    _openLightbox(index) {
        this._currentIndex = index;
        const lightbox = document.getElementById('sh-lightbox');
        const photo = this._photos[index];
        const service = window.SpaceHub?.integrations?.immich;

        lightbox.querySelector('.sh-lightbox__img').src = service.api.getThumbnailUrl(photo.id, 'preview');
        lightbox.querySelector('.sh-lightbox__index').textContent = `${index + 1} / ${this._photos.length}`;
        lightbox.style.display = 'flex';

        document.body.style.overflow = 'hidden';
    }

    _navLightbox(dir) {
        let newIdx = this._currentIndex + dir;
        if (newIdx < 0) newIdx = this._photos.length - 1;
        if (newIdx >= this._photos.length) newIdx = 0;
        this._openLightbox(newIdx);
    }

    _closeLightbox() {
        document.getElementById('sh-lightbox').style.display = 'none';
        document.body.style.overflow = '';
        this._stopSlideshow();
    }

    _startSlideshow() {
        if (this._photos.length === 0) return;
        this._openLightbox(0);
        this._slideshowInterval = setInterval(() => this._navLightbox(1), 5000);
        window.SpaceHub?.ui?.components?.toaster?.info('Diaporama lancé');
    }

    _stopSlideshow() {
        if (this._slideshowInterval) {
            clearInterval(this._slideshowInterval);
            this._slideshowInterval = null;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-photos-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-photos-styles';
        style.textContent = `
.sh-photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    padding: 24px;
}

.sh-photo-item {
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.2s ease;
    background: var(--sh-bg-surface-2);
}

.sh-photo-item:hover {
    transform: scale(1.03);
}

.sh-photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.95);
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-lightbox__close {
    position: absolute;
    top: 24px;
    right: 24px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 32px;
    cursor: pointer;
}

.sh-lightbox__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    font-size: 40px;
    cursor: pointer;
    transition: background 0.2s;
}

.sh-lightbox__nav:hover { background: rgba(255,255,255,0.2); }
.sh-lightbox__prev { left: 24px; }
.sh-lightbox__next { right: 24px; }

.sh-lightbox__content {
    max-width: 90vw;
    max-height: 90vh;
}

.sh-lightbox__img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
    box-shadow: 0 20px 80px rgba(0,0,0,0.8);
}

.sh-lightbox__footer {
    position: absolute;
    bottom: 24px;
    left: 0;
    right: 0;
    text-align: center;
    color: rgba(255,255,255,0.7);
    font-size: 14px;
}
        `;
        document.head.appendChild(style);
    }
}

export default PhotosView;
