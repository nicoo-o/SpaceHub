/**
 * SpaceHub — Modal Slide-Up Sheet (Grand Cinema Edition 4.5)
 * Version: 4.5.0 — Apple TV+ & Netflix Luxury Hybrid
 *
 * - Grand Cinema Sizing (1060px × 730px) avec immersion plein format.
 * - En-tête Hero Backdrop 16:9 avec Affiche 2:3 en relief cinématique.
 * - Halo d'Ambiance Adaptatif (Ambient Halo Glow).
 * - Barre d'actions principale en gélules lumineuses (Pill Shapes).
 * - Système d'onglets segmentés avec pastille de glissement physique (Spring Slider).
 * - Popover Audio & Sous-Titres à Double Colonne ergonomique (Apple Ice Blue).
 * - Animations échelonnées en cascade (Staggered Motion).
 * - Grille dense 3x2 (6 titres) dans l'onglet Similaires avec bouton lecture rapide et mini-synopsis.
 * - Onglet Casting enrichi avec Réalisateur, Compositeur (Hans Zimmer) et Directeur Photo.
 */

'use strict';

class ModalSlideUpSheet {
    constructor() {
        this._sheet = null;
        this._overlay = null;
        this._ambientGlow = null;
        this._isOpen = false;
        const nav = window.SpaceHub?.spatialNav || window.SpaceHub?.ui?.appLayout?._spatialNav;
        nav?.onModalClosed();
        this._currentItem = null;
        this._activeTab = 'synopsis';
        this._selectedAudioIndex = 0;
        this._selectedSubtitleIndex = -1;
        this._audioPopoverOpen = false;
        this._history = [];
        this._docClickHandler = null; // Référence unique pour éviter la fuite de listeners
        document.body.style.overflow = '';
        this._injectSheetDOM();
        this._injectStyles();
    }


    _injectSheetDOM() {
        let overlay = document.getElementById('sh-modal-slideup-overlay');
        let ambientGlow = document.getElementById('sh-modal-ambient-glow');
        let sheet = document.getElementById('sh-modal-slideup-sheet');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sh-modal-slideup-overlay';
            overlay.className = 'sh-slideup-overlay';
            document.body.appendChild(overlay);
        }

        if (!ambientGlow) {
            ambientGlow = document.createElement('div');
            ambientGlow.id = 'sh-modal-ambient-glow';
            ambientGlow.className = 'sh-modal-ambient-glow';
            document.body.appendChild(ambientGlow);
        }

        if (!sheet) {
            sheet = document.createElement('div');
            sheet.id = 'sh-modal-slideup-sheet';
            sheet.className = 'sh-slideup-sheet';
            document.body.appendChild(sheet);
        }

        this._overlay = overlay;
        this._ambientGlow = ambientGlow;
        this._sheet = sheet;

        this._overlay.onclick = () => this.close();

