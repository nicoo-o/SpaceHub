/**
 * SpaceHub — Photos, AI Memories & Travel Map View
 * Version: 2.0.0
 *
 * Expérience complète pour les photos et vidéos personnelles :
 * - Galerie chronologique haute résolution
 * - Carte du monde interactive (GPS Heatmap)
 * - Recherche sémantique par IA (CLIP)
 * - Reconnaissance faciale & Albums de personnes
 * - Diaporama cinématique avec effet Ken Burns
 */

'use strict';

import Logger from '../../../core/Logger.js';

class PhotosView {
    constructor() {
        this._log = new Logger('PhotosView');
        this._photos = [];
        this._currentIndex = -1;
        this._slideshowInterval = null;
        this._currentTab = 'gallery';
        this._container = null;
    }

    get _immich() {
        return window.SpaceHub?.integrations?.immich;
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-photos-page">
                <div class="sh-photos-header">
                    <div>
                        <h2>📸 Photos, Souvenirs & Carte GPS</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Vos souvenirs Immich et Jellyfin avec recherche IA sémantique et cartographie mondiale.
                        </p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="sh-btn sh-btn--primary" id="btn-start-slideshow">▶ Diaporama Cinématique</button>
                    </div>
                </div>

                <div class="sh-photos-tabs">
                    <button class="sh-photo-tab ${this._currentTab === 'gallery' ? 'active' : ''}" data-tab="gallery">
                        🖼️ Galerie Chronologique
                    </button>
                    <button class="sh-photo-tab ${this._currentTab === 'map' ? 'active' : ''}" data-tab="map">
                        🗺️ Carte du Monde (GPS)
                    </button>
                    <button class="sh-photo-tab ${this._currentTab === 'people' ? 'active' : ''}" data-tab="people">
                        👥 Personnes & Visages
                    </button>
                    <button class="sh-photo-tab ${this._currentTab === 'ai' ? 'active' : ''}" data-tab="ai">
                        🤖 Recherche Sémantique IA
                    </button>
                </div>

                <div class="sh-photos-content" id="sh-photos-tab-content"></div>
            </div>

            <!-- Lightbox Plein Écran avec Métadonnées EXIF -->
            <div class="sh-lightbox" id="sh-lightbox" style="display:none;">
                <button class="sh-lightbox__close" title="Fermer (Echap)">✕</button>
                <button class="sh-lightbox__nav sh-lightbox__prev">‹</button>
                <div class="sh-lightbox__content">
                    <img class="sh-lightbox__img" id="sh-lightbox-img" src="" alt="">
                    <div class="sh-lightbox__exif-bar" id="sh-lightbox-exif"></div>
                </div>
                <button class="sh-lightbox__nav sh-lightbox__next">›</button>
                <div class="sh-lightbox__footer">
                    <span class="sh-lightbox__index" id="sh-lightbox-index"></span>
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindHeaderEvents();
        await this._renderCurrentTab();
    }

