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
 * - Onglet Casting enrichi à partir des personnes réellement renvoyées par Jellyfin.
 */

'use strict';


import './ModalSlideUpSheet.css';
import * as svc from '../../core/services.js';
class ModalSlideUpSheet {
    constructor() {
        this._sheet = null;
        this._overlay = null;
        this._ambientGlow = null;
        this._isOpen = false;
        this._currentItem = null;
        this._activeTab = 'synopsis';
        this._selectedAudioIndex = 0;
        this._selectedSubtitleIndex = -1;
        this._audioPopoverOpen = false;
        this._history = [];
        this._docClickHandler = null; // Référence unique pour éviter la fuite de listeners
        this._escHandler = null;
        this._detailsGeneration = 0;
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

        if (!this._escHandler) {
            // Ferme uniquement le sous-état local (popover audio) qu'aucun autre système ne connaît.
            // La fermeture de la sheet elle-même est déléguée à SpatialNavigation._handleBack()
            // (sélecteur .sh-slideup-sheet--open déjà reconnu — doublon supprimé, cf. plan A05).
            this._escHandler = (e) => {
                if (e.key === 'Escape' && this._isOpen && this._audioPopoverOpen) {
                    this._closeAudioPopover();
                }
            };
            window.addEventListener('keydown', this._escHandler);
        }
    }