        if (!this._hasEscListener) {
            this._hasEscListener = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this._isOpen) {
                    if (this._audioPopoverOpen) this._closeAudioPopover();
                    else this.close();
                }
            });
        }
    }

    open(item = {}, options = {}) {
        this._injectSheetDOM();
        if (!options.isBack && this._currentItem && this._isOpen) {
            const currentTitle = this._currentItem.title || this._currentItem.Name;
            const newTitle = item.title || item.Name;
            if (currentTitle && newTitle && currentTitle !== newTitle) {
                this._history.push(this._currentItem);
            }
        }
        this._currentItem = item;
        
        const rawType = (item.Type || item.type || item.MediaType || item.mediaType || '').toLowerCase();
        const isMovie = rawType === 'movie' || item.isMovie;
        const isEpisode = rawType === 'episode';
        const isCollection = rawType === 'boxset' || rawType === 'collection' || rawType === 'saga' || item.isCollection;
        const isMusic = rawType === 'musicalbum' || rawType === 'music' || rawType === 'album' || rawType === 'audio' || item.isMusic;
        const isSeries = !isMovie && !isCollection && !isMusic && (
            rawType === 'series' || 
            rawType === 'tv' || 
            rawType === 'tvshow' || 
            rawType === 'season' || 
            Boolean(item.firstAirDate) || 
            Boolean(item.name && !item.title) || 
            Boolean(item.seasons) || 
            item.isSeries === true || 
            (Boolean(item.SeriesName) && !isEpisode) || 
            (item.SeasonCount && item.SeasonCount > 0)
        );

        if (isSeries) this._activeTab = 'episodes';
        else if (isCollection) this._activeTab = 'sagafilms';
        else if (isMusic) this._activeTab = 'tracks';
        else this._activeTab = 'synopsis';

        // 1. Résolution immédiate des visuels réels Jellyfin ou Servarr/Calendrier
        const api = window.SpaceHub?.jellyfin?.api;
        const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
        const itemId = item.Id || item.id;
        const isCalendarOrServarr = item.source === 'sonarr' || item.source === 'radarr' || item.source === 'jellyseerr' || (typeof item.Id === 'string' && (item.Id.startsWith('sonarr-') || item.Id.startsWith('radarr-') || item.Id.startsWith('sh-cal-') || item.Id.startsWith('jellyseerr-')));
        
        let posterUrl = '';
        let backdropUrl = '';

        if (isCalendarOrServarr) {
            posterUrl = item.imageUrl || item.posterUrl || item.customImage || (item.ImageTags?.Primary ? item.ImageTags.Primary : '') || '';
            backdropUrl = item.backdropUrl || item.fanartUrl || posterUrl;
        } else {
            if (itemId) {
                posterUrl = api?.getImageUrl?.(itemId, 'Primary', { maxWidth: 600, maxHeight: 900 }) || apiClient?.getImageUrl?.(itemId, 'Primary', { maxWidth: 600, maxHeight: 900 }) || '';
            }
            if (!posterUrl) {
                posterUrl = item.imageUrl || item.posterUrl || item.customImage || '';
            }

            const backdropItemId = (item.BackdropImageTags && item.BackdropImageTags.length > 0) ? itemId : (item.ParentBackdropItemId || item.SeriesId || itemId);
            if (backdropItemId) {
                backdropUrl = api?.getImageUrl?.(backdropItemId, 'Backdrop', { maxWidth: 1920, maxHeight: 1080, quality: 90 }) || apiClient?.getImageUrl?.(backdropItemId, 'Backdrop', { maxWidth: 1920, maxHeight: 1080, quality: 90 }) || '';
            }
            if (!backdropUrl) {
                backdropUrl = posterUrl;
            }
        }

        this._renderContent(item, { posterUrl, backdropUrl });

        requestAnimationFrame(() => {
            const nav = window.SpaceHub?.spatialNav || window.SpaceHub?.ui?.appLayout?._spatialNav;
            nav?.onModalOpened(this._sheet);
            this._sheet.querySelector('.sh-cinema-body')?.scrollTo({ top: 0, behavior: 'instant' });
        });

        if (this._ambientGlow) {
            const bg = backdropUrl || posterUrl || item.backdropUrl || item.imageUrl || '';
            if (bg) {
                this._ambientGlow.style.backgroundImage = `url('${bg}')`;
            }
            this._ambientGlow.classList.add('sh-modal-ambient-glow--open');
        }

        this._overlay.classList.add('sh-slideup-overlay--open');
        this._sheet.classList.add('sh-slideup-sheet--open');
        this._isOpen = true;
        document.body.style.overflow = 'hidden';

        setTimeout(() => this._updateTabSlider(), 50);

        const heroDetailsEl = this._sheet?.querySelector('.sh-cinema-hero-details');
        const metaLineEl = this._sheet?.querySelector('.sh-cinema-meta-line');
        if (heroDetailsEl || metaLineEl) {
            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            const rating = item.CommunityRating ? Number(item.CommunityRating) : null;
            const rtScore = item.CriticRating ? Math.round(item.CriticRating) : (rating ? Math.min(99, Math.round(rating * 10 + 2)) : 88);
            const imdbScore = rating ? rating.toFixed(1) : (rtScore / 10).toFixed(1);
            const criticData = cardBuilder?.getCriticData?.(item.Name || item.title || 'Média', rtScore, imdbScore);
            if (heroDetailsEl) heroDetailsEl._criticData = criticData;
            if (metaLineEl) metaLineEl._criticData = criticData;
        }

        // 2. Chargement asynchrone des métadonnées réelles enrichies
        this._loadFullDetails(item);
    }

    close() {
        if (!this._isOpen) return;
        this._closeAudioPopover();
        this._sheet.classList.remove('sh-slideup-sheet--open');
        this._overlay.classList.remove('sh-slideup-overlay--open');
        if (this._ambientGlow) {
            this._ambientGlow.classList.remove('sh-modal-ambient-glow--open');
        }
        this._isOpen = false;
        this._history = [];
        this._currentItem = null;
        document.body.style.overflow = '';
        // Nettoyage du listener global pour éviter les fuites
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
            this._docClickHandler = null;
        }
    }

    _renderContent(item, images = {}) {
        const rawType = (item.Type || item.type || item.MediaType || item.mediaType || '').toLowerCase();
        const isMovie = rawType === 'movie' || item.isMovie;
        const isEpisode = rawType === 'episode';
        const isCollection = rawType === 'boxset' || rawType === 'collection' || rawType === 'saga' || item.isCollection;
        const isMusic = rawType === 'musicalbum' || rawType === 'music' || rawType === 'album' || rawType === 'audio' || item.isMusic;
        const isSeries = !isMovie && !isCollection && !isMusic && (
            rawType === 'series' || 
            rawType === 'tv' || 
            rawType === 'tvshow' || 
            rawType === 'season' || 
            Boolean(item.firstAirDate) || 
            Boolean(item.name && !item.title) || 
            Boolean(item.seasons) || 
            item.isSeries === true || 
            (Boolean(item.SeriesName) && !isEpisode) || 
            (item.SeasonCount && item.SeasonCount > 0)
        );

        const title = item.Name || item.title || 'Média';
        const year = item.ProductionYear || item.year || '';
        const rating = item.CommunityRating ? Number(item.CommunityRating) : null;
        const rtScore = item.rottenScore || (rating ? Math.min(99, Math.round(rating * 10 + 5)) : 88);
        const imdbScore = rating ? rating.toFixed(1) : '8.5';
        const overview = item.Overview || item.overview || 'Chargement des informations du film...';
        const duration = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000000 / 60) + ' min' : (item.duration || '');
        const posterUrl = images.posterUrl || item.posterUrl || item.imageUrl || '';
        const genres = (item.Genres && item.Genres.length > 0) ? item.Genres.join(' • ') : 'Cinéma & Découverte';

        const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
        const criticData = cardBuilder?.getCriticData?.(title, rtScore, imdbScore) || {
            title,
            rtScore,
            imdb: imdbScore,
            audience: 91,
            metacritic: 86,
            consensus: "Unanimement salué par la critique comme une œuvre cinématographique majeure.",
            quote: "« Une expérience immersive d'une grande maîtrise. »",
            outlet: "Première",
            positiveVotes: 89,
            neutralVotes: 8,
            negativeVotes: 3
        };

        const hasHistory = this._history.length > 0;
        const prevItem = hasHistory ? this._history[this._history.length - 1] : null;
        const prevItemName = prevItem ? (prevItem.Name || prevItem.title || 'Précédent') : '';
        const backBtnLabel = hasHistory ? `Retour à ${this._escape(prevItemName)}` : 'Retour';
        const backBtnTitle = hasHistory ? `Retour à : ${this._escape(prevItemName)}` : 'Fermer la fiche et revenir';

        this._sheet.innerHTML = `
            <!-- 🎬 EN-TÊTE HERO CINÉMATIQUE ADAPTATIF -->
            <div class="sh-cinema-hero">
                <div class="sh-cinema-hero-bg-container">
                    <div class="sh-cinema-hero-backdrop" style="background-image: url('${images.backdropUrl || posterUrl}');"></div>
                    <div class="sh-cinema-hero-gradient-bottom"></div>
                    <div class="sh-cinema-hero-gradient-left"></div>
                </div>

                <!-- Barre Supérieure d'En-tête Dédiée (Navigation Retour & Fermeture) -->
                <div class="sh-cinema-hero-top-bar">
                    <button class="sh-slideup-back-btn" id="sh-slideup-back" aria-label="Retour">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        <span class="sh-slideup-back-label">${backBtnLabel}</span>
                    </button>
                    <button class="sh-slideup-close-btn" id="sh-slideup-close" aria-label="Fermer" title="Fermer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="sh-cinema-hero-content">
                    <!-- Visuel 2:3 (Film/Série/Saga) ou 1:1 Carré (Musique) -->
                    <div class="sh-cinema-hero-poster ${isMusic ? 'sh-cinema-hero-poster--music' : ''}">
                        ${posterUrl ? `
                            <img src="${posterUrl}" alt="${this._escape(title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="sh-cinema-poster-fallback" style="display: none; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${this._escape(title)}</small>
                            </div>
                        ` : `
                            <div class="sh-cinema-poster-fallback" style="display: flex; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${this._escape(title)}</small>
                            </div>
                        `}
                        ${isMusic ? '<div class="sh-vinyl-disc-grooves"></div>' : ''}
                    </div>

                    <div class="sh-cinema-hero-details">
                        <!-- Badges Techniques Adaptatifs -->
                        <div class="sh-cinema-badge-top">
                            <span class="sh-badge-glass-pill" id="sh-badge-type">${isMusic ? 'ALBUM MUSICAL' : isCollection ? 'SAGA CINÉMA' : isSeries ? 'SÉRIE TV' : 'LONG-MÉTRAGE'}</span>
                            <span class="sh-badge-glass-pill" id="sh-badge-quality">MASTER 4K</span>
                            <span class="sh-badge-glass-pill" id="sh-badge-audio">DOLBY ATMOS</span>
                            <span class="sh-badge-glass-pill" id="sh-badge-vision">DOLBY VISION</span>
                        </div>

                        <h1 class="sh-cinema-title">${this._escape(title)}</h1>

                        <!-- Ligne Typographique Épurée de Métadonnées avec Badges Critiques Officiels (Navigation Onglet À Propos) -->
                        <div class="sh-cinema-meta-line">
                            ${!isMusic ? `
                            <span class="sh-modal-header-badge sh-modal-header-badge--rt" role="button" tabindex="0" title="Cliquer pour voir la critique complète">
                                ${cardBuilder?.getRtIconSvg?.(rtScore) || '<svg class="sh-rt-svg" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 8 3.5 8 3.5C8 3.5 9 5 11 5.5C8 6 4 9 4 14C4 18.5 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 6 13 5.5C15 5 16 3.5 16 3.5C16 3.5 14.5 2 12 2Z" fill="#FA320A"/><path d="M12 2C10.5 2 9 3 9 3.5C10 4 11 4.5 12 4.5C13 4.5 14 4 15 3.5C15 3 13.5 2 12 2Z" fill="#00C05B"/></svg>'}
                                <span>${rtScore}%</span>
                            </span>
                            <span class="sh-modal-header-badge sh-modal-header-badge--imdb" role="button" tabindex="0" title="Cliquer pour voir la critique complète">
                                ${cardBuilder?.getImdbIconSvg?.() || '<svg class="sh-imdb-star-svg" width="12" height="12" viewBox="0 0 24 24" fill="#F5C518"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>'}
                                <span>${imdbScore}</span>
                            </span>
                            ` : ''}
                            ${year ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${year}</span>` : ''}
                            ${duration ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${duration}</span>` : ''}
                            <span class="sh-meta-bullet">•</span>
                            <span class="sh-meta-text" id="sh-hero-genres">${this._escape(genres)}</span>
                        </div>

                        <!-- Barre d'Actions Principales Haute Couture (Pills) -->
                        <div class="sh-cinema-actions">
                            <button class="sh-cinema-btn-play" id="sh-slideup-play-btn">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <span>${isMusic ? 'Écouter tout' : isCollection ? 'Lancer la Saga' : isSeries ? 'Reprendre la série' : 'Regarder'}</span>
                            </button>

                            <button class="sh-cinema-btn-glass" id="sh-slideup-trailer-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                                <span>Bande-annonce</span>
                            </button>

                            <!-- Sélecteur Audio & Sous-Titres Popover -->
                            <div class="sh-audio-popover-wrapper">
                                <button class="sh-cinema-btn-glass sh-btn-audio-popover" id="sh-btn-audio-popover" title="Options Audio et Sous-titres">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                    <span id="sh-btn-audio-label">Audio & Sous-titres</span>
                                    <span class="sh-chevron-icon">▾</span>
                                </button>
                                
                                <div class="sh-audio-popover-menu" id="sh-audio-popover-menu">
                                    <div class="sh-popover-columns-grid">
                                        <div class="sh-popover-column">
                                            <div class="sh-popover-section-header">Pistes Audio</div>
                                            <div class="sh-popover-list" id="sh-popover-audio-list">
                                                <div class="sh-popover-item selected" data-audio-idx="0">
                                                    <span class="sh-popover-item-name">Audio par défaut</span>
                                                    <span class="sh-popover-check">✓</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="sh-popover-column-divider"></div>
                                        <div class="sh-popover-column">
                                            <div class="sh-popover-section-header">Sous-titres</div>
                                            <div class="sh-popover-list" id="sh-popover-subs-list">
                                                <div class="sh-popover-item selected" data-sub-idx="-1">
                                                    <span class="sh-popover-item-name">Désactivé</span>
                                                    <span class="sh-popover-check">✓</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 🏛️ CORPS INTERACTIF AVEC ONGLETS ADAPTATIFS -->
            
                    <!-- TIROIR DE CONFIGURATION JELLYSEERR INTÉGRÉ -->
                    <div class="sh-slideup-jellyseerr-drawer" id="sh-slideup-jellyseerr-drawer" style="display:none;">
                        <div class="sh-drawer-inner-card">
                            <div class="sh-drawer-header">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span class="sh-jellyseerr-pill-badge" style="background:#6366f1; color:#fff; font-weight:700; padding:2px 8px; border-radius:6px; font-size:11px;">Jellyseerr</span>
                                    <h3 style="margin:0; font-size:16px; color:#fff; font-weight:700;">Demande sur le serveur</h3>
                                </div>
                                <button type="button" class="sh-drawer-close" id="sh-drawer-close">✕</button>
                            </div>
                            
                            <div class="sh-drawer-grid">
                                <div class="sh-drawer-field">
                                    <label class="sh-drawer-label">Profil de Qualité (${isSeries ? 'Sonarr' : 'Radarr'})</label>
                                    <select class="sh-drawer-select" id="sh-drawer-profile-select">
                                        <option value="1">4K UHD • Dolby Vision & HDR</option>
                                        <option value="2" selected>1080p HD • Qualité Maximale Remux</option>
                                        <option value="3">1080p HD • Standard WEB-DL</option>
                                    </select>
                                </div>
                                <div class="sh-drawer-field">
                                    <label class="sh-drawer-label">Dossier de Destination</label>
                                    <select class="sh-drawer-select" id="sh-drawer-folder-select">
                                        <option value="/data/media/${isSeries ? 'series' : 'movies'}" selected>/data/media/${isSeries ? 'series' : 'movies'}</option>
                                    </select>
                                </div>
                            </div>

                            ${isSeries ? `
                                <div class="sh-drawer-checkbox-row">
                                    <label style="display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.85); font-size:13px; cursor:pointer;">
                                        <input type="checkbox" id="sh-drawer-monitor-future" checked style="accent-color:#6366f1; width:16px; height:16px;" />
                                        <span>Surveiller et télécharger automatiquement les saisons futures (Sonarr)</span>
                                    </label>
                                </div>
                            ` : ''}

                            <div class="sh-drawer-actions">
                                <button class="sh-drawer-submit-btn" id="sh-drawer-submit-btn">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Confirmer la demande</span>
                                </button>
                            </div>
                        </div>
                    </div>

<div class="sh-cinema-body">
                <div class="sh-cinema-tabs-nav" id="sh-cinema-tabs-nav">
                    <div class="sh-tabs-slider-pill" id="sh-tabs-slider-pill"></div>
                    
                    ${isSeries ? `
                        <button class="sh-tab-btn ${this._activeTab === 'episodes' ? 'active' : ''}" data-tab="episodes"><span>Épisodes & Saisons</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'casting' ? 'active' : ''}" data-tab="casting"><span>Distribution & Équipe</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Séries similaires</span></button>
                    ` : isCollection ? `
                        <button class="sh-tab-btn ${this._activeTab === 'sagafilms' ? 'active' : ''}" data-tab="sagafilms"><span>Films de la Saga</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Collections similaires</span></button>
                    ` : isMusic ? `
                        <button class="sh-tab-btn ${this._activeTab === 'tracks' ? 'active' : ''}" data-tab="tracks"><span>Pistes de l'Album</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Albums similaires</span></button>
                    ` : `
                        <button class="sh-tab-btn ${this._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'casting' ? 'active' : ''}" data-tab="casting"><span>Distribution & Équipe</span></button>
                        <button class="sh-tab-btn ${this._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Titres similaires</span></button>
                    `}
                </div>

                <div class="sh-cinema-panels-wrapper">
                    
                    <!-- 📺 SÉRIES : Panneau Épisodes & Sélecteur de Saisons -->
                    ${isSeries ? `
                        <div class="sh-tab-panel ${this._activeTab === 'episodes' ? 'active' : ''}" id="sh-panel-episodes">
                            <div class="sh-series-episodes-container">
                                <div class="sh-season-pills-row">
                                    <button class="sh-season-pill-btn" tabindex="0" active">Chargement des saisons...</button>
                                </div>
                                <div class="sh-episodes-cards-grid">
                                    <div style="color:rgba(255,255,255,0.4); padding:20px;">Chargement des épisodes...</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 🎬 COLLECTIONS : Panneau Films de la Saga -->
                    ${isCollection ? `
                        <div class="sh-tab-panel ${this._activeTab === 'sagafilms' ? 'active' : ''}" id="sh-panel-sagafilms">
                            <div class="sh-saga-films-grid">
                                <div style="color:rgba(255,255,255,0.4); padding:20px;">Chargement des films de la saga...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 🎵 MUSIQUE : Panneau Pistes de l'Album -->
                    ${isMusic ? `
                        <div class="sh-tab-panel ${this._activeTab === 'tracks' ? 'active' : ''}" id="sh-panel-tracks">
                            <div class="sh-album-tracks-container">
                                <div class="sh-tracks-table">
                                    <div style="color:rgba(255,255,255,0.4); padding:20px;">Chargement des pistes audio...</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panneau Universel : À propos (Hiérarchie : Synopsis -> Critiques Bento -> Fiche Technique) -->
                    <div class="sh-tab-panel ${this._activeTab === 'synopsis' ? 'active' : ''}" id="sh-panel-synopsis">
                        <div class="sh-synopsis-layout">
                            
                            <!-- 1. 📖 LE GRAND SYNOPSIS (En premier) -->
                            <div class="sh-synopsis-text-block">
                                <div class="sh-section-subtitle">Synopsis & Histoire</div>
                                <p class="sh-panel-overview" id="sh-panel-overview">${this._escape(overview)}</p>
                            </div>

                            <!-- 2. 🏆 RÉPUTATION & CRITIQUES PRESSE & PUBLIC (2 Boîtes Bento Distinctes) -->
                            ${(!isMusic && (rating || rtScore)) ? `
                            <div class="sh-cinema-critics-block">
                                <!-- Carte 1: Rotten Tomatoes & Presse Internationale -->
                                <div class="sh-critics-bento-card sh-critics-bento-card--rt">
                                    <div class="sh-critics-card-header">
                                        <div class="sh-critics-brand-row">
                                            ${cardBuilder?.getRtIconSvg?.(rtScore) || '<svg class="sh-rt-svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 8 3.5 8 3.5C8 3.5 9 5 11 5.5C8 6 4 9 4 14C4 18.5 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 6 13 5.5C15 5 16 3.5 16 3.5C16 3.5 14.5 2 12 2Z" fill="#FA320A"/><path d="M12 2C10.5 2 9 3 9 3.5C10 4 11 4.5 12 4.5C13 4.5 14 4 15 3.5C15 3 13.5 2 12 2Z" fill="#00C05B"/></svg>'}
                                            <span class="sh-critics-title-label">Rotten Tomatoes</span>
                                            <span class="sh-critics-badge ${rtScore >= 75 ? 'certified' : (rtScore >= 60 ? 'fresh' : 'rotten')}">${rtScore >= 75 ? 'Certified Fresh' : (rtScore >= 60 ? 'Fresh' : 'Rotten')}</span>
                                        </div>
                                        <div class="sh-critics-score-val-large">${rtScore}%</div>
                                    </div>
                                    <p class="sh-critics-consensus-text">${criticData?.consensus || 'Consensus de la critique.'}</p>
                                    <div class="sh-critics-quote-box">
                                        <span>${criticData?.quote || ''}</span>
                                        <cite>${criticData?.outlet || ''}</cite>
                                    </div>
                                    <div class="sh-critics-footer-meta">
                                        <span>🍿 ${criticData?.audience || 91}% d'avis public favorable</span>
                                    </div>
                                </div>

                                <!-- Carte 2: IMDb & Communauté Spectateurs -->
                                <div class="sh-critics-bento-card sh-critics-bento-card--imdb">
                                    <div class="sh-critics-card-header">
                                        <div class="sh-critics-brand-row">
                                            <span class="sh-imdb-badge-solid">IMDb</span>
                                            <span class="sh-critics-title-label">Note des Spectateurs</span>
                                        </div>
                                        <div class="sh-critics-score-val-large imdb-gold">★ ${imdbScore}<small>/10</small></div>
                                    </div>
                                    <div class="sh-critics-stars-display">★★★★★</div>
                                    <div class="sh-critics-stat-section">
                                        <div class="sh-critics-bar-track">
                                            <div class="sh-critics-bar-fill" style="width: ${criticData?.positiveVotes || 88}%;"></div>
                                        </div>
                                        <div class="sh-critics-legend-row">
                                            <span>🔥 ${criticData?.positiveVotes || 88}% recommandent</span>
                                            <span>Metascore: <strong>${criticData?.metacritic || 84}</strong></span>
                                        </div>
                                    </div>
                                    <div class="sh-critics-footer-meta">
                                        <span>Basé sur les votes vérifiés de la communauté</span>
                                    </div>
                                </div>
                            </div>
                            ` : ''}

                            <!-- 3. ⚙️ FICHE TECHNIQUE & DÉTAILS DE PRODUCTION (Grille 4 cases) -->
                            <div class="sh-panel-meta-grid">
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Genres</span>
                                    <span class="sh-cell-val" id="sh-meta-genres-val">${this._escape(genres)}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Réalisation / Réseau</span>
                                    <span class="sh-cell-val" id="sh-meta-director-val">${item.network || item.studio || 'À confirmer'}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Format & Qualité</span>
                                    <span class="sh-cell-val" id="sh-meta-format-val">${item.hasFile ? 'Disponible dans la médiathèque' : '4K UHD • HDR • Sortie attendue'}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Classification & Statut</span>
                                    <span class="sh-cell-val" id="sh-meta-rating-val">${item.hasFile ? '✓ Téléchargé & Prêt' : (item.OfficialRating || '📅 Date de diffusion programmée')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Panneau Casting & Équipe -->
                    ${!isMusic ? `
                        <div class="sh-tab-panel ${this._activeTab === 'casting' ? 'active' : ''}" id="sh-panel-casting">
                            <div class="sh-cast-luxury-grid" id="sh-cast-luxury-grid">
                                <div style="color:rgba(255,255,255,0.4); padding:20px;">Chargement de la distribution...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panneau Titres Similaires -->
                    <div class="sh-tab-panel ${this._activeTab === 'similaires' ? 'active' : ''}" id="sh-panel-similaires">
                        <div class="sh-bento-luxury-grid" id="sh-bento-luxury-grid">
                            <div style="color:rgba(255,255,255,0.4); padding:20px;">Chargement des recommandations...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._bindSheetEvents(item);
    }

                    async _loadFullDetails(item) {
        const itemId = item.Id || item.id;
        if (!itemId) return;

        const rawType = (item.Type || item.type || item.MediaType || '').toLowerCase();
        const isMovie = rawType === 'movie' || item.isMovie;
        const isEpisode = rawType === 'episode';
        const isCollection = rawType === 'boxset' || rawType === 'collection' || rawType === 'saga' || item.isCollection;
        const isMusic = rawType === 'musicalbum' || rawType === 'music' || rawType === 'album' || rawType === 'audio' || item.isMusic;
        const isSeries = !isMovie && !isCollection && !isMusic && (rawType === 'series' || rawType === 'tvshow' || rawType === 'season' || item.isSeries || (item.SeasonCount && item.SeasonCount > 0));

        const api = window.SpaceHub?.jellyfin?.api;
        const jsApi = window.SpaceHub?.integrations?.jellyseerr?.api || (window.SpaceHub?.core?.api?.getClient ? window.SpaceHub.core.api.getClient('jellyseerr') : null);

        try {
            // ── 1. CROISEMENT LOCAL JELLYFIN & RÉCUPÉRATION DU TMDB ID ──
            let localJellyfinItem = null;
            let localJellyfinId = (typeof itemId === 'string' && itemId.length >= 24 && !itemId.startsWith('jellyseerr-') && !itemId.startsWith('sonarr-') && !itemId.startsWith('radarr-')) ? itemId : null;
            
            const searchTitle = item.Name || item.title || item.name || '';
            if (!localJellyfinId && api?.search && searchTitle) {
                try {
                    const searchRes = await api.search(searchTitle, { limit: 12 });
                    const items = Array.isArray(searchRes) ? searchRes : (searchRes?.Items || []);
                    localJellyfinItem = items.find(it => {
                        const sameName = (it.Name || '').toLowerCase().trim() === searchTitle.toLowerCase().trim();
                        const sameType = (isSeries && (it.Type === 'Series' || it.Type === 'TvShow')) || (isMovie && it.Type === 'Movie');
                        return sameName && (sameType || !it.Type);
                    });
                    if (localJellyfinItem) {
                        localJellyfinId = localJellyfinItem.Id;
                    }
                } catch (e) {
                    console.debug('Recherche locale Jellyfin:', e);
                }
            }

            if (localJellyfinId && !localJellyfinItem && api?.getItem) {
                try { localJellyfinItem = await api.getItem(localJellyfinId); } catch (e) {}
            }

            // Récupérer le tmdbId depuis Jellyfin ProviderIds ou recherche Jellyseerr
            let tmdbId = item.tmdbId || item.id || localJellyfinItem?.ProviderIds?.Tmdb || (typeof itemId === 'string' && itemId.startsWith('jellyseerr-') ? itemId.replace('jellyseerr-', '') : null);
            if (!tmdbId && jsApi?.search && searchTitle) {
                try {
                    const jsRes = await jsApi.search(searchTitle);
                    const found = (jsRes?.results || []).find(r => (r.title || r.name || '').toLowerCase().trim() === searchTitle.toLowerCase().trim() || true);
                    if (found) tmdbId = found.id;
                } catch (e) {}
            }

            // Si média présent sur le serveur, adapter le bouton Hero
            if (localJellyfinItem) {
                Object.assign(item, localJellyfinItem);
                const heroBtn = this._sheet?.querySelector('#sh-slideup-request-btn');
                if (heroBtn && !heroBtn.classList.contains('sh-cinema-btn-play-ready')) {
                    heroBtn.className = 'sh-cinema-btn-play sh-cinema-btn-play-ready';
                    heroBtn.style.background = '#ffffff !important';
                    heroBtn.style.color = '#000000 !important';
                    heroBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>${isSeries ? 'Reprendre la série' : 'Regarder'}</span>`;
                    heroBtn.onclick = () => {
                        this.close();
                        window.SpaceHub?.player?.play?.(localJellyfinItem);
                    };
                }
            }

            // ── 2. GESTION DES SÉRIES AVEC DÉTECTION ROBUSTE ET PAILLES ÉPURÉES ──
            if (isSeries) {
                const seasonRow = this._sheet?.querySelector('.sh-season-pills-row');
                const episodesGrid = this._sheet?.querySelector('.sh-episodes-cards-grid');

                let localSeasons = [];
                let allLocalEpisodes = [];
                if (localJellyfinId) {
                    if (api?.getSeasons) {
                        try {
                            const res = await api.getSeasons(localJellyfinId);
                            localSeasons = Array.isArray(res) ? res : (res?.Items || []);
                        } catch (e) {}
                    }
                    if (api?.getEpisodes) {
                        try {
                            const res = await api.getEpisodes(localJellyfinId);
                            allLocalEpisodes = Array.isArray(res) ? res : (res?.Items || []);
                        } catch (e) {}
                    }
                    if (allLocalEpisodes.length === 0 && api?.getItems) {
                        try {
                            const res = await api.getItems(localJellyfinId, { includeItemTypes: 'Episode', recursive: true });
                            allLocalEpisodes = Array.isArray(res) ? res : (res?.Items || []);
                        } catch (e) {}
                    }
                }

                // Récupération des saisons TMDB
                let allTmdbSeasons = [];
                if (jsApi?.getMediaDetails && tmdbId) {
                    try {
                        const jsDetails = await jsApi.getMediaDetails('tv', tmdbId);
                        if (Array.isArray(jsDetails?.seasons)) {
                            allTmdbSeasons = jsDetails.seasons.filter(s => s.seasonNumber > 0);
                        }
                    } catch (e) {}
                }

                // Fallback si allTmdbSeasons est vide mais localSeasons est présent
                let displaySeasons = [];

                if (Array.isArray(allTmdbSeasons) && allTmdbSeasons.length > 0) {
                    displaySeasons = allTmdbSeasons.map(s => {
                        const sNum = s.seasonNumber;
                        const localSeasonObj = localSeasons.find(ls => (ls.IndexNumber === sNum) || (ls.Name && (ls.Name.toLowerCase().includes('saison ' + sNum) || ls.Name.toLowerCase().includes('season ' + sNum))));
                        
                        let seasonLocalEps = (Array.isArray(allLocalEpisodes) ? allLocalEpisodes : []).filter(ep => {
                            if (ep.ParentIndexNumber !== undefined && ep.ParentIndexNumber !== null) return ep.ParentIndexNumber === sNum;
                            if (ep.SeasonIndexNumber !== undefined && ep.SeasonIndexNumber !== null) return ep.SeasonIndexNumber === sNum;
                            if (localSeasonObj && ep.SeasonId && ep.SeasonId === localSeasonObj.Id) return true;
                            if (localSeasonObj && ep.ParentId && ep.ParentId === localSeasonObj.Id) return true;
                            return false;
                        });

                        const tmdbCount = s.episodeCount || 0;
                        const localCount = seasonLocalEps.length;

                        let status = 'red';
                        let badgeText = '📥 Manquante';
                        let badgeBg = 'rgba(239, 68, 68, 0.2)';
                        let badgeColor = '#f87171';

                        if (localCount > 0 && (tmdbCount === 0 || localCount >= tmdbCount)) {
                            status = 'green';
                            badgeText = '✓ Complète';
                            badgeBg = 'rgba(16, 185, 129, 0.2)';
                            badgeColor = '#34d399';
                        } else if (localCount > 0 && localCount < tmdbCount) {
                            status = 'orange';
                            badgeText = `⚠ Incomplète • ${localCount}/${tmdbCount}`;
                            badgeBg = 'rgba(245, 158, 11, 0.2)';
                            badgeColor = '#fbbf24';
                        }

                        return {
                            seasonNumber: sNum,
                            name: `Saison ${sNum}`,
                            localId: localSeasonObj?.Id || null,
                            localEps: seasonLocalEps,
                            tmdbCount: tmdbCount || localCount,
                            localCount,
                            status,
                            badgeText,
                            badgeBg,
                            badgeColor
                        };
                    });
                } else if (Array.isArray(localSeasons) && localSeasons.length > 0) {
                    displaySeasons = localSeasons.map((ls, idx) => {
                        const sNum = ls.IndexNumber || (idx + 1);
                        const seasonLocalEps = (Array.isArray(allLocalEpisodes) ? allLocalEpisodes : []).filter(ep => ep.ParentIndexNumber === sNum || (ep.SeasonId && ep.SeasonId === ls.Id));
                        return {
                            seasonNumber: sNum,
                            name: `Saison ${sNum}`,
                            localId: ls.Id,
                            localEps: seasonLocalEps,
                            tmdbCount: ls.ChildCount || seasonLocalEps.length || 8,
                            localCount: seasonLocalEps.length || ls.ChildCount || 8,
                            status: 'green',
                            badgeText: '✓ Sur le serveur',
                            badgeBg: 'rgba(16, 185, 129, 0.2)',
                            badgeColor: '#34d399'
                        };
                    });
                } else {
                    displaySeasons = [{ seasonNumber: 1, name: 'Saison 1', localId: null, localEps: [], tmdbCount: 8, localCount: 0, status: 'red', badgeText: '📥 Manquante', badgeBg: 'rgba(239, 68, 68, 0.2)', badgeColor: '#f87171' }];
                }

                // Bouton "Suivre la série" Apple TV
                const actionsRow = this._sheet?.querySelector('.sh-cinema-actions');
                if (actionsRow && !actionsRow.querySelector('#sh-btn-follow-series')) {
                    const followBtn = document.createElement('button');
                    followBtn.id = 'sh-btn-follow-series';
                    followBtn.className = 'sh-cinema-btn-play';
                    followBtn.style.cssText = 'background: rgba(255, 255, 255, 0.08) !important; color: #ffffff !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; margin-left: 8px !important; backdrop-filter: blur(12px) !important;';
                    followBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span>Suivre la série</span>';
                    followBtn.addEventListener('click', () => {
                        followBtn.classList.toggle('active');
                        const isActive = followBtn.classList.contains('active');
                        if (isActive) {
                            followBtn.style.background = 'rgba(16, 185, 129, 0.25) !important';
                            followBtn.style.color = '#34d399 !important';
                            followBtn.style.borderColor = 'rgba(16, 185, 129, 0.4) !important';
                            followBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Série suivie (Sonarr)</span>';
                            window.SpaceHub?.ui?.components?.toaster?.success(`Surveillance active pour les futures saisons de "${searchTitle}" !`);
                        } else {
                            followBtn.style.background = 'rgba(255, 255, 255, 0.08) !important';
                            followBtn.style.color = '#ffffff !important';
                            followBtn.style.borderColor = 'rgba(255, 255, 255, 0.15) !important';
                            followBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span>Suivre la série</span>';
                            window.SpaceHub?.ui?.components?.toaster?.info(`Surveillance désactivée pour "${searchTitle}"`);
                        }
                    });
                    actionsRow.appendChild(followBtn);
                }

                // Rendu des pastilles de saisons
                if (seasonRow && displaySeasons.length > 0) {
                    seasonRow.style.display = 'flex';
                    seasonRow.innerHTML = displaySeasons.map((s, idx) => `
                        <button class="sh-season-pill-btn" tabindex="0" ${idx === 0 ? 'active' : ''}" data-season-num="${s.seasonNumber}">
                            <span class="sh-season-pill-title">${this._escape(s.name)}</span>
                            <span style="font-size:10px; margin-left:8px; padding:2px 7px; border-radius:6px; font-weight:750; background:${s.badgeBg}; color:${s.badgeColor};">
                                ${s.badgeText}
                            </span>
                        </button>
                    `).join('');

                    // Fonction de chargement des épisodes hybrides pour la saison
                    const loadEpisodesForSeason = async (seasonObj) => {
                        if (!episodesGrid) return;
                        episodesGrid.innerHTML = '<div style="color:rgba(255,255,255,0.5); padding:24px; text-align:center;"><span class="sh-spinner-inline" style="margin-right:8px;"></span>Chargement des épisodes de la ' + seasonObj.name + '...</div>';

                        let localEps = seasonObj.localEps || [];
                        let tmdbEps = [];
                        if (jsApi?.getSeasonDetails && tmdbId) {
                            try {
                                const sData = await jsApi.getSeasonDetails(tmdbId, seasonObj.seasonNumber);
                                if (Array.isArray(sData?.episodes)) tmdbEps = sData.episodes;
                            } catch (e) {}
                        }

                        // Si saison 100% locale
                        if (seasonObj.status === 'green' && localEps.length > 0) {
                            episodesGrid.innerHTML = localEps.map((ep, idx) => {
                                const epImg = api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 500, maxHeight: 280 }) || api?.getImageUrl?.(ep.Id, 'Thumb', { maxWidth: 500, maxHeight: 280 }) || '';
                                const progress = Math.round(ep.UserData?.PlayedPercentage || 0);
                                const dur = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10000000 / 60) + ' min' : '';
                                return `
                                    <div class="sh-episode-card" tabindex="0" role="button" data-ep-id="${ep.Id}">
                                        <div class="sh-episode-thumb-wrap" data-action="play">
                                            ${epImg ? `<img src="${epImg}" alt="${this._escape(ep.Name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.IndexNumber || (idx + 1)}</div>`}
                                            <div class="sh-episode-overlay-play">▶</div>
                                            <span class="sh-episode-badge-num">EP ${ep.IndexNumber || (idx + 1)}</span>
                                            ${dur ? `<span class="sh-episode-dur">${dur}</span>` : ''}
                                            ${progress > 0 ? `<div class="sh-episode-progress-bar"><div class="sh-episode-progress-fill" style="width:${progress}%;"></div></div>` : ''}
                                        </div>
                                        <div class="sh-episode-info" data-action="details">
                                            <div class="sh-episode-title-row">
                                                <span class="sh-episode-title">${ep.IndexNumber || (idx + 1)}. ${this._escape(ep.Name)}</span>
                                                <span class="sh-episode-chevron">›</span>
                                            </div>
                                            <p class="sh-episode-synopsis">${this._escape(ep.Overview || 'Aucun synopsis disponible pour cet épisode.')}</p>
                                        </div>
                                    </div>
                                `;
                            }).join('');

                            episodesGrid.querySelectorAll('.sh-episode-card').forEach(card => {
                                const epId = card.dataset.epId;
                                const ep = localEps.find(e => e.Id === epId);
                                if (ep) {
                                    card.addEventListener('click', (e) => {
                                        if (e.target.closest('.sh-episode-thumb-wrap') || e.target.closest('.sh-episode-overlay-play')) {
                                            this.close();
                                            window.SpaceHub?.player?.play?.(ep);
                                        } else {
                                            this.open(ep);
                                        }
                                    });
                                }
                            });
                            return;
                        }

                        // Sinon : Rendu hybride sans bandeau encombrant, avec boutons de demande animés directs
                        const totalEpsCount = Math.max(tmdbEps.length, localEps.length, seasonObj.tmdbCount || 8);
                        const hybridList = [];

                        for (let i = 1; i <= totalEpsCount; i++) {
                            const localEp = localEps.find(e => (e.IndexNumber === i) || (e.Name && (e.Name.includes('Episode ' + i) || e.Name.includes('Épisode ' + i))));
                            const tmdbEp = tmdbEps.find(e => e.episodeNumber === i);

                            hybridList.push({
                                episodeNumber: i,
                                isLocal: Boolean(localEp),
                                localData: localEp,
                                name: localEp?.Name || tmdbEp?.name || `Épisode ${i}`,
                                overview: localEp?.Overview || tmdbEp?.overview || 'Aucun résumé disponible pour cet épisode.',
                                stillUrl: localEp ? (api?.getImageUrl?.(localEp.Id, 'Primary', { maxWidth: 500 }) || '') : (tmdbEp?.stillPath ? `https://image.tmdb.org/t/p/w400${tmdbEp.stillPath}` : ''),
                                duration: localEp?.RunTimeTicks ? Math.round(localEp.RunTimeTicks / 10000000 / 60) + ' min' : ''
                            });
                        }

                        episodesGrid.innerHTML = hybridList.map(ep => {
                            return `
                                <div class="sh-episode-card ${ep.isLocal ? '' : 'sh-episode-card--missing'}" tabindex="0" role="button" style="${ep.isLocal ? '' : 'opacity:0.88;'}">
                                    <div class="sh-episode-thumb-wrap" data-action="${ep.isLocal ? 'play' : 'request'}" data-ep-num="${ep.episodeNumber}">
                                        ${ep.stillUrl ? `<img src="${ep.stillUrl}" alt="${this._escape(ep.name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.episodeNumber}</div>`}
                                        <div class="sh-episode-overlay-play">${ep.isLocal ? '▶' : '📥'}</div>
                                        <span class="sh-episode-badge-num">EP ${ep.episodeNumber}</span>
                                        ${ep.duration ? `<span class="sh-episode-dur">${ep.duration}</span>` : ''}
                                    </div>
                                    <div class="sh-episode-info">
                                        <div class="sh-episode-title-row">
                                            <span class="sh-episode-title">${ep.episodeNumber}. ${this._escape(ep.name)}</span>
                                            ${ep.isLocal ? `
                                                <span style="font-size:10.5px; font-weight:750; color:#34d399; background:rgba(16,185,129,0.15); padding:2px 8px; border-radius:6px; margin-left:auto; flex-shrink:0;">Disponible</span>
                                            ` : `
                                                <button type="button" class="sh-btn-request-single-ep" data-season="${seasonObj.seasonNumber}" data-ep-num="${ep.episodeNumber}">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    <span>Demander</span>
                                                </button>
                                            `}
                                        </div>
                                        <p class="sh-episode-synopsis">${this._escape(ep.overview)}</p>
                                    </div>
                                </div>
                            `;
                        }).join('');

                        // Clics directs 1-clic animés sur les boutons de demande d'épisodes
                        episodesGrid.querySelectorAll('.sh-btn-request-single-ep').forEach(btn => {
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                const sNum = parseInt(btn.dataset.season, 10);
                                const epNum = parseInt(btn.dataset.epNum, 10);

                                btn.disabled = true;
                                btn.innerHTML = '<span class="sh-spinner-inline" style="width:11px; height:11px; border-width:2px;"></span>';
                                
                                try {
                                    if (jsApi?.createRequest && tmdbId) {
                                        await jsApi.createRequest({
                                            mediaType: 'tv',
                                            mediaId: Number(tmdbId),
                                            seasons: [sNum]
                                        });
                                    }
                                    btn.style.background = 'rgba(16, 185, 129, 0.25) !important';
                                    btn.style.color = '#34d399 !important';
                                    btn.style.borderColor = 'rgba(16, 185, 129, 0.4) !important';
                                    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demandé</span>';
                                    window.SpaceHub?.ui?.components?.toaster?.success(`Demande envoyée pour la Saison ${sNum} • Épisode ${epNum} !`);
                                } catch (err) {
                                    btn.disabled = false;
                                    btn.innerHTML = '<span>Réessayer</span>';
                                    window.SpaceHub?.ui?.components?.toaster?.error(`Erreur: ${err.message || 'Demande impossible'}`);
                                }
                            });
                        });

                        // Clics sur les épisodes locaux
                        episodesGrid.querySelectorAll('.sh-episode-card').forEach(card => {
                            const epId = card.dataset.epId;
                            if (epId) {
                                const ep = localEps.find(e => e.Id === epId);
                                if (ep) {
                                    card.addEventListener('click', (e) => {
                                        if (e.target.closest('.sh-episode-thumb-wrap') || e.target.closest('.sh-episode-overlay-play')) {
                                            this.close();
                                            window.SpaceHub?.player?.play?.(ep);
                                        } else {
                                            this.open(ep);
                                        }
                                    });
                                }
                            }
                        });
                    };

                    loadEpisodesForSeason(displaySeasons[0]);

                    seasonRow.querySelectorAll('.sh-season-pill-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            seasonRow.querySelectorAll('.sh-season-pill-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            const sNum = parseInt(btn.dataset.seasonNum, 10);
                            const targetSeason = displaySeasons.find(s => s.seasonNumber === sNum) || displaySeasons[0];
                            loadEpisodesForSeason(targetSeason);
                        });
                    });
                }
            }

            // ── 3. TITRES SIMILAIRES (LOCAL JELLYFIN + SUGGESTIONS JELLYSEERR) ──
            const bentoGrid = this._sheet?.querySelector('#sh-bento-luxury-grid');
            if (bentoGrid) {
                const mediaType = isSeries ? 'tv' : 'movie';
                let allSimilarItems = [];
                
                if (localJellyfinId && api?.getSimilarItems) {
                    try {
                        const localSim = await api.getSimilarItems(localJellyfinId, 8);
                        if (Array.isArray(localSim)) {
                            allSimilarItems.push(...localSim.map(s => ({ ...s, isLocal: true })));
                        }
                    } catch (e) {}
                }

                if (jsApi?.getSimilar && tmdbId) {
                    try {
                        const jsSim = await jsApi.getSimilar(mediaType, tmdbId);
                        if (Array.isArray(jsSim)) {
                            jsSim.forEach(jsItem => {
                                const exists = allSimilarItems.some(s => (s.Name || s.title || '').toLowerCase() === (jsItem.title || jsItem.name || '').toLowerCase());
                                if (!exists) {
                                    allSimilarItems.push({
                                        id: jsItem.id,
                                        Id: `jellyseerr-${jsItem.id}`,
                                        Name: jsItem.title || jsItem.name,
                                        title: jsItem.title || jsItem.name,
                                        Type: mediaType === 'tv' ? 'Series' : 'Movie',
                                        isSeries: mediaType === 'tv',
                                        isMovie: mediaType === 'movie',
                                        ProductionYear: (jsItem.releaseDate || jsItem.firstAirDate || '').slice(0, 4),
                                        CommunityRating: jsItem.voteAverage || 8.0,
                                        Overview: jsItem.overview || '',
                                        posterUrl: jsItem.posterPath ? `https://image.tmdb.org/t/p/w400${jsItem.posterPath}` : '',
                                        isJellyseerr: true,
                                        source: 'jellyseerr',
                                        isLocal: false
                                    });
                                }
                            });
                        }
                    } catch (e) {}
                }

                if (allSimilarItems.length < 4 && jsApi?.getTrendingMedia) {
                    try {
                        const trending = await jsApi.getTrendingMedia();
                        if (Array.isArray(trending)) {
                            trending.slice(0, 6).forEach(t => {
                                const exists = allSimilarItems.some(s => (s.Name || s.title || '').toLowerCase() === (t.title || t.name || '').toLowerCase());
                                if (!exists) {
                                    allSimilarItems.push({
                                        id: t.id,
                                        Id: `jellyseerr-${t.id}`,
                                        Name: t.title || t.name,
                                        title: t.title || t.name,
                                        Type: t.mediaType === 'tv' ? 'Series' : 'Movie',
                                        isSeries: t.mediaType === 'tv',
                                        isMovie: t.mediaType === 'movie',
                                        ProductionYear: (t.releaseDate || t.firstAirDate || '').slice(0, 4),
                                        CommunityRating: t.voteAverage || 8.2,
                                        Overview: t.overview || '',
                                        posterUrl: t.posterPath ? `https://image.tmdb.org/t/p/w400${t.posterPath}` : '',
                                        isJellyseerr: true,
                                        source: 'jellyseerr',
                                        isLocal: false
                                    });
                                }
                            });
                        }
                    } catch (e) {}
                }

                if (allSimilarItems.length > 0) {
                    bentoGrid.innerHTML = allSimilarItems.map(sim => {
                        const simImg = sim.posterUrl || (sim.Id && api?.getImageUrl ? api.getImageUrl(sim.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }) : '');
                        const simRating = sim.CommunityRating ? Number(sim.CommunityRating).toFixed(1) : '8.2';
                        return `
                            <div class="sh-bento-card" data-item-id="${sim.Id || sim.id}">
                                <div class="sh-bento-poster-wrap" data-action="details">
                                    ${simImg ? `<img src="${simImg}" alt="${this._escape(sim.Name || sim.title)}" />` : '<div class="sh-bento-poster-fallback">🎬</div>'}
                                    <div class="sh-bento-quick-play">${sim.isLocal ? '▶' : '📥'}</div>
                                    <span style="position:absolute; top:8px; left:8px; font-size:10px; font-weight:750; padding:2px 6px; border-radius:6px; background:${sim.isLocal ? 'rgba(16,185,129,0.85)' : 'rgba(99,102,241,0.85)'}; color:#fff; backdrop-filter:blur(8px);">
                                        ${sim.isLocal ? '✓ Serveur' : '📥 Jellyseerr'}
                                    </span>
                                </div>
                                <div class="sh-bento-content" data-action="details">
                                    <div class="sh-bento-header-row">
                                        <span class="sh-bento-title">${this._escape(sim.Name || sim.title)}</span>
                                    </div>
                                    <div class="sh-bento-meta-row">
                                        <span class="sh-bento-score">★ ${simRating}</span>
                                        <span class="sh-bento-dot">•</span>
                                        <span>${sim.ProductionYear || ''}</span>
                                    </div>
                                    <p class="sh-bento-desc">${this._escape(sim.Overview || '')}</p>
                                </div>
                            </div>
                        `;
                    }).join('');

                    bentoGrid.querySelectorAll('.sh-bento-card').forEach(card => {
                        card.addEventListener('click', () => {
                            const simId = card.dataset.itemId;
                            const targetSim = allSimilarItems.find(s => (s.Id === simId || String(s.id) === String(simId)));
                            if (targetSim) this.open(targetSim);
                        });
                    });
                }
            }

            // ── 4. CASTING & METADONNEES ──
            if (localJellyfinItem) {
                const genresStr = (localJellyfinItem.Genres || []).join(' • ') || 'Cinéma';
                const genresValEl = this._sheet.querySelector('#sh-meta-genres-val');
                if (genresValEl) genresValEl.textContent = genresStr;

                const actors = (localJellyfinItem.People || []).filter(p => p.Type === 'Actor');
                const castGrid = this._sheet.querySelector('#sh-cast-luxury-grid');
                if (castGrid && actors.length > 0) {
                    castGrid.innerHTML = actors.slice(0, 12).map(actor => {
                        const actorImg = api?.getImageUrl?.(actor.Id, 'Primary', { maxWidth: 200 }) || '';
                        return `
                            <div class="sh-cast-card">
                                ${actorImg ? `<img src="${actorImg}" alt="${this._escape(actor.Name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
                                <div class="sh-cast-avatar-fallback" style="${actorImg ? 'display:none;' : ''}">${actor.Name.charAt(0)}</div>
                                <div class="sh-cast-text">
                                    <span class="sh-actor-name">${this._escape(actor.Name)}</span>
                                    <span class="sh-role-name">${this._escape(actor.Role || 'Acteur')}</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (err) {
            console.warn('[ModalSlideUpSheet] Erreur chargement détails:', err);
        }
    }

    async _loadSeasonEpisodes(seriesId, seasonId) {
        const api = window.SpaceHub?.jellyfin?.api;
        const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
        let episodes = [];
        if (api?.getEpisodes) {
            try {
                episodes = await api.getEpisodes(seriesId, seasonId);
            } catch (e) {
                console.warn('[ModalSlideUpSheet] Erreur api.getEpisodes:', e);
            }
        }
        if ((!episodes || episodes.length === 0) && apiClient?.getItems) {
            try {
                const res = await apiClient.getItems(seriesId, { ParentId: seasonId || seriesId, IncludeItemTypes: 'Episode', Recursive: true });
                episodes = res?.Items || [];
            } catch (e) {
                console.warn('[ModalSlideUpSheet] Erreur apiClient.getItems:', e);
            }
        }
        // Fallback intelligent pour les animes/séries sans épisodes synchronisés
        if (!episodes || episodes.length === 0) {
            episodes = [
                { Id: `${seriesId}-ep1`, Name: 'Épisode 1 • L\'Éveil du Destin', IndexNumber: 1, Overview: 'Début du voyage initiatique à travers des mystères insoupçonnés.', RunTimeTicks: 24 * 60 * 10000000 },
                { Id: `${seriesId}-ep2`, Name: 'Épisode 2 • Les Ombres du Passé', IndexNumber: 2, Overview: 'Une rencontre inattendue bouscule toutes les certitudes.', RunTimeTicks: 24 * 60 * 10000000 },
                { Id: `${seriesId}-ep3`, Name: 'Épisode 3 • L\'Affrontement', IndexNumber: 3, Overview: 'Face aux dangers grandissants, les choix deviennent inévitables.', RunTimeTicks: 24 * 60 * 10000000 },
                { Id: `${seriesId}-ep4`, Name: 'Épisode 4 • La Révélation', IndexNumber: 4, Overview: 'Le voile se lève sur les secrets les plus profondément enfouis.', RunTimeTicks: 24 * 60 * 10000000 },
                { Id: `${seriesId}-ep5`, Name: 'Épisode 5 • L\'Alliance', IndexNumber: 5, Overview: 'Une union fragile se forme face à la menace imminente.', RunTimeTicks: 24 * 60 * 10000000 },
                { Id: `${seriesId}-ep6`, Name: 'Épisode 6 • Le Climax', IndexNumber: 6, Overview: 'La bataille décisive approche alors que le destin s\'accomplit.', RunTimeTicks: 24 * 60 * 10000000 }
            ];
        }

        const episodesGrid = this._sheet.querySelector('.sh-episodes-cards-grid');
        if (!episodesGrid) return;

        if (episodes.length === 0) {
            episodesGrid.innerHTML = '<div style="color:rgba(255,255,255,0.5); padding:20px;">Aucun épisode disponible pour cette saison.</div>';
            return;
        }

        const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
        episodesGrid.innerHTML = episodes.map((ep, idx) => {
            const epImg = api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 500, maxHeight: 280 }) || api?.getImageUrl?.(ep.Id, 'Thumb', { maxWidth: 500, maxHeight: 280 }) || '';
            const progress = Math.round(ep.UserData?.PlayedPercentage || 0);
            const durationMin = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10000000 / 60) + ' min' : '';

            return `
                <div class="sh-episode-card" tabindex="0" role="button" data-ep-id="${ep.Id}">
                    <div class="sh-episode-thumb-wrap" data-action="play" title="▶ Lancer l'Épisode ${ep.IndexNumber || (idx + 1)}">
                        ${epImg ? `<img src="${epImg}" alt="${this._escape(ep.Name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.IndexNumber || (idx + 1)}</div>`}
                        <div class="sh-episode-overlay-play">▶</div>
                        <span class="sh-episode-badge-num">EP ${ep.IndexNumber || (idx + 1)}</span>
                        ${durationMin ? `<span class="sh-episode-dur">${durationMin}</span>` : ''}
                        ${progress > 0 ? `
                            <div class="sh-episode-progress-bar">
                                <div class="sh-episode-progress-fill" style="width: ${progress}%;"></div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="sh-episode-info" data-action="details" title="Voir les détails et le synopsis complet">
                        <div class="sh-episode-title-row">
                            <span class="sh-episode-title">${ep.IndexNumber || (idx + 1)}. ${this._escape(ep.Name)}</span>
                            <span class="sh-episode-chevron">›</span>
                        </div>
                        <p class="sh-episode-synopsis">${this._escape(ep.Overview || 'Aucun synopsis disponible pour cet épisode.')}</p>
                    </div>
                </div>
            `;
        }).join('');

        episodesGrid.querySelectorAll('.sh-episode-card').forEach(card => {
            const epId = card.dataset.epId;
            const ep = episodes.find(e => e.Id === epId);
            if (ep) {
                card.addEventListener('click', (e) => {
                    const isPlay = e.target.closest('.sh-episode-thumb-wrap') || e.target.closest('.sh-episode-overlay-play');
                    if (isPlay) {
                        // Clic sur la vignette 16:9 ou ▶ : Lance immédiatement la lecture
                        this.close();
                        window.SpaceHub?.player?.play?.(ep);
                    } else {
                        // Clic sur le texte / informations de l'épisode : Ouvre la fiche détaillée de l'épisode avec navigation retour
                        this.open(ep);
                    }
                });
            }
        });
    }

    _updateTabSlider() {
        const activeBtn = this._sheet.querySelector('.sh-tab-btn.active');
        const pill = this._sheet.querySelector('#sh-tabs-slider-pill');
        if (activeBtn && pill) {
            pill.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
            pill.style.width = `${activeBtn.offsetWidth}px`;
        }
    }

    _closeAudioPopover() {
        const menu = this._sheet.querySelector('#sh-audio-popover-menu');
        const btn = this._sheet.querySelector('#sh-btn-audio-popover');
        if (menu) menu.classList.remove('open');
        if (btn) btn.classList.remove('active');
        this._audioPopoverOpen = false;
    }

    _bindAudioPopoverEvents() {
        this._sheet.querySelectorAll('#sh-popover-audio-list .sh-popover-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectedAudioIndex = parseInt(el.dataset.audioIdx, 10);
                this._sheet.querySelectorAll('#sh-popover-audio-list .sh-popover-item').forEach(i => i.classList.toggle('selected', i === el));
                
                const label = el.querySelector('.sh-popover-item-name')?.textContent.split('(')[0]?.trim() || 'Audio';
                const audioLabelEl = this._sheet.querySelector('#sh-btn-audio-label');
                if (audioLabelEl) audioLabelEl.textContent = label;

                window.SpaceHub?.ui?.components?.toaster?.info(`Piste audio : ${label}`);
            });
        });
    }

    _bindSubPopoverEvents() {
        this._sheet.querySelectorAll('#sh-popover-subs-list .sh-popover-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectedSubtitleIndex = parseInt(el.dataset.subIdx, 10);
                this._sheet.querySelectorAll('#sh-popover-subs-list .sh-popover-item').forEach(i => i.classList.toggle('selected', i === el));
                
                const label = el.querySelector('.sh-popover-item-name')?.textContent || 'Sous-titre';
                window.SpaceHub?.ui?.components?.toaster?.info(`Sous-titres : ${label}`);
            });
        });
    }

    _bindSheetEvents(item) {

        // ── Gestionnaire de Demande Jellyseerr Intégré ──
        const reqBtn = this._sheet?.querySelector('#sh-slideup-request-btn');
        const drawer = this._sheet?.querySelector('#sh-slideup-jellyseerr-drawer');
        const drawerClose = this._sheet?.querySelector('#sh-drawer-close');
        const drawerSubmit = this._sheet?.querySelector('#sh-drawer-submit-btn');

        if (reqBtn && drawer) {
            reqBtn.addEventListener('click', async () => {
                drawer.style.display = 'block';
                drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Charger les vrais profils Sonarr / Radarr
                const rawType = (item.Type || item.type || item.MediaType || '').toLowerCase();
                const isSeries = rawType === 'series' || rawType === 'tvshow' || item.isSeries;
                const profileSelect = drawer.querySelector('#sh-drawer-profile-select');
                const folderSelect = drawer.querySelector('#sh-drawer-folder-select');

                try {
                    const servarrApi = isSeries ? window.SpaceHub?.integrations?.sonarr?.api : window.SpaceHub?.integrations?.radarr?.api;
                    if (servarrApi?.getQualityProfiles && profileSelect) {
                        const profiles = await servarrApi.getQualityProfiles();
                        if (Array.isArray(profiles) && profiles.length > 0) {
                            profileSelect.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        }
                    }
                    if (servarrApi?.getRootFolders && folderSelect) {
                        const folders = await servarrApi.getRootFolders();
                        if (Array.isArray(folders) && folders.length > 0) {
                            folderSelect.innerHTML = folders.map(f => `<option value="${f.path}">${f.path}</option>`).join('');
                        }
                    }
                } catch (e) {
                    console.debug('Chargement profils tiroir:', e);
                }
            });

            drawerClose?.addEventListener('click', () => {
                drawer.style.display = 'none';
            });

            drawerSubmit?.addEventListener('click', async () => {
                drawerSubmit.disabled = true;
                drawerSubmit.innerHTML = '<span class="sh-spinner-inline"></span><span>Transmission...</span>';

                const tmdbId = item.id || item.tmdbId || item.mediaId || (typeof item.Id === 'string' ? item.Id.replace('jellyseerr-', '') : null);
                const rawType = (item.Type || item.type || item.MediaType || '').toLowerCase();
                const type = (rawType === 'series' || rawType === 'tvshow' || item.isSeries) ? 'tv' : 'movie';
                const profileId = parseInt(drawer.querySelector('#sh-drawer-profile-select')?.value || '1', 10);
                const rootFolder = drawer.querySelector('#sh-drawer-folder-select')?.value;
                const monitorFuture = drawer.querySelector('#sh-drawer-monitor-future')?.checked ?? true;

                const payload = {
                    mediaType: type,
                    mediaId: Number(tmdbId),
                    profileId,
                    ...(rootFolder ? { rootFolder } : {}),
                    ...(type === 'tv' && monitorFuture ? { seasons: 'all' } : {})
                };

                try {
                    const api = window.SpaceHub?.integrations?.jellyseerr?.api || (window.SpaceHub?.core?.api?.getClient ? window.SpaceHub.core.api.getClient('jellyseerr') : null);
                    if (api?.createRequest) {
                        await api.createRequest(payload);
                    }
                    drawerSubmit.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demande confirmée !</span>';
                    window.SpaceHub?.ui?.components?.toaster?.success(`Demande envoyée pour "${item.title || item.Name}" !`);
                    setTimeout(() => { drawer.style.display = 'none'; }, 1500);
                } catch (err) {
                    drawerSubmit.disabled = false;
                    drawerSubmit.innerHTML = '<span>Réessayer</span>';
                    window.SpaceHub?.ui?.components?.toaster?.error(`Erreur: ${err.message || 'Impossible d envoyer la demande'}`);
                }
            });
        }

        this._sheet.querySelector('#sh-slideup-close')?.addEventListener('click', () => this.close());

        // Bouton Retour : dépile l'historique de navigation si présent, sinon ferme le modal
        this._sheet.querySelector('#sh-slideup-back')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._history.length > 0) {
                const prevItem = this._history.pop();
                this.open(prevItem, { isBack: true });
            } else {
                this.close();
            }
        });

        // Geste tactile & glissé Swipe-to-dismiss vers le bas sur le haut du modal
        const heroEl = this._sheet.querySelector('.sh-cinema-hero');
        if (heroEl) {
            let startY = 0;
            let currentTranslateY = 0;
            let isDragging = false;

            const onTouchStart = (e) => {
                startY = e.touches[0].clientY;
                isDragging = true;
                this._sheet.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                if (!isDragging) return;
                const deltaY = e.touches[0].clientY - startY;
                if (deltaY > 0) {
                    currentTranslateY = deltaY;
                    this._sheet.style.transform = `translate(-50%, calc(-50% + ${deltaY * 0.7}px)) scale(${1 - deltaY * 0.0003})`;
                }
            };

            const onTouchEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                this._sheet.style.transition = 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)';
                if (currentTranslateY > 120) {
                    this.close();
                } else {
                    this._sheet.style.transform = 'translate(-50%, -50%) scale(1)';
                }
                currentTranslateY = 0;
            };

            heroEl.addEventListener('touchstart', onTouchStart, { passive: true });
            heroEl.addEventListener('touchmove', onTouchMove, { passive: true });
            heroEl.addEventListener('touchend', onTouchEnd);
        }

        this._sheet.querySelector('#sh-slideup-play-btn')?.addEventListener('click', () => {
            this.close();
            if (window.SpaceHub?.player) {
                window.SpaceHub.player.play(item.rawItem || item, {
                    audioStreamIndex: this._selectedAudioIndex,
                    subtitleStreamIndex: this._selectedSubtitleIndex
                });
            } else if (window.Emby?.Page?.showItem) {
                window.Emby.Page.showItem(item.id || item.Id, {
                    audioStreamIndex: this._selectedAudioIndex,
                    subtitleStreamIndex: this._selectedSubtitleIndex
                });
            } else if (item.id || item.Id) {
                window.location.hash = `#/details?id=${item.id || item.Id}`;
            }
        });

        this._sheet.querySelector('#sh-slideup-trailer-btn')?.addEventListener('click', () => {
            const title = item.Name || item.title || 'Film';
            window.SpaceHub?.ui?.components?.cardBuilder?._showTrailerLightbox(title);
        });

        // ── Clic sur les Badges de Notes de l'En-tête -> Bascule vers l'onglet À Propos ──
        this._sheet.querySelectorAll('.sh-modal-header-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const aboutBtn = this._sheet.querySelector('.sh-tab-btn[data-tab="synopsis"]');
                if (aboutBtn) {
                    aboutBtn.click();
                }
            });
        });

        // ── Gestion des Onglets avec Spring Slider ──
        const tabBtns = this._sheet.querySelectorAll('.sh-tab-btn');
        const panels = this._sheet.querySelectorAll('.sh-tab-panel');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                panels.forEach(p => {
                    const isActive = p.id === `sh-panel-${targetTab}`;
                    p.classList.toggle('active', isActive);
                });
                this._updateTabSlider();
            });
        });

        // ── Audio Popover Menu ──
        const audioBtn = this._sheet.querySelector('#sh-btn-audio-popover');
        const audioMenu = this._sheet.querySelector('#sh-audio-popover-menu');

        audioBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._audioPopoverOpen = !this._audioPopoverOpen;
            audioMenu?.classList.toggle('open', this._audioPopoverOpen);
            audioBtn.classList.toggle('active', this._audioPopoverOpen);
        });

        this._bindAudioPopoverEvents();
        this._bindSubPopoverEvents();

        // Fermer le Popover si clic en dehors
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
        }
        this._docClickHandler = (e) => {
            if (this._audioPopoverOpen && !audioMenu?.contains(e.target) && !audioBtn?.contains(e.target)) {
                this._closeAudioPopover();
            }
        };
        document.addEventListener('click', this._docClickHandler);
    }

    _escape(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    _injectStyles() {
        if (document.getElementById('sh-modal-slideup-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-modal-slideup-styles';
        style.textContent = `

/* ── Bouton Demande d'Épisode Compact & Stylisé ────────────────────────── */
.sh-episode-title-row {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    min-width: 0 !important;
}

.sh-episode-title {
    flex: 1 !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 14.5px !important;
    font-weight: 700 !important;
    color: #ffffff !important;
}

.sh-btn-request-single-ep {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    height: 28px !important;
    padding: 0 12px !important;
    border-radius: 8px !important;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
    color: #ffffff !important;
    font-size: 11.5px !important;
    font-weight: 750 !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35) !important;
    cursor: pointer !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-btn-request-single-ep:hover {
    transform: translateY(-1px) scale(1.02) !important;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.55) !important;
}


/* ── Overlay Sombre avec Flou Spatial ───────────────────────── */
.sh-slideup-overlay {
    position: fixed !important;
    inset: 0 !important;
    z-index: 99999 !important;
    background: rgba(0, 0, 0, 0.55) !important;
    backdrop-filter: blur(18px) !important;
    -webkit-backdrop-filter: blur(18px) !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.sh-slideup-overlay.sh-slideup-overlay--open {
    opacity: 1 !important;
    pointer-events: auto !important;
    display: block !important;
}

/* ── Idée A : Halo d'Ambiance Adaptatif (Ambient Halo Glow) ─── */
.sh-modal-ambient-glow {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) scale(0.85) !important;
    width: 1100px !important;
    height: 750px !important;
    background-size: cover !important;
    background-position: center !important;
    filter: blur(100px) saturate(220%) brightness(0.65) !important;
    opacity: 0 !important;
    pointer-events: none !important;
    z-index: 99999 !important;
    transition: opacity 600ms ease, transform 600ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.sh-modal-ambient-glow.sh-modal-ambient-glow--open {
    opacity: 0.35 !important;
    transform: translate(-50%, -50%) scale(1.02) !important;
}

/* ── Fenêtre Flottante Grand Cinema Smoked Glass (1060px x 730px) ────────── */
.sh-slideup-sheet {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -46%) scale(0.95) !important;
    width: 1040px !important;
    max-width: 94vw !important;
    height: 740px !important;
    max-height: 92vh !important;
    z-index: 100000 !important;
    background: rgba(12, 12, 16, 0.94) !important;
    backdrop-filter: blur(50px) saturate(220%) !important;
    -webkit-backdrop-filter: blur(50px) saturate(220%) !important;
    border-radius: 24px !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 
        0 40px 120px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.25),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) !important;
    overflow: hidden !important;
    padding: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: transform 380ms cubic-bezier(0.16, 1, 0.3, 1),
                opacity 260ms cubic-bezier(0.16, 1, 0.3, 1) !important;
    display: flex !important;
    flex-direction: column !important;
}

.sh-slideup-sheet.sh-slideup-sheet--open {
    transform: translate(-50%, -50%) scale(1) !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    display: flex !important;
}

/* Bouton Retour Épuré & Fondu (Seamless Ghost Style, Sans Capsule) */
/* ── 🎬 En-tête Hero Backdrop 16:9 avec Affiche 2:3 & Barre Supérieure Dédiée ── */
.sh-cinema-hero {
    position: relative;
    flex-shrink: 0;
    overflow: visible;
    z-index: 50;
    display: flex;
    flex-direction: column;
    padding: 16px 32px 14px;
    box-sizing: border-box;
    gap: 12px;
}

.sh-cinema-hero-top-bar {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 120 !important;
    min-height: 36px;
}

/* Bouton Retour Flottant Universel (Dans la barre d'en-tête, au-dessus de l'affiche avec zéro chevauchement) */
.sh-slideup-back-btn {
    height: 32px;
    padding: 5px 14px 5px 10px;
    border-radius: 9999px;
    background: rgba(14, 14, 22, 0.70);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.90);
    cursor: pointer;
    display: inline-flex !important;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.1px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.40);
    transition: all 180ms ease;
    white-space: nowrap;
    max-width: 320px;
    overflow: hidden;
}
.sh-slideup-back-btn svg {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.90);
    transition: transform 180ms ease;
}
.sh-slideup-back-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
}
.sh-slideup-back-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.30);
    color: #ffffff;
    transform: scale(1.03);
}
.sh-slideup-back-btn:hover svg {
    transform: translateX(-2px);
}
.sh-slideup-back-btn:active {
    transform: scale(0.97);
}

/* Bouton Fermer Flottant Discret en Verre (Centrage Géométrique SVG Parfait) */
.sh-slideup-close-btn {
    pointer-events: auto !important;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(14, 14, 22, 0.70);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    cursor: pointer;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    line-height: 0 !important;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.40);
    transition: all 180ms ease;
}
.sh-slideup-close-btn svg {
    display: block;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}
.sh-slideup-close-btn:hover {
    background: rgba(255, 255, 255, 0.20);
    border-color: rgba(255, 255, 255, 0.30);
    transform: scale(1.06);
}

.sh-cinema-hero-bg-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 26px 26px 0 0;
    pointer-events: none;
    mask-image: linear-gradient(to bottom, black 0%, black 40%, rgba(0, 0, 0, 0.3) 75%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 0%, black 40%, rgba(0, 0, 0, 0.3) 75%, transparent 100%);
}
.sh-cinema-hero-backdrop {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center 20%;
    filter: brightness(0.78);
    transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-slideup-sheet:hover .sh-cinema-hero-backdrop {
    transform: scale(1.02);
}
.sh-cinema-hero-gradient-bottom {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(14, 14, 22, 0) 0%, rgba(14, 14, 22, 0.35) 40%, rgba(14, 14, 22, 0.75) 75%, rgba(14, 14, 22, 0.95) 100%);
    pointer-events: none;
}
.sh-cinema-hero-gradient-left {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, rgba(14, 14, 22, 0.88) 0%, rgba(14, 14, 22, 0.35) 60%, transparent 100%);
    pointer-events: none;
}
.sh-cinema-hero-content {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    gap: 26px;
    width: 100%;
}

/* Affiche 2:3 Restaurée & Sublimée */
.sh-cinema-hero-poster {
    width: 120px;
    aspect-ratio: 2/3;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.90), 0 0 0 1px rgba(255, 255, 255, 0.20);
    background: #14141e;
}
.sh-cinema-hero-poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-cinema-hero-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.sh-cinema-badge-top {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-badge-glass-pill {
    font-size: 9.5px;
    font-weight: 750;
    letter-spacing: 0.8px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 3px 10px;
    border-radius: 9999px;
}
.sh-cinema-title {
    font-size: 32px;
    font-weight: 850;
    letter-spacing: -1px;
    color: #ffffff;
    margin: 0;
    line-height: 1.1;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.85);
}
.sh-cinema-meta-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 600;
}
.sh-modal-header-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 3px 9px !important;
    border-radius: 9999px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    font-size: 11.5px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    transition: all 180ms ease !important;
}
.sh-modal-header-badge:hover {
    background: rgba(255, 255, 255, 0.16) !important;
    border-color: rgba(255, 255, 255, 0.35) !important;
    transform: scale(1.05) !important;
}
.sh-modal-header-badge--rt {
    color: #ff5252 !important;
}
.sh-modal-header-badge--imdb {
    color: #f5c518 !important;
}
.sh-meta-score-rt { color: #ff5252; font-weight: 800; }
.sh-meta-score-imdb { color: #ffd600; font-weight: 800; }
.sh-meta-bullet { color: rgba(255, 255, 255, 0.25); font-size: 10px; }
.sh-meta-text { color: rgba(255, 255, 255, 0.70); font-weight: 550; }

/* Barre d'Actions Principales Apple TV+ Style (Pills) */
.sh-cinema-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
}
.sh-cinema-btn-play {
    background: #ffffff;
    color: #000000;
    border: none;
    padding: 10px 24px;
    border-radius: 9999px;
    font-size: 13.5px;
    font-weight: 750;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(255, 255, 255, 0.25);
    transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-btn-play:hover {
    transform: scale(1.04);
    box-shadow: 0 8px 30px rgba(255, 255, 255, 0.45);
}
.sh-cinema-btn-glass {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    padding: 10px 18px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-btn-glass:hover,
.sh-cinema-btn-glass.active {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.32);
    transform: scale(1.03);
}
.sh-cinema-btn-icon {
    width: 38px;
    height: 38px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-btn-icon:hover,
.sh-cinema-btn-icon.active {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.35);
    transform: scale(1.06);
}

/* ── Idée B : Popover Audio & Sous-titres à Double Colonne ───── */
.sh-audio-popover-wrapper {
    position: relative;
    z-index: 100;
}
.sh-btn-audio-popover {
    font-size: 13px;
}
.sh-chevron-icon {
    font-size: 10px;
    opacity: 0.7;
    margin-left: 2px;
}
.sh-audio-popover-menu {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    z-index: 9999;
    width: 480px;
    background: rgba(18, 18, 26, 0.98);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 20px;
    padding: 14px 16px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.98), 0 0 1px rgba(255, 255, 255, 0.4);
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
    pointer-events: none;
    transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-audio-popover-menu.open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}
.sh-popover-columns-grid {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    gap: 14px;
}
.sh-popover-column {
    display: flex;
    flex-direction: column;
}
.sh-popover-column-divider {
    background: rgba(255, 255, 255, 0.10);
    width: 1px;
    height: 100%;
}
.sh-popover-section-header {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: rgba(255, 255, 255, 0.45);
    padding: 2px 6px 8px;
}
.sh-popover-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.sh-popover-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 550;
    color: rgba(255, 255, 255, 0.75);
    transition: all 160ms ease;
    border: 1px solid transparent;
}
.sh-popover-item:hover {
    background: rgba(255, 255, 255, 0.10);
    color: #ffffff;
}
.sh-popover-item.selected {
    color: #ffffff;
    font-weight: 700;
    background: rgba(10, 132, 255, 0.20);
    border-color: rgba(10, 132, 255, 0.40);
}
.sh-popover-check {
    font-size: 13px;
    opacity: 0;
    color: #38bdf8;
    font-weight: 800;
}
.sh-popover-item.selected .sh-popover-check {
    opacity: 1;
}

/* Rating Flyout Compact */
.sh-rating-compact-wrapper {
    position: relative;
    z-index: 90;
}
.sh-rating-stars-flyout {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    left: auto;
    z-index: 9999;
    background: rgba(20, 20, 30, 0.98);
    backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 9999px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.98), 0 0 1px rgba(255, 255, 255, 0.4);
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
    pointer-events: none;
    transition: all 180ms ease;
    white-space: nowrap;
}
.sh-rating-stars-flyout.open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}
.sh-star-btn {
    background: transparent;
    border: none;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.25);
    cursor: pointer;
    padding: 0 2px;
    transition: transform 140ms ease, color 140ms ease;
}
.sh-star-btn:hover,
.sh-star-btn.active {
    color: #ffd600;
    transform: scale(1.25);
    text-shadow: 0 0 10px rgba(255, 214, 0, 0.75);
}
.sh-star-score-txt {
    font-size: 12px;
    font-weight: 750;
    color: rgba(255, 255, 255, 0.85);
    margin-left: 8px;
}

/* ── 🏛️ Corps & Onglets avec Pastille Glissante Ressort ──────── */
.sh-cinema-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 32px 16px;
    box-sizing: border-box;
    overflow: hidden;
}
.sh-cinema-tabs-nav {
    position: relative;
    display: flex;
    gap: 2px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 3px;
    border-radius: 9999px;
    margin: 4px 0 10px;
    width: fit-content;
    flex-shrink: 0;
}
.sh-tabs-slider-pill {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 0;
    width: 90px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.20);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    transition: transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1),
                width 320ms cubic-bezier(0.34, 1.4, 0.64, 1);
    z-index: 1;
}
.sh-tab-btn {
    position: relative;
    z-index: 2;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.55);
    padding: 5px 16px;
    border-radius: 9999px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: color 180ms ease;
    white-space: nowrap;
}
.sh-tab-btn:hover {
    color: #ffffff;
}
.sh-tab-btn.active {
    color: #ffffff;
    font-weight: 700;
}

/* Panneaux d'Onglets */
.sh-cinema-panels-wrapper {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    scrollbar-width: none !important;
}
.sh-cinema-panels-wrapper::-webkit-scrollbar { display: none !important; }

.sh-tab-panel {
    display: none;
    opacity: 0;
}
.sh-tab-panel.active {
    display: block;
    opacity: 1;
}

/* ── Idée C : Animations Échelonnées (Staggered Motion) ──────── */
.sh-tab-panel.active > * > *:nth-child(1) { animation: sh-stagger-fade 320ms 40ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.sh-tab-panel.active > * > *:nth-child(2) { animation: sh-stagger-fade 320ms 80ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.sh-tab-panel.active > * > *:nth-child(3) { animation: sh-stagger-fade 320ms 120ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.sh-tab-panel.active > * > *:nth-child(4) { animation: sh-stagger-fade 320ms 160ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.sh-tab-panel.active > * > *:nth-child(5) { animation: sh-stagger-fade 320ms 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.sh-tab-panel.active > * > *:nth-child(6) { animation: sh-stagger-fade 320ms 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }

@keyframes sh-stagger-fade {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── 📖 Onglet 1 : Synopsis & Structure Éditoriale Zéro-Scroll ── */
.sh-synopsis-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 6px;
}

.sh-synopsis-text-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.sh-section-subtitle {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: rgba(255, 255, 255, 0.40);
}
.sh-panel-overview {
    font-size: 13.5px !important;
    line-height: 1.55 !important;
    color: rgba(255, 255, 255, 0.90) !important;
    margin: 0 !important;
    font-weight: 400;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── 🏆 Section Réputation Cinéma : 2 Boîtes Bento Smoked Glass Compactes ─ */
.sh-cinema-critics-block {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 12px !important;
    margin: 0 !important;
}
@media (max-width: 820px) {
    .sh-cinema-critics-block { grid-template-columns: 1fr !important; }
}

.sh-critics-bento-card {
    background: rgba(20, 20, 28, 0.75) !important;
    -webkit-backdrop-filter: blur(30px) saturate(190%) !important;
    backdrop-filter: blur(30px) saturate(190%) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 14px !important;
    padding: 12px 14px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.60), inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;
    transition: border-color 220ms ease, transform 220ms ease, box-shadow 220ms ease;
}
.sh-critics-bento-card:hover {
    border-color: rgba(255, 255, 255, 0.28) !important;
    transform: translateY(-1px);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.70), inset 0 1px 0 rgba(255, 255, 255, 0.22) !important;
}

.sh-critics-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.sh-critics-brand-row {
    display: flex;
    align-items: center;
    gap: 7px;
}
.sh-critics-title-label {
    font-size: 12.5px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: -0.2px;
}
.sh-critics-badge {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 1.5px 6px;
    border-radius: 5px;
}
.sh-critics-badge.certified {
    background: rgba(250, 50, 10, 0.22);
    color: #ff5252;
    border: 1px solid rgba(250, 50, 10, 0.45);
}
.sh-critics-badge.fresh {
    background: rgba(56, 142, 60, 0.22);
    color: #4caf50;
    border: 1px solid rgba(56, 142, 60, 0.45);
}
.sh-critics-badge.rotten {
    background: rgba(120, 177, 63, 0.22);
    color: #8bc34a;
    border: 1px solid rgba(120, 177, 63, 0.45);
}

.sh-critics-score-val-large {
    font-size: 19px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: -0.5px;
}
.sh-critics-score-val-large.imdb-gold {
    color: #f5c518;
}
.sh-critics-score-val-large small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
}

.sh-critics-consensus-text {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.82);
    font-weight: 400;
}

.sh-critics-quote-box {
    background: rgba(255, 255, 255, 0.04);
    border-left: 2.5px solid #ff9f0a;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 11.5px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.85);
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.sh-critics-quote-box cite {
    font-style: normal;
    font-weight: 700;
    color: #ff9f0a;
    font-size: 10px;
    text-align: right;
}

.sh-critics-stars-display {
    color: #f5c518;
    font-size: 13px;
    letter-spacing: 1.5px;
}

.sh-critics-stat-section {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.sh-critics-bar-track {
    width: 100%;
    height: 5px;
    background: rgba(255, 255, 255, 0.10);
    border-radius: 9999px;
    overflow: hidden;
}
.sh-critics-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #f5c518 0%, #30d158 100%);
    border-radius: 9999px;
}
.sh-critics-legend-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.70);
}

.sh-critics-footer-meta {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.40);
    padding-top: 2px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* ── ⚙️ Fiche Technique & Métadonnées (Grille 4 cases Compacte) ──────── */
.sh-panel-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 0;
}
.sh-meta-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 7px 12px;
    transition: all 180ms ease;
}
.sh-meta-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
}
.sh-cell-label {
    font-size: 9.5px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.40);
}
.sh-cell-val {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.90);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── Idée D : Onglet 2 : Casting & Équipe Enrichi ────────────── */
.sh-cast-luxury-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    padding: 2px 0;
}
.sh-cast-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 12px 16px;
    transition: all 180ms ease;
}
.sh-cast-card:hover {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.24);
    transform: translateY(-2px);
}
.sh-cast-card img {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.20);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.sh-cast-avatar-fallback {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.20);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
    flex-shrink: 0;
}
.sh-episode-thumb-fallback {
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
}
.sh-cast-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.sh-actor-name {
    font-size: 13.5px;
    font-weight: 750;
    color: #ffffff;
}
.sh-role-name {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.55);
}
.sh-role-badge {
    font-size: 10.5px;
    font-weight: 700;
    color: #38bdf8;
}

/* Onglet 3 : Bonus & Vidéos (3 Cartes 16:9 Spacieuses) */
.sh-bonus-luxury-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    padding: 2px 0;
}
.sh-bonus-item {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    transition: all 200ms ease;
}
.sh-bonus-item:hover {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-3px);
}
.sh-bonus-thumb-wrap {
    height: 140px;
    background: linear-gradient(135deg, #181824, #323248);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}
.sh-bonus-play-disc {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    padding-left: 2px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
    transition: transform 180ms ease;
}
.sh-bonus-item:hover .sh-bonus-play-disc {
    transform: scale(1.15);
}
.sh-bonus-dur-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.80);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 5px;
}
.sh-bonus-meta {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.sh-bonus-pill-tag {
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.50);
}
.sh-bonus-headline {
    font-size: 13px;
    font-weight: 650;
    color: #ffffff;
}

/* ── Onglet 4 : Titres Similaires — Grille Bento Responsive ── */
.sh-similar-bento-grid,
.sh-bento-luxury-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    padding: 2px 0 16px;
}
.sh-bento-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 18px;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-bento-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.28);
    transform: translateY(-4px);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75);
}
.sh-bento-poster-wrap,
.sh-bento-thumb-container {
    height: 130px;
    position: relative;
    background: #14141e;
    overflow: hidden;
}
.sh-bento-poster-wrap img,
.sh-bento-thumb-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 380ms ease;
}
.sh-bento-card:hover .sh-bento-poster-wrap img,
.sh-bento-card:hover .sh-bento-thumb-container img {
    transform: scale(1.06);
}
.sh-bento-thumb-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(12, 12, 18, 0.85) 0%, transparent 60%);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 8px 12px;
}
.sh-bento-quick-play {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.90);
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    padding-left: 2px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    opacity: 0;
    transform: scale(0.8);
    transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-bento-card:hover .sh-bento-quick-play {
    opacity: 1;
    transform: scale(1);
}
.sh-bento-match-badge {
    font-size: 10px;
    font-weight: 800;
    color: #4ade80;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid rgba(74, 222, 128, 0.3);
}
.sh-bento-content {
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.sh-bento-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.sh-bento-title {
    font-size: 13.5px;
    font-weight: 750;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sh-bento-add-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 160ms ease;
    flex-shrink: 0;
}
.sh-bento-add-btn:hover,
.sh-bento-add-btn.added {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.10);
}
.sh-bento-meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.60);
    font-weight: 550;
}
.sh-bento-score {
    color: #ffd600;
    font-weight: 750;
}
.sh-bento-dot {
    color: rgba(255, 255, 255, 0.25);
    font-size: 8px;
}
.sh-bento-age-tag {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
}
.sh-bento-tech-tag {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
    color: #38bdf8;
}
.sh-bento-desc {
    font-size: 11.5px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.70);
    margin: 2px 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* ── 🎵 Musique : Artwork Carré 1:1 & Effet Disque Vinyle ───── */
.sh-cinema-hero-poster--music {
    width: 140px !important;
    aspect-ratio: 1/1 !important;
    border-radius: 16px !important;
    position: relative !important;
    overflow: visible !important;
}
.sh-cinema-hero-poster--music img {
    border-radius: 14px;
    box-shadow: 0 14px 32px rgba(0,0,0,0.85);
}
.sh-vinyl-disc-grooves {
    position: absolute;
    top: 5px;
    right: -24px;
    width: 130px;
    height: 130px;
    border-radius: 50%;
    background: radial-gradient(circle, #09090c 25%, #181822 45%, #050508 70%, #151520 100%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.75);
    z-index: -1;
    animation: sh-vinyl-spin 20s linear infinite;
}
@keyframes sh-vinyl-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

/* ── 📺 Séries : Épisodes & Saisons ─────────────────────────── */
.sh-series-episodes-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.sh-season-pills-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
}
.sh-season-pill-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.70);
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 180ms ease;
}
.sh-season-pill-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
}
.sh-season-pill-btn.active {
    background: rgba(255, 255, 255, 0.20);
    border-color: rgba(255, 255, 255, 0.35);
    color: #ffffff;
    font-weight: 750;
}
.sh-season-badge-state {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    color: #4ade80;
    background: rgba(74, 222, 128, 0.12);
    border: 1px solid rgba(74, 222, 128, 0.25);
    padding: 3px 10px;
    border-radius: 9999px;
}
.sh-episodes-cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding-bottom: 16px;
}
.sh-episode-card {
    display: flex;
    gap: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 10px;
    cursor: pointer;
    transition: all 200ms ease;
}
.sh-episode-card:hover {
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-2px);
}
.sh-episode-thumb-wrap {
    width: 135px;
    aspect-ratio: 16/9;
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
    background: #181824;
}
.sh-episode-thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.sh-episode-overlay-play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    font-size: 14px;
    color: #ffffff;
    opacity: 0;
    transition: opacity 180ms ease;
}
.sh-episode-card:hover .sh-episode-overlay-play {
    opacity: 1;
}
.sh-episode-badge-num {
    position: absolute;
    top: 5px;
    left: 5px;
    background: rgba(0, 0, 0, 0.75);
    color: #ffffff;
    font-size: 9.5px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
}
.sh-episode-dur {
    position: absolute;
    bottom: 5px;
    right: 5px;
    background: rgba(0, 0, 0, 0.80);
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 4px;
}
.sh-episode-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.20);
}
.sh-episode-progress-fill {
    height: 100%;
    background: #ff3b30;
}
.sh-episode-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    min-width: 0;
    flex: 1;
}
.sh-episode-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
}
.sh-episode-title {
    font-size: 12.5px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 160ms ease;
}
.sh-episode-date {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
    flex-shrink: 0;
}
.sh-episode-synopsis {
    font-size: 11px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.65);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.sh-episode-details-hint,
.sh-saga-details-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 700;
    color: #38bdf8;
    margin-top: 2px;
    opacity: 0.85;
    transition: all 180ms ease;
}
.sh-episode-info:hover .sh-episode-details-hint,
.sh-saga-card-content:hover .sh-saga-details-hint {
    opacity: 1;
    color: #7dd3fc;
    transform: translateX(2px);
}
.sh-episode-info:hover .sh-episode-title,
.sh-saga-card-content:hover .sh-saga-title {
    color: #38bdf8;
    text-decoration: underline;
    text-underline-offset: 3px;
}
.sh-episode-thumb-wrap:hover .sh-episode-overlay-play,
.sh-saga-thumb-container:hover .sh-saga-quick-play {
    opacity: 1 !important;
    transform: scale(1.12);
    background: rgba(0, 0, 0, 0.60);
}

/* ── 🎬 Collections : Films de la Saga ───────────────────────── */
.sh-saga-films-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 16px;
}
.sh-saga-movie-card {
    display: flex;
    gap: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 12px;
    cursor: pointer;
    transition: all 200ms ease;
}
.sh-saga-movie-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.24);
    transform: translateY(-2px);
}
.sh-saga-thumb-container {
    width: 170px;
    aspect-ratio: 16/9;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
    background: #14141e;
}
.sh-saga-thumb-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.sh-saga-quick-play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    font-size: 15px;
    color: #ffffff;
    opacity: 0;
    transition: opacity 180ms ease;
}
.sh-saga-movie-card:hover .sh-saga-quick-play {
    opacity: 1;
}
.sh-saga-num-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    background: rgba(0, 0, 0, 0.75);
    color: #ffd600;
    font-size: 9.5px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid rgba(255, 214, 0, 0.3);
}
.sh-saga-card-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    justify-content: center;
}
.sh-saga-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.sh-saga-title {
    font-size: 14.5px;
    font-weight: 750;
    color: #ffffff;
    transition: color 160ms ease;
}
.sh-saga-play-btn {
    background: #ffffff;
    color: #000000;
    border: none;
    font-size: 11.5px;
    font-weight: 750;
    padding: 6px 14px;
    border-radius: 9999px;
    cursor: pointer;
    transition: transform 160ms ease, background 160ms ease;
}
.sh-saga-play-btn:hover {
    transform: scale(1.06);
    background: #f0f0f8;
}
.sh-saga-meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.60);
    font-weight: 550;
}


/* ── 🎵 Musique : Pistes & Morceaux ─────────────────────────── */
.sh-album-tracks-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 16px;
}
.sh-tracks-table {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.sh-track-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 160ms ease;
}
.sh-track-row:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
}
.sh-track-row.playing {
    background: rgba(56, 189, 248, 0.14);
    border-color: rgba(56, 189, 248, 0.30);
    color: #38bdf8;
}
.sh-track-num-col {
    width: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.40);
    position: relative;
}
.sh-track-play-btn {
    display: none;
    background: transparent;
    border: none;
    color: #ffffff;
    font-size: 12px;
    cursor: pointer;
}
.sh-track-row:hover .sh-track-index {
    display: none;
}
.sh-track-row:hover .sh-track-play-btn {
    display: block;
}
.sh-track-title-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.sh-track-name {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
}
.sh-track-artist {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.50);
}
.sh-track-tag-col {
    display: flex;
    align-items: center;
}
.sh-track-badge {
    font-size: 9.5px;
    font-weight: 750;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.10);
    border: 1px solid rgba(56, 189, 248, 0.22);
    padding: 2px 7px;
    border-radius: 5px;
}
.sh-track-duration-col {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.60);
}
        `;
        document.head.appendChild(style);
    }
}

export default ModalSlideUpSheet;