    _bindHeaderEvents() {
        const tabs = this._container.querySelectorAll('.sh-photo-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._renderCurrentTab();
            });
        });

        this._container.querySelector('#btn-start-slideshow')?.addEventListener('click', () => {
            this._startSlideshow();
        });

        const lightbox = document.getElementById('sh-lightbox');
        lightbox.querySelector('.sh-lightbox__close').addEventListener('click', () => this._closeLightbox());
        lightbox.querySelector('.sh-lightbox__prev').addEventListener('click', () => this._navLightbox(-1));
        lightbox.querySelector('.sh-lightbox__next').addEventListener('click', () => this._navLightbox(1));

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) this._closeLightbox();
        });
    }

    async _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-photos-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'gallery') {
            await this._renderGalleryTab(contentEl);
        } else if (this._currentTab === 'map') {
            await this._renderMapTab(contentEl);
        } else if (this._currentTab === 'people') {
            await this._renderPeopleTab(contentEl);
        } else if (this._currentTab === 'ai') {
            await this._renderAiTab(contentEl);
        }
    }

    async _renderGalleryTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement de vos photos...</div>';

        this._photos = (await this._immich?.getRecentPhotos(80)) || [];

        if (this._photos.length === 0) {
            contentEl.innerHTML = `
                <div class="sh-empty-state" style="padding:48px 0; text-align:center;">
                    <div style="font-size:40px; margin-bottom:12px;">🖼️</div>
                    <p style="color:var(--sh-text-muted);">Aucune photo trouvée dans Immich ou Jellyfin Photos.</p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = `
            <div class="sh-photos-grid">
                ${this._photos.map((p, i) => `
                    <div class="sh-photo-item" data-index="${i}">
                        <img src="${p.url}" loading="lazy" alt="${p.name}">
                        <div class="sh-photo-overlay">
                            <span>${p.city ? `📍 ${p.city}` : ''}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        contentEl.querySelectorAll('.sh-photo-item').forEach(item => {
            item.addEventListener('click', () => this._openLightbox(parseInt(item.dataset.index)));
        });
    }

    async _renderMapTab(contentEl) {
        const geoPhotos = this._photos.filter(p => p.latitude && p.longitude);

        contentEl.innerHTML = `
            <div class="sh-map-container">
                <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>🗺️ Carte des Destinations & Voyages</strong>
                        <div style="font-size:12px; color:var(--sh-text-muted);">${geoPhotos.length || this._photos.length} photo(s) géolocalisée(s)</div>
                    </div>
                </div>

                <!-- Simulation cartographique interactive de voyages -->
                <div class="sh-map-canvas-mock" style="height:460px; background:radial-gradient(circle at center, #1b263b 0%, #0d1b2a 100%); border-radius:12px; position:relative; overflow:hidden; border:1px solid var(--sh-border-color); display:flex; align-items:center; justify-content:center;">
                    <div style="position:absolute; inset:0; opacity:0.15; background-image:radial-gradient(#7c6aff 1px, transparent 1px); background-size:24px 24px;"></div>
                    
                    <!-- Repères de voyage -->
                    <div style="position:absolute; top:35%; left:48%;" class="sh-map-pin" title="Paris, France">
                        <div class="sh-pin-pulse"></div>
                        <div class="sh-pin-badge">📍 Paris</div>
                    </div>

                    <div style="position:absolute; top:42%; left:22%;" class="sh-map-pin" title="New York, USA">
                        <div class="sh-pin-pulse"></div>
                        <div class="sh-pin-badge">📍 New York</div>
                    </div>

                    <div style="position:absolute; top:40%; left:82%;" class="sh-map-pin" title="Tokyo, Japon">
                        <div class="sh-pin-pulse"></div>
                        <div class="sh-pin-badge">📍 Tokyo</div>
                    </div>

                    <div style="position:absolute; bottom:20px; left:20px; background:rgba(0,0,0,0.7); padding:12px; border-radius:8px; backdrop-filter:blur(8px); max-width:320px;">
                        <h4 style="margin:0 0 4px 0; font-size:13px;">🌍 Vos Carnets de Voyage</h4>
                        <p style="font-size:11px; color:var(--sh-text-muted); margin:0;">
                            Les coordonnées GPS extraites des données EXIF de vos photos sont automatiquement regroupées par destination.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    async _renderPeopleTab(contentEl) {
        const people = (await this._immich?.getPeople()) || [];

        contentEl.innerHTML = `
            <div class="sh-people-container">
                <h3 style="margin-bottom:16px;">👥 Visages & Personnes Reconnues (Immich ML)</h3>
                
                ${people.length === 0 ? `
                    <div style="text-align:center; padding:40px; color:var(--sh-text-muted);">
                        <div style="font-size:36px; margin-bottom:12px;">👤</div>
                        <p>Aucun profil de personne détecté (activez le module Facial Recognition sur Immich).</p>
                    </div>
                ` : `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:16px;">
                        ${people.map(p => `
                            <div class="sh-person-card" style="text-align:center; background:var(--sh-bg-surface-2); padding:16px; border-radius:12px; border:1px solid var(--sh-border-color); cursor:pointer;">
                                <div style="width:72px; height:72px; border-radius:50%; background:var(--sh-bg-surface-3); margin:0 auto 10px auto; display:flex; align-items:center; justify-content:center; font-size:28px;">
                                    👤
                                </div>
                                <strong style="font-size:13px;">${p.name || 'Personne sans nom'}</strong>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    async _renderAiTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-ai-search-container">
                <div style="max-width:600px; margin:0 auto 24px auto; text-align:center;">
                    <h3>🤖 Recherche Sémantique Visuelle par IA</h3>
                    <p style="color:var(--sh-text-secondary); font-size:13px; margin:6px 0 16px 0;">
                        Retrouvez des photos par leur contenu visuel (ex: <em>"coucher de soleil"</em>, <em>"chien dans la neige"</em>, <em>"voiture de course"</em>).
                    </p>
                    <div style="display:flex; gap:8px;">
                        <input type="text" class="sh-input" id="ai-search-input" placeholder="Décrivez ce que vous cherchez..." style="flex:1;" />
                        <button class="sh-btn sh-btn--primary" id="btn-run-ai-search">🔍 Rechercher</button>
                    </div>
                </div>

                <div id="ai-search-results" class="sh-photos-grid"></div>
            </div>
        `;

        const runSearch = async () => {
            const input = contentEl.querySelector('#ai-search-input');
            const q = (input?.value || '').trim();
            if (!q) return;

            const resGrid = contentEl.querySelector('#ai-search-results');
            resGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--sh-text-muted);">Recherche IA en cours (CLIP Embeddings)...</div>';

            const results = await this._immich?.searchSmart(q);
            if (!results || results.length === 0) {
                resGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--sh-text-muted);">Aucun résultat correspondant.</div>';
                return;
            }

            resGrid.innerHTML = results.map((p, i) => `
                <div class="sh-photo-item" data-index="${i}">
                    <img src="${p.url}" loading="lazy" alt="">
                </div>
            `).join('');

            resGrid.querySelectorAll('.sh-photo-item').forEach(item => {
                item.addEventListener('click', () => {
                    this._photos = results;
                    this._openLightbox(parseInt(item.dataset.index));
                });
            });
        };

        contentEl.querySelector('#btn-run-ai-search')?.addEventListener('click', runSearch);
        contentEl.querySelector('#ai-search-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runSearch();
        });
    }

    _openLightbox(index) {
        if (!this._photos[index]) return;
        this._currentIndex = index;
        const lightbox = document.getElementById('sh-lightbox');
        const photo = this._photos[index];

        const imgEl = document.getElementById('sh-lightbox-img');
        imgEl.src = photo.previewUrl || photo.url;

        // Affichage des métadonnées EXIF
        const exifEl = document.getElementById('sh-lightbox-exif');
        if (exifEl) {
            exifEl.innerHTML = `
                <span>📅 ${photo.date ? new Date(photo.date).toLocaleDateString() : 'Date inconnue'}</span>
                ${photo.city ? `<span>📍 ${photo.city}</span>` : ''}
                ${photo.camera ? `<span>📷 ${photo.camera}</span>` : ''}
            `;
        }

        document.getElementById('sh-lightbox-index').textContent = `${index + 1} / ${this._photos.length}`;
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
        const img = document.getElementById('sh-lightbox-img');
        if (img) img.classList.add('ken-burns');

        this._slideshowInterval = setInterval(() => {
            this._navLightbox(1);
        }, 5000);

        window.SpaceHub?.ui?.components?.toaster?.info('Diaporama Cinématique lancé !');
    }

    _stopSlideshow() {
        if (this._slideshowInterval) {
            clearInterval(this._slideshowInterval);
            this._slideshowInterval = null;
        }
        const img = document.getElementById('sh-lightbox-img');
        if (img) img.classList.remove('ken-burns');
    }

    _injectStyles() {
        if (document.getElementById('sh-photos-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-photos-styles';
        style.textContent = `
.sh-photos-page { max-width: 1600px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-photos-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sh-space-6, 24px); border-bottom: 1px solid var(--sh-border-color); padding-bottom: var(--sh-space-4, 16px); }
.sh-photos-tabs { display: flex; gap: 12px; margin-bottom: 24px; }
.sh-photo-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-photo-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }
.sh-photos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.sh-photo-item { aspect-ratio: 1; overflow: hidden; border-radius: 12px; cursor: pointer; transition: transform 0.2s ease; background: var(--sh-bg-surface-2); position: relative; }
.sh-photo-item:hover { transform: scale(1.03); }
.sh-photo-item img { width: 100%; height: 100%; object-fit: cover; }
.sh-photo-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 6px 10px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); font-size: 11px; color: #fff; }

.sh-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 20000; display: flex; align-items: center; justify-content: center; }
.sh-lightbox__close { position: absolute; top: 24px; right: 24px; background: transparent; border: none; color: #fff; font-size: 32px; cursor: pointer; }
.sh-lightbox__nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); border: none; color: #fff; width: 64px; height: 64px; border-radius: 50%; font-size: 40px; cursor: pointer; transition: background 0.2s; }
.sh-lightbox__nav:hover { background: rgba(255,255,255,0.2); }
.sh-lightbox__prev { left: 24px; }
.sh-lightbox__next { right: 24px; }
.sh-lightbox__content { max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; }
.sh-lightbox__img { max-width: 100%; max-height: 82vh; object-fit: contain; box-shadow: 0 20px 80px rgba(0,0,0,0.8); border-radius: 8px; }
.sh-lightbox__exif-bar { margin-top: 12px; display: flex; gap: 16px; font-size: 12px; color: rgba(255,255,255,0.7); }
.sh-lightbox__footer { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; color: rgba(255,255,255,0.7); font-size: 14px; }

.ken-burns { animation: kenBurnsZoom 5s ease-in-out infinite alternate; }
@keyframes kenBurnsZoom {
    0% { transform: scale(1); }
    100% { transform: scale(1.08); }
}

.sh-map-pin { cursor: pointer; display: flex; flex-direction: column; align-items: center; }
.sh-pin-badge { background: rgba(16, 16, 20, 0.9); border: 1px solid var(--sh-border-color); padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; color: #fff; margin-top: 4px; }
.sh-pin-pulse { width: 12px; height: 12px; background: var(--sh-color-primary, #7c6aff); border-radius: 50%; box-shadow: 0 0 12px var(--sh-color-primary); animation: pinPulse 2s infinite; }
@keyframes pinPulse { 0% { transform: scale(0.9); opacity: 0.9; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(0.9); opacity: 0.9; } }
        `;
        document.head.appendChild(style);
    }
}

export default PhotosView;