    open(item = {}, options = {}) {
        this._detailsGeneration += 1;
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
        const api = svc.jellyfinApi();
        const apiClient = svc.api()?.getClient('jellyfin');
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
            const nav = svc.nav() || svc.appLayout()?._spatialNav;
            nav?.onModalOpened(this._sheet);
            this._sheet.querySelector('.sh-cinema-body')?.scrollTo({ top: 0, behavior: 'instant' });
        });

        if (this._ambientGlow) {
            const bg = this._escapeUrl(backdropUrl || posterUrl || item.backdropUrl || item.imageUrl || '');
            this._ambientGlow.style.backgroundImage = bg ? `url("${bg}")` : '';
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
            const rating = Number.isFinite(Number(item.CommunityRating)) ? Number(item.CommunityRating) : null;
            const rtScore = Number.isFinite(Number(item.CriticRating)) && Number(item.CriticRating) > 0
                ? Math.round(Number(item.CriticRating))
                : null;
            // Base réelle depuis Jellyfin (CriticRating) ; OMDb complète via _attachExternalRatings.
            const criticData = rtScore !== null
                ? { rtScore, imdb: null, imdbVotes: null, metacritic: null, sourceLabel: 'Jellyfin' }
                : null;
            if (heroDetailsEl) heroDetailsEl._criticData = criticData;
            if (metaLineEl) metaLineEl._criticData = criticData;
        }

        // 2. Chargement asynchrone des métadonnées réelles enrichies
        this._loadFullDetails(item, this._detailsGeneration);
        this._attachExternalRatings(item);
    }

    _attachExternalRatings(item) {
        const ratingCache = svc.ratingCache();
        if (!ratingCache) return;

        // Idempotence : retirer les badges externes déjà insérés avant réinsertion
        const metaLine = this._sheet?.querySelector('.sh-cinema-meta-line');
        metaLine?.querySelectorAll('.sh-modal-header-badge--rt, .sh-modal-header-badge--imdb, .sh-modal-header-badge--mc, .sh-score-btn').forEach(b => b.remove());

        // Rafraîchissement après enregistrement d'une clé OMDb (fiche déjà ouverte)
        if (!this._ratingsRefreshBound) {
            this._ratingsRefreshBound = true;
            document.addEventListener('spacehub:ratings-updated', () => {
                if (this._isOpen && this._currentItem) this._attachExternalRatings(this._currentItem);
            });
        }

        ratingCache.get(item).then(ratings => {
            if (!this._isOpen) return;
            const metaLineEl = this._sheet?.querySelector('.sh-cinema-meta-line');
            if (!metaLineEl) return;
            const yearEl = metaLineEl.querySelector('.sh-meta-bullet');
            if (!yearEl) return;

            // Hiérarchie : avec un score IMDb OMDb, le ★ Jellyfin fait doublon → retiré
            const communityBadge = metaLineEl.querySelector('.sh-modal-header-badge--community');
            if (communityBadge && ratings.imdb != null) communityBadge.remove();
            let html = '';
            if (ratings.rt != null) {
                html += `<span class="sh-modal-header-badge sh-score-btn sh-score-rt" tabindex="0" data-nav-focusable="true" title="Rotten Tomatoes"><span aria-hidden="true">🍅</span><span>${ratings.rt}%</span></span>`;
            }
            if (ratings.imdb != null) {
                const imdbTitle = ratings.isSeriesFallback ? 'Note de la série — IMDb' : 'IMDb';
                html += `<span class="sh-modal-header-badge sh-score-btn sh-score-imdb" tabindex="0" data-nav-focusable="true" title="${imdbTitle}"><span>IMDb ${ratings.imdb.toFixed(1)}</span></span>`;
            }
            if (ratings.metacritic != null) {
                html += `<span class="sh-modal-header-badge sh-modal-header-badge--mc" title="Metacritic"><span>MC ${ratings.metacritic}</span></span>`;
            }
            if (html) {
                yearEl.insertAdjacentHTML('beforebegin', html);
                // Activation clavier/télécommande : Entrée/Espace déclenche le comportement clic
                metaLineEl.querySelectorAll('.sh-score-btn[tabindex="0"]').forEach(badge => {
                    badge.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            badge.click();
                        }
                    });
                });
            }
            // Fusion des données réelles : Jellyfin 🍅 (base) + OMDb (IMDb/MC/RT)
            const base = metaLineEl._criticData || {};
            metaLineEl._criticData = {
                rtScore: ratings.rt ?? base.rtScore ?? null,
                imdb: ratings.imdb ?? null,
                imdbVotes: ratings.imdbVotes ?? null,
                metacritic: ratings.metacritic ?? null,
                sourceLabel: ratings.rt != null ? 'OMDb' : (base.sourceLabel || null),
                isSeriesFallback: ratings.isSeriesFallback ?? base.isSeriesFallback ?? false
            };
            this._updateCriticsBento(metaLineEl._criticData);

            // Texte critique réel (TMDB) — chargé en parallèle, jamais inventé
            ratingCache.getText(item).then(text => {
                if (!this._isOpen) return;
                this._updateCriticsBento(metaLineEl._criticData, text);
            }).catch(() => {});
        }).catch(() => {});
    }

    /**
     * Met à jour la section À propos (bento critiques) avec les données réelles disponibles.
     * Carte sans score réel ET sans texte TMDB → masquée proprement (rien d'inventé).
     */
    _updateCriticsBento(criticData, criticText = null) {
        if (!criticData) return;
        const q = (sel) => this._sheet?.querySelector(sel);

        const rtScore = Number(criticData.rtScore);
        const hasRt = Number.isFinite(rtScore) && rtScore > 0;
        const rtCard = q('.sh-critics-bento-card--rt');
        if (!hasRt && !criticText?.text) {
            if (rtCard) {
                rtCard.classList.add('sh-critics-bento-card--hidden');
                rtCard.setAttribute('hidden', '');
            }
        } else {
            if (rtCard) {
                rtCard.classList.remove('sh-critics-bento-card--hidden');
                rtCard.removeAttribute('hidden');
            }
            if (hasRt) {
                const scoreEl = q('#sh-critics-rt-score');
                if (scoreEl) scoreEl.textContent = `${rtScore}%`;
                const statusEl = q('#sh-critics-rt-status');
                if (statusEl) {
                    statusEl.textContent = rtScore >= 75 ? 'Certified Fresh' : (rtScore >= 60 ? 'Fresh' : 'Rotten');
                    statusEl.classList.remove('certified', 'fresh', 'rotten');
                    statusEl.classList.add(rtScore >= 75 ? 'certified' : (rtScore >= 60 ? 'fresh' : 'rotten'));
                    statusEl.style.display = '';
                }
            }
            const noteEl = q('#sh-critics-rt-note');
            if (noteEl) {
                if (criticText?.text) {
                    noteEl.textContent = criticText.text;
                } else {
                    noteEl.textContent = hasRt ? 'Score de la presse agrégé par Rotten Tomatoes.' : '';
                }
            }
            const srcEl = q('#sh-critics-rt-source');
            if (srcEl) {
                const parts = [];
                if (hasRt) parts.push(`Score : ${criticData.sourceLabel || 'OMDb'}`);
                if (criticText?.text) parts.push(`Texte : ${criticText.source || 'TMDB'}${criticText.author && criticText.author !== 'TMDB' ? ' — ' + criticText.author : ''}`);
                srcEl.textContent = parts.length > 0 ? parts.join(' • ') : '';
            }
        }

        const imdbCard = q('.sh-critics-bento-card--community');
        const imdb = Number(criticData.imdb);
        if (!Number.isFinite(imdb) || imdb <= 0) {
            if (imdbCard) {
                imdbCard.classList.add('sh-critics-bento-card--hidden');
                imdbCard.setAttribute('hidden', '');
            }
        } else {
            if (imdbCard) {
                imdbCard.classList.remove('sh-critics-bento-card--hidden');
                imdbCard.removeAttribute('hidden');
            }
            const el = q('#sh-critics-imdb-score');
            if (el) el.innerHTML = `★ ${imdb.toFixed(1)}<small>/10</small>`;
            const votesEl = q('#sh-critics-imdb-votes');
            if (votesEl) {
                if (criticData.imdbVotes != null) {
                    const votesNum = Number(String(criticData.imdbVotes).replace(/[^\d]/g, ''));
                    votesEl.textContent = (Number.isFinite(votesNum) && votesNum > 0)
                        ? `${votesNum.toLocaleString('fr-FR')} votes spectateurs`
                        : (criticData.isSeriesFallback ? 'Note de la série' : 'Note spectateurs IMDb');
                } else {
                    votesEl.textContent = criticData.isSeriesFallback ? 'Note de la série' : 'Note spectateurs IMDb';
                }
            }
            const srcEl = q('#sh-critics-community-source');
            if (srcEl) srcEl.textContent = criticData.isSeriesFallback ? 'Source : OMDb (IMDb) — note de la série' : 'Source : OMDb (IMDb)';
        }

        const mc = Number(criticData.metacritic);
        const mcEl = q('#sh-critics-mc');
        if (mcEl) {
            if (Number.isFinite(mc) && mc > 0) {
                mcEl.removeAttribute('hidden');
                mcEl.style.removeProperty('display');
                mcEl.textContent = `🟢 ${mc} Metascore`;
            } else {
                mcEl.setAttribute('hidden', '');
            }
        }
        const mcInline = q('#sh-critics-mc-inline');
        if (mcInline) {
            mcInline.textContent = (Number.isFinite(mc) && mc > 0) ? `Metascore : ${mc}` : '';
        }
    }

    close() {
        this._detailsGeneration += 1;
        if (!this._isOpen) return;
        const closedItem = this._currentItem;
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

        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav && typeof spatialNav.onModalClosed === 'function') {
            spatialNav.onModalClosed(closedItem);
        }
        // Nettoyage du listener global pour éviter les fuites
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
            this._docClickHandler = null;
        }
    }

    destroy() {
        this.close();
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this._sheet?.replaceChildren();
    }

    _renderContent(item, images = {}) {
        const rawType = (item.Type || item.type || item.MediaType || item.mediaType || '').toLowerCase();
        const isMovie = rawType === 'movie' || item.isMovie;
        const isEpisode = rawType === 'episode';
        const isCollection = rawType === 'boxset' || rawType === 'collection' || rawType === 'saga' || item.isCollection;
        const isMusic = rawType === 'musicalbum' || rawType === 'music' || rawType === 'album' || rawType === 'audio' || item.isMusic;
        const isCalendarOrServarr = item.source === 'sonarr' || item.source === 'radarr' || item.source === 'jellyseerr' || (typeof item.Id === 'string' && (item.Id.startsWith('sonarr-') || item.Id.startsWith('radarr-') || item.Id.startsWith('sh-cal-') || item.Id.startsWith('jellyseerr-')));
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
        const rating = item.CommunityRating !== undefined && item.CommunityRating !== null
            ? Number(item.CommunityRating)
            : null;
        const rtScore = item.CriticRating !== undefined && item.CriticRating !== null
            ? Number(item.CriticRating)
            : null;
        const imdbScore = rating !== null ? rating.toFixed(1) : null;
        const overview = item.Overview || item.overview || 'Synopsis non disponible sur le serveur.';
        const duration = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000000 / 60) + ' min' : (item.duration || '');
        const posterUrl = images.posterUrl || item.posterUrl || item.imageUrl || '';
        const genres = Array.isArray(item.Genres) && item.Genres.length > 0
            ? item.Genres.join(' • ')
            : 'Non renseigné par Jellyfin';
        const mediaStreams = Array.isArray(item.MediaStreams)
            ? item.MediaStreams
            : (Array.isArray(item.MediaSources) ? item.MediaSources.flatMap(source => source.MediaStreams || []) : []);
        const has4K = mediaStreams.some(stream => Number(stream.Width) >= 3840 || /4k|uhd/i.test(stream.DisplayTitle || stream.Title || ''));
        const hasAtmos = mediaStreams.some(stream => stream.Type === 'Audio' && /atmos/i.test(`${stream.Codec || ''} ${stream.DisplayTitle || ''} ${stream.Title || ''}`));
        const hasDolbyVision = mediaStreams.some(stream => /dolby.?vision/i.test(`${stream.VideoRange || ''} ${stream.VideoRangeType || ''} ${stream.DisplayTitle || ''}`));

        const cardBuilder = svc.cardBuilder();
        const criticData = null; // Jellyfin ne fournit pas de données critiques externes vérifiées.

        const hasHistory = this._history.length > 0;
        const prevItem = hasHistory ? this._history[this._history.length - 1] : null;
        const prevItemName = prevItem ? (prevItem.Name || prevItem.title || 'Précédent') : '';
        const backBtnLabel = hasHistory ? `Retour à ${prevItemName}` : 'Retour';
        const backBtnTitle = hasHistory ? `Retour à : ${prevItemName}` : 'Fermer la fiche et revenir';
        const safePosterUrl = this._escapeUrl(posterUrl);
        const safeBackdropUrl = this._escapeUrl(images.backdropUrl || posterUrl);

        this._sheet.innerHTML = `
            <!-- 🎬 EN-TÊTE HERO CINÉMATIQUE ADAPTATIF -->
            <div class="sh-cinema-hero">
                <div class="sh-cinema-hero-bg-container">
                    <div class="sh-cinema-hero-backdrop"${safeBackdropUrl ? ` style="background-image: url(\"${safeBackdropUrl}\");"` : ''}></div>
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
                        ${safePosterUrl ? `
                            <img decoding="async" src="${safePosterUrl}" alt="${this._escape(title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="sh-cinema-poster-fallback" style="display: none; width: 100%; height: 100%; background: rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${this._escape(title)}</small>
                            </div>
                        ` : `
                            <div class="sh-cinema-poster-fallback" style="display: flex; width: 100%; height: 100%; background: rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${this._escape(title)}</small>
                            </div>
                        `}
                        ${isMusic ? '<div class="sh-vinyl-disc-grooves"></div>' : ''}
                    </div>

                    <div class="sh-cinema-hero-details">
                        <!-- Badges Techniques Adaptatifs -->
                        <div class="sh-cinema-badge-top">
                            <span class="sh-badge-glass-pill" id="sh-badge-type">${isMusic ? 'ALBUM MUSICAL' : isCollection ? 'SAGA CINÉMA' : isSeries ? 'SÉRIE TV' : 'LONG-MÉTRAGE'}</span>
                            ${has4K ? '<span class="sh-badge-glass-pill" id="sh-badge-quality">4K UHD</span>' : ''}
                            ${hasAtmos ? '<span class="sh-badge-glass-pill" id="sh-badge-audio">DOLBY ATMOS</span>' : ''}
                            ${hasDolbyVision ? '<span class="sh-badge-glass-pill" id="sh-badge-vision">DOLBY VISION</span>' : ''}
                        </div>

                        <h1 class="sh-cinema-title">${this._escape(title)}</h1>

                        <!-- Ligne Typographique Épurée de Métadonnées avec Badges Critiques Officiels (Navigation Onglet À Propos) -->
                        <div class="sh-cinema-meta-line">
                            ${rating !== null ? `<span class="sh-modal-header-badge sh-modal-header-badge--community" title="Note Jellyfin"><span aria-hidden="true">★</span><span>${rating.toFixed(1)}/10</span></span>` : ''}
                            <span class="sh-score-ext" data-item-id="${this._escape(item.Id || item.id || '')}" style="display:contents"></span>
                            ${year ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${this._escape(year)}</span>` : ''}
                            ${duration ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${this._escape(duration)}</span>` : ''}
                            <span class="sh-meta-bullet">•</span>
                            <span class="sh-meta-text" id="sh-hero-genres">${this._escape(genres)}</span>
                        </div>

                        <!-- Barre d'Actions Principales Haute Couture (Pills) -->
                        <div class="sh-cinema-actions">
                            <button class="sh-cinema-btn-play" id="sh-slideup-play-btn">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <span>${isMusic ? 'Écouter tout' : isCollection ? 'Lancer la Saga' : isSeries ? 'Reprendre la série' : 'Regarder'}</span>
                            </button>
                            ${isCalendarOrServarr ? `
                                <button class="sh-cinema-btn-glass" id="sh-slideup-request-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>
                                    <span>Demander au serveur</span>
                                </button>
                            ` : ''}

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
                                    <span class="sh-jellyseerr-pill-badge" style="background:#6366f1; color:var(--sh-ink-solid, #ffffff); font-weight:700; padding:2px 8px; border-radius:6px; font-size:11px;">Jellyseerr</span>
                                    <h3 style="margin:0; font-size:16px; color:var(--sh-ink-solid, #ffffff); font-weight:700;">Demande sur le serveur</h3>
                                </div>
                                <button type="button" class="sh-drawer-close" id="sh-drawer-close">✕</button>
                            </div>
                            
                            <div class="sh-drawer-grid">
                                <div class="sh-drawer-field">
                                    <label class="sh-drawer-label">Profil de Qualité (${isSeries ? 'Sonarr' : 'Radarr'})</label>
                                    <select class="sh-drawer-select" id="sh-drawer-profile-select">
                                        <option value="" selected>Profil fourni par le serveur…</option>
                                    </select>
                                </div>
                                <div class="sh-drawer-field">
                                    <label class="sh-drawer-label">Dossier de Destination</label>
                                    <select class="sh-drawer-select" id="sh-drawer-folder-select">
                                        <option value="" selected>Dossier fourni par le serveur…</option>
                                    </select>
                                </div>
                            </div>

                            ${isSeries ? `
                                <div class="sh-drawer-checkbox-row">
                                    <label style="display:flex; align-items:center; gap:8px; color:rgba(var(--sh-ink, 255, 255, 255), 0.85); font-size:13px; cursor:pointer;">
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
                                    <button class="sh-season-pill-btn" tabindex="0" data-nav-focusable="true">Chargement des saisons...</button>
                                </div>
                                <div class="sh-episodes-cards-grid">
                                    <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des épisodes...</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 🎬 COLLECTIONS : Panneau Films de la Saga -->
                    ${isCollection ? `
                        <div class="sh-tab-panel ${this._activeTab === 'sagafilms' ? 'active' : ''}" id="sh-panel-sagafilms">
                            <div class="sh-saga-films-grid">
                                <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des films de la saga...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 🎵 MUSIQUE : Panneau Pistes de l'Album -->
                    ${isMusic ? `
                        <div class="sh-tab-panel ${this._activeTab === 'tracks' ? 'active' : ''}" id="sh-panel-tracks">
                            <div class="sh-album-tracks-container">
                                <div class="sh-tracks-table">
                                    <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des pistes audio...</div>
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

                            <!-- 2. 🏆 RÉPUTATION & CRITIQUES PRESSE & PUBLIC — données réelles Jellyfin + OMDb (aucune valeur fabriquée) -->
                            ${true ? `
                            <div class="sh-cinema-critics-block">
                                <!-- Carte 1: Rotten Tomatoes — Presse -->
                                <div class="sh-critics-bento-card sh-critics-bento-card--rt">
                                    <div class="sh-critics-card-header">
                                        <div class="sh-critics-brand-row">
                                            ${cardBuilder?.getRtIconSvg?.(rtScore) || ''}
                                            <span class="sh-critics-title-label">Rotten Tomatoes — Presse</span>
                                            <span class="sh-critics-badge ${rtScore ? (rtScore >= 75 ? 'certified' : (rtScore >= 60 ? 'fresh' : 'rotten')) : ''}" id="sh-critics-rt-status" ${rtScore ? '' : 'style="display:none;"'}>${rtScore ? (rtScore >= 75 ? 'Certified Fresh' : (rtScore >= 60 ? 'Fresh' : 'Rotten')) : ''}</span>
                                        </div>
                                        <div class="sh-critics-score-val-large" id="sh-critics-rt-score">${rtScore ? `${rtScore}%` : '—'}</div>
                                    </div>
                                    <p class="sh-critics-consensus-text" id="sh-critics-rt-note">${rtScore ? 'Score de la presse agrégé par Rotten Tomatoes.' : 'Aucune note presse disponible pour ce titre.'}</p>
                                    <div class="sh-critics-footer-meta">
                                        <span id="sh-critics-rt-source">${rtScore ? 'Source : Jellyfin' : 'Source : aucune'}</span>
                                        <span id="sh-critics-mc" style="display:none;"></span>
                                    </div>
                                </div>

                                <!-- Carte 2: Note des Spectateurs — Jellyfin ★ enrichi via OMDb (IMDb) -->
                                <div class="sh-critics-bento-card sh-critics-bento-card--community">
                                    <div class="sh-critics-card-header">
                                        <div class="sh-critics-brand-row">
                                            <span class="sh-imdb-badge-solid">IMDb</span>
                                            <span class="sh-critics-title-label">Note des Spectateurs</span>
                                        </div>
                                        <div class="sh-critics-score-val-large imdb-gold" id="sh-critics-imdb-score">${imdbScore !== null ? `★ ${imdbScore}<small>/10</small>` : '—'}</div>
                                    </div>
                                    <div class="sh-critics-stat-section">
                                        <div class="sh-critics-legend-row">
                                            <span id="sh-critics-imdb-votes">${imdbScore !== null ? 'Note du public' : 'Aucune note spectateur disponible'}</span>
                                            <span id="sh-critics-mc-inline"></span>
                                        </div>
                                    </div>
                                    <div class="sh-critics-footer-meta">
                                        <span id="sh-critics-community-source">${imdbScore !== null ? 'Source : Jellyfin — enrichi via OMDb si configuré' : 'Source : aucune'}</span>
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
                                    <span class="sh-cell-val" id="sh-meta-director-val">${this._escape(item.network || item.studio || 'Non renseigné par Jellyfin')}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Format & Qualité</span>
                                    <span class="sh-cell-val" id="sh-meta-format-val">${item.hasFile ? 'Disponible dans la médiathèque' : 'Format non renseigné par Jellyfin'}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Classification & Statut</span>
                                    <span class="sh-cell-val" id="sh-meta-rating-val">${item.hasFile ? '✓ Téléchargé & Prêt' : this._escape(item.OfficialRating || 'Statut non renseigné par Jellyfin')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Panneau Casting & Équipe -->
                    ${!isMusic ? `
                        <div class="sh-tab-panel ${this._activeTab === 'casting' ? 'active' : ''}" id="sh-panel-casting">
                            <div class="sh-cast-luxury-grid" id="sh-cast-luxury-grid">
                                <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement de la distribution...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panneau Titres Similaires -->
                    <div class="sh-tab-panel ${this._activeTab === 'similaires' ? 'active' : ''}" id="sh-panel-similaires">
                        <div class="sh-bento-luxury-grid" id="sh-bento-luxury-grid">
                            <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des recommandations...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._bindSheetEvents(item);
    }

    async _loadFullDetails(item, generation = this._detailsGeneration) {
        const isCurrent = () => this._isOpen && this._detailsGeneration === generation && this._currentItem === item;
        const itemId = item.Id || item.id;
        if (!itemId) return;

        const rawType = (item.Type || item.type || item.MediaType || '').toLowerCase();
        const isMovie = rawType === 'movie' || item.isMovie;
        const isEpisode = rawType === 'episode';
        const isCollection = rawType === 'boxset' || rawType === 'collection' || rawType === 'saga' || item.isCollection;
        const isMusic = rawType === 'musicalbum' || rawType === 'music' || rawType === 'album' || rawType === 'audio' || item.isMusic;
        const isSeries = !isMovie && !isCollection && !isMusic && (rawType === 'series' || rawType === 'tvshow' || rawType === 'season' || item.isSeries || (item.SeasonCount && item.SeasonCount > 0));

        const api = svc.jellyfinApi();
        const jsApi = svc.integration('jellyseerr')?.api || (svc.api()?.getClient ? svc.api().getClient('jellyseerr') : null);

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
            const externalId = [item.tmdbId, item.TmdbId, item.mediaId, item.id]
                .find(value => /^\d+$/.test(String(value || '')));
            let tmdbId = externalId || localJellyfinItem?.ProviderIds?.Tmdb || (typeof itemId === 'string' && itemId.startsWith('jellyseerr-') ? itemId.replace('jellyseerr-', '') : null);
            if (tmdbId && !item.tmdbId) item.tmdbId = tmdbId;
            if (!tmdbId && jsApi?.search && searchTitle) {
                try {
                    const jsRes = await jsApi.search(searchTitle);
                    const normalizedTitle = searchTitle.toLowerCase().trim();
                    const found = (jsRes?.results || []).find(r => (r.title || r.name || '').toLowerCase().trim() === normalizedTitle);
                    if (found) tmdbId = found.id;
                } catch (e) {}
            }

            if (!isCurrent()) return;

            // Si le média est présent sur le serveur, enrichir l'élément existant.
            // Le bouton de lecture est déjà lié par _bindSheetEvents : ne pas lui ajouter
            // un second handler qui pourrait lancer deux lectures.
            if (localJellyfinItem) {
                Object.assign(item, localJellyfinItem);
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
                        } catch (e) {
                            localSeasons = [];
                        }
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

                if (!isCurrent()) return;

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
                            tmdbCount: ls.ChildCount || seasonLocalEps.length,
                            localCount: seasonLocalEps.length,
                            status: seasonLocalEps.length > 0 ? 'green' : 'orange',
                            badgeText: seasonLocalEps.length > 0 ? '✓ Sur le serveur' : 'Aucun épisode chargé',
                            badgeBg: 'rgba(16, 185, 129, 0.2)',
                            badgeColor: '#34d399'
                        };
                    });
                } else {
                    displaySeasons = [];
                }

                // Rendu des pastilles de saisons
                if (seasonRow && displaySeasons.length > 0) {
                    seasonRow.style.display = 'flex';
                    seasonRow.innerHTML = displaySeasons.map((s, idx) => `
                        <button class="sh-season-pill-btn ${idx === 0 ? 'active' : ''}" tabindex="0" data-season-num="${s.seasonNumber}">
                            <span class="sh-season-pill-title">${this._escape(s.name)}</span>
                            <span style="font-size:10px; margin-left:8px; padding:2px 7px; border-radius:6px; font-weight:750; background:${s.badgeBg}; color:${s.badgeColor};">
                                ${s.badgeText}
                            </span>
                        </button>
                    `).join('');

                    // Fonction de chargement des épisodes hybrides pour la saison
                    let seasonRenderId = 0;
                    const loadEpisodesForSeason = async (seasonObj) => {
                        const currentSeasonRenderId = ++seasonRenderId;
                        if (!episodesGrid) return;
                        episodesGrid.innerHTML = '<div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.5); padding:24px; text-align:center;"><span class="sh-spinner-inline" style="margin-right:8px;"></span>Chargement des épisodes de la ' + seasonObj.name + '...</div>';

                        let localEps = seasonObj.localEps || [];
                        let tmdbEps = [];
                        if (jsApi?.getSeasonDetails && tmdbId) {
                            try {
                                const sData = await jsApi.getSeasonDetails(tmdbId, seasonObj.seasonNumber);
                                if (Array.isArray(sData?.episodes)) tmdbEps = sData.episodes;
                            } catch (e) {}
                        }

                        // Si saison 100% locale
                        if (!isCurrent() || seasonRenderId !== currentSeasonRenderId) return;

                        if (seasonObj.status === 'green' && localEps.length > 0) {
                            episodesGrid.innerHTML = localEps.map((ep, idx) => {
                                const epImg = this._escapeUrl(api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 500, maxHeight: 280 }) || api?.getImageUrl?.(ep.Id, 'Thumb', { maxWidth: 500, maxHeight: 280 }) || '');
                                const progress = Math.round(ep.UserData?.PlayedPercentage || 0);
                                const dur = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10000000 / 60) + ' min' : '';
                                return `
                                    <div class="sh-episode-card" tabindex="0" role="button" data-ep-id="${ep.Id}">
                                        <div class="sh-episode-thumb-wrap" data-action="play">
                                            ${epImg ? `<img decoding="async" src="${epImg}" alt="${this._escape(ep.Name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.IndexNumber || (idx + 1)}</div>`}
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
                                            svc.player()?.play?.(ep);
                                        } else {
                                            this.open(ep);
                                        }
                                    });
                                }
                            });
                            return;
                        }

                                if (!isCurrent() || seasonRenderId !== currentSeasonRenderId) return;

                        // Sinon : Rendu hybride sans bandeau encombrant, avec boutons de demande animés directs
                        const totalEpsCount = Math.max(tmdbEps.length, localEps.length, seasonObj.tmdbCount || 0);
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
                                stillUrl: localEp ? this._escapeUrl(api?.getImageUrl?.(localEp.Id, 'Primary', { maxWidth: 500 }) || '') : (tmdbEp?.stillPath ? `https://image.tmdb.org/t/p/w400${tmdbEp.stillPath}` : ''),
                                duration: localEp?.RunTimeTicks ? Math.round(localEp.RunTimeTicks / 10000000 / 60) + ' min' : ''
                            });
                        }

                        episodesGrid.innerHTML = hybridList.map(ep => {
                            return `
                                <div class="sh-episode-card ${ep.isLocal ? '' : 'sh-episode-card--missing'}" tabindex="0" role="button" style="${ep.isLocal ? '' : 'opacity:0.88;'}">
                                    <div class="sh-episode-thumb-wrap" data-action="${ep.isLocal ? 'play' : 'request'}" data-ep-num="${ep.episodeNumber}">
                                        ${ep.stillUrl ? `<img decoding="async" src="${this._escape(ep.stillUrl)}" alt="${this._escape(ep.name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.episodeNumber}</div>`}
                                        <div class="sh-episode-overlay-play">${ep.isLocal ? '▶' : '📥'}</div>
                                        <span class="sh-episode-badge-num">EP ${ep.episodeNumber}</span>
                                        ${ep.duration ? `<span class="sh-episode-dur">${ep.duration}</span>` : ''}
                                    </div>
                                    <div class="sh-episode-info">
                                        <div class="sh-episode-title-row">
                                            <span class="sh-episode-title">${ep.episodeNumber}. ${this._escape(ep.name)}</span>
                                            ${ep.isLocal ? `
                                                <span style="font-size:10.5px; font-weight:750; color:#34d399; background:rgba(16,185,129,0.31); padding:2px 8px; border-radius:6px; margin-left:auto; flex-shrink:0;">Disponible</span>
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
                                    if (!jsApi?.createRequest || !Number.isFinite(Number(tmdbId))) {
                                        throw new Error('Demande indisponible : identifiant TMDB ou serveur Jellyseerr absent.');
                                    }
                                    await jsApi.createRequest({
                                        mediaType: 'tv',
                                        mediaId: Number(tmdbId),
                                        seasons: [sNum]
                                    });
                                                    btn.classList.add('sh-request-complete');
                                    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demandé</span>';
                                    svc.toaster()?.success(`Demande envoyée pour la Saison ${sNum} • Épisode ${epNum} !`);
                                } catch (err) {
                                    btn.disabled = false;
                                    btn.innerHTML = '<span>Réessayer</span>';
                                    svc.toaster()?.error(`Erreur: ${err.message || 'Demande impossible'}`);
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
                                            svc.player()?.play?.(ep);
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
            }                if (!isCurrent()) return;

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
                                        CommunityRating: Number.isFinite(Number(jsItem.voteAverage)) ? Number(jsItem.voteAverage) : null,
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
                                        CommunityRating: Number.isFinite(Number(t.voteAverage)) ? Number(t.voteAverage) : null,
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
                        const simRating = Number.isFinite(Number(sim.CommunityRating)) ? Number(sim.CommunityRating).toFixed(1) : null;
                        return `
                            <div class="sh-bento-card" data-item-id="${sim.Id || sim.id}">
                                <div class="sh-bento-poster-wrap" data-action="details">
                                    ${simImg ? `<img decoding="async" src="${this._escape(simImg)}" alt="${this._escape(sim.Name || sim.title)}" />` : '<div class="sh-bento-poster-fallback">🎬</div>'}
                                    <div class="sh-bento-quick-play">${sim.isLocal ? '▶' : '📥'}</div>
                                    <span style="position:absolute; top:8px; left:8px; font-size:10px; font-weight:750; padding:2px 6px; border-radius:6px; background:${sim.isLocal ? 'rgba(16,185,129,0.85)' : 'rgba(99,102,241,0.85)'}; color:var(--sh-ink-solid, #ffffff);">
                                        ${sim.isLocal ? '✓ Serveur' : '📥 Jellyseerr'}
                                    </span>
                                </div>
                                <div class="sh-bento-content" data-action="details">
                                    <div class="sh-bento-header-row">
                                        <span class="sh-bento-title">${this._escape(sim.Name || sim.title)}</span>
                                    </div>
                                    <div class="sh-bento-meta-row">
                                        ${simRating !== null ? `<span class="sh-bento-score">★ ${this._escape(simRating)}/10</span>` : '<span class="sh-bento-score">Note indisponible</span>'}
                                        <span class="sh-bento-dot">•</span>
                                        <span>${this._escape(sim.ProductionYear || '')}</span>
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
                                ${actorImg ? `<img decoding="async" src="${this._escape(actorImg)}" alt="${this._escape(actor.Name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
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
        const api = svc.jellyfinApi();
        const apiClient = svc.api()?.getClient('jellyfin');
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
        // Une réponse vide signifie qu'aucun épisode n'est exposé par Jellyfin.
        // Ne jamais fabriquer d'épisodes : ils doivent rester pilotables par le serveur.
        if (!episodes || episodes.length === 0) {
            const episodesGrid = this._sheet.querySelector('.sh-episodes-cards-grid');
            if (episodesGrid) episodesGrid.innerHTML = '<div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.5); padding:20px;">Aucun épisode disponible sur le serveur.</div>';
            return;
        }
        const episodesGrid = this._sheet.querySelector('.sh-episodes-cards-grid');
        if (!episodesGrid) return;

        episodesGrid.innerHTML = episodes.map((ep, idx) => {
            const epImg = this._escapeUrl(api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 500, maxHeight: 280 }) || api?.getImageUrl?.(ep.Id, 'Thumb', { maxWidth: 500, maxHeight: 280 }) || '');
            const progress = Math.round(ep.UserData?.PlayedPercentage || 0);
            const durationMin = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10000000 / 60) + ' min' : '';

            return `
                <div class="sh-episode-card" tabindex="0" role="button" data-ep-id="${ep.Id}">
                    <div class="sh-episode-thumb-wrap" data-action="play" title="▶ Lancer l'Épisode ${ep.IndexNumber || (idx + 1)}">
                        ${epImg ? `<img decoding="async" src="${epImg}" alt="${this._escape(ep.Name)}" />` : `<div class="sh-episode-thumb-fallback">EP ${ep.IndexNumber || (idx + 1)}</div>`}
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
                        svc.player()?.play?.(ep);
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

                svc.toaster()?.info(`Piste audio : ${label}`);
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
                svc.toaster()?.info(`Sous-titres : ${label}`);
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
                    const servarrApi = isSeries ? svc.integration('sonarr')?.api : svc.integration('radarr')?.api;
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
                const profileValue = drawer.querySelector('#sh-drawer-profile-select')?.value || '';
                const profileId = profileValue ? parseInt(profileValue, 10) : null;
                const rootFolder = drawer.querySelector('#sh-drawer-folder-select')?.value;
                const monitorFuture = drawer.querySelector('#sh-drawer-monitor-future')?.checked ?? true;

                if (!Number.isFinite(Number(tmdbId))) {
                    drawerSubmit.disabled = false;
                    drawerSubmit.innerHTML = '<span>Identifiant média indisponible</span>';
                    svc.toaster()?.error?.('Impossible d\'envoyer la demande : identifiant TMDB absent.');
                    return;
                }
                const payload = {
                    mediaType: type,
                    mediaId: Number(tmdbId),
                    ...(Number.isInteger(profileId) && profileId > 0 ? { profileId } : {}),
                    ...(rootFolder ? { rootFolder } : {}),
                    ...(type === 'tv' && monitorFuture ? { seasons: 'all' } : {})
                };

                try {
                    const api = svc.integration('jellyseerr')?.api || (svc.api()?.getClient ? svc.api().getClient('jellyseerr') : null);
                    if (typeof api?.createRequest !== 'function') {
                        throw new Error('Jellyseerr n’est pas configuré ou ne prend pas en charge les demandes.');
                    }
                    await api.createRequest(payload);
                    drawerSubmit.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demande confirmée !</span>';
                    svc.toaster()?.success(`Demande envoyée pour "${item.title || item.Name}" !`);
                    setTimeout(() => { drawer.style.display = 'none'; }, 1500);
                } catch (err) {
                    drawerSubmit.disabled = false;
                    drawerSubmit.innerHTML = '<span>Réessayer</span>';
                    svc.toaster()?.error(`Erreur: ${err.message || 'Impossible d envoyer la demande'}`);
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
            if (svc.player()) {
                svc.player().play(item.rawItem || item, {
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

        this._sheet.querySelector('#sh-slideup-trailer-btn')?.addEventListener('click', (e) => {
            // Bandes-annonces via notre TrailerService : serveur Jellyfin d'abord,
            // puis YouTube dans la fenêtre SpaceHub (plus d'iframe brute).
            if (svc.trailers()) {
                svc.trailers().open(
                    { Id: item.Id || item.id, Name: item.Name || item.title || 'Film', RemoteTrailers: item.RemoteTrailers },
                    e.currentTarget
                );
            } else {
                svc.toaster()?.info?.('Bande-annonce indisponible.');
            }
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

            if (this._audioPopoverOpen) {
                const spatialNav = svc.nav() || svc.nav();
                if (spatialNav) {
                    setTimeout(() => {
                        const activeItem = audioMenu?.querySelector('.sh-popover-item.selected') || audioMenu?.querySelector('.sh-popover-item');
                        if (activeItem) spatialNav.setFocus(activeItem, { reason: 'modal-audio-popover' });
                    }, 50);
                }
            }
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
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    _escapeUrl(value) {
        const url = String(value || '').trim();
        if (!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            return parsed.href.replace(/[\"'\\]/g, character => `\\${character}`);
        } catch {
            return '';
        }
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans ModalSlideUpSheet.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default ModalSlideUpSheet;


