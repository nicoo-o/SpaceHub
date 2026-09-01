/**
 * SpaceHub — HeroSpotlightComponent
 * Version: 2.4.0
 *
 * Afficheur Vedette (Hero Spotlight) Plein Écran 100vw Style Apple TV+ 4K Pure Cinema :
 * - Transition fluide et continue éprouvée avec Ken Burns subtil
 * - Boutons de navigation Précédent / Suivant toujours visibles et accessibles
 * - Lignes de progression épaissies (4px) avec tête lumineuse éclatante et remplissage fluide
 * - Trio de boutons d'action (Regarder blanc pur, Bande-annonce verre fumé, Plus d'infos)
 */

'use strict';

class HeroSpotlightComponent {
    constructor() {
        this._currentIndex = 0;
        this._sliderTimer = null;
        this._isTransitioning = false;
        this._featuredItems = [];
        this._slideRenderId = 0;
        this._injectStyles();
    }

    async render(container) {
        await this._loadHeroItems();
        if (this._featuredItems.length === 0) {
            container.innerHTML = '';
            return;
        }
        this._renderSlide(container, this._currentIndex);
        if (!this._isHoveringCritique) {
            this._startAutoSlide(container);
        } else {
            this._pauseAutoSlide(container);
        }
    }

    async _loadHeroItems() {
        try {
            const api = window.SpaceHub?.jellyfin?.api;
            if (api) {
                let realItems = await api.getFeaturedHeroItems();
                if (!realItems || realItems.length === 0) {
                    realItems = await api.getMovies({ limit: 6 });
                }
                if (!realItems || realItems.length === 0) {
                    realItems = await api.getLatestItems({ limit: 6 });
                }

                if (realItems && realItems.length > 0) {
                    this._featuredItems = realItems.map(item => ({
                        ...item,
                        Id: item.Id || item.id,
                        Name: item.Name || item.title,
                        title: item.Name || item.title,
                        categoryTag: (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode') ? 'SÉRIE TV' : (item.Type === 'BoxSet' ? 'SAGA' : 'FILM'),
                        tagline: item.Taglines?.[0] || ((item.Type === 'Series' || item.Type === 'Season') ? 'Série TV' : 'Film'),
                        Overview: item.Overview || 'Aucun synopsis disponible.',
                        Type: item.Type,
                        ProductionYear: item.ProductionYear || '',
                        OfficialRating: item.OfficialRating || '',
                        CommunityRating: item.CommunityRating !== undefined && item.CommunityRating !== null
                            ? Number(item.CommunityRating)
                            : null,
                        CriticRating: item.CriticRating !== undefined && item.CriticRating !== null
                            ? Number(item.CriticRating)
                            : null,
                        backdropUrl: api.getImageUrl(item.Id, 'Backdrop', { maxWidth: 1920, maxHeight: 1080, quality: 90 }) || api.getImageUrl(item.Id, 'Primary', { maxWidth: 1920, maxHeight: 1080, quality: 90 }),
                        posterUrl: api.getImageUrl(item.Id, 'Primary', { maxWidth: 600, maxHeight: 900, quality: 90 }),
                        rawItem: item
                    }));
                }
            }
        } catch (err) {
            console.warn('[HeroSpotlightComponent] Erreur lors du chargement des médias du Hero:', err);
        }
    }

    _renderSlide(container, index) {
        this._currentIndex = index;
        const item = this._featuredItems[index] || this._featuredItems[0];
        if (!item) return;
        const renderId = ++this._slideRenderId;
        const backdropUrl = item.backdropUrl || '';
        const safeBackdropUrl = this._escapeUrl(backdropUrl);

        const buildKineticTitle = (name) => {
            let globalCharIndex = 0;
            const words = (name || '').split(' ');
            return words.map(word => {
                const charsHtml = Array.from(word).map(ch => {
                    const delay = globalCharIndex * 24;
                    globalCharIndex++;
                    const safeChar = ch === '<' ? '&lt;' : (ch === '>' ? '&gt;' : (ch === '&' ? '&amp;' : (ch === '"' ? '&quot;' : ch)));
                    return `<span class="sh-kt-char" style="animation-delay:${delay}ms">${safeChar}</span>`;
                }).join('');
                globalCharIndex++;
                return `<span class="sh-kt-word">${charsHtml}</span>`;
            }).join(' ');
        };

        const existingHero = container.querySelector('.sh-hero-container');

        if (existingHero) {
            const heroBg = existingHero.querySelector('.sh-hero-bg');
            const heroInfo = existingHero.querySelector('.sh-hero-info');
            const tagEl = existingHero.querySelector('.sh-hero-series-tag');
            const titleEl = existingHero.querySelector('.sh-hero-title');
            const metaEl = existingHero.querySelector('.sh-hero-meta');
            const overviewEl = existingHero.querySelector('.sh-hero-overview');
            const playBtnSpan = existingHero.querySelector('#sh-hero-btn-play span');

            if (heroInfo) {
                heroInfo.style.transition = 'opacity 200ms ease, transform 200ms ease';
                heroInfo.style.opacity = '0.2';
                heroInfo.style.transform = 'translateY(6px)';
                heroInfo.classList.remove('sh-hero-info--active');
            }

            if (heroBg) {
                heroBg.style.transition = 'opacity 450ms cubic-bezier(0.16, 1, 0.3, 1), transform 450ms cubic-bezier(0.16, 1, 0.3, 1)';
                heroBg.style.opacity = '0.35';
                heroBg.style.transform = 'scale(1.04)';
            }

            setTimeout(() => {
                if (renderId !== this._slideRenderId || !document.contains(existingHero)) return;
                if (heroBg) {
                    heroBg.style.backgroundImage = safeBackdropUrl ? `url("${safeBackdropUrl}")` : '';
                    heroBg.style.opacity = '1';
                    heroBg.style.transform = 'scale(1.02)';
                }

                if (tagEl) {
                    tagEl.textContent = item.tagline || item.categoryTag;
                }
                if (titleEl) titleEl.innerHTML = buildKineticTitle(item.Name);
                if (metaEl) {
                    const rating = Number(item.CommunityRating);
                    const criticRatingValue = Number(item.CriticRating);
                    const hasCriticRating = Number.isFinite(criticRatingValue) && criticRatingValue > 0;
                    const hasCommunityRating = Number.isFinite(rating);

                    metaEl.innerHTML = `
                        ${hasCriticRating ? `<span class="sh-hero-badge sh-hero-badge--critic sh-score-btn sh-score-rt" title="Note presse Jellyfin"><span aria-hidden="true">🍅</span><span>${Math.round(criticRatingValue)}%</span></span>` : ''}
                        ${hasCommunityRating ? `<span class="sh-hero-badge sh-hero-badge--community" title="Note utilisateurs Jellyfin"><span>★ ${rating.toFixed(1)}/10</span></span>` : ''}
                        <span class="sh-hero-meta-item">${this._escape(item.ProductionYear || '')}</span>
                        ${item.MediaSources?.some(source => (source.MediaStreams || source.VideoStreams || []).some(stream => /hevc|h265/i.test(stream.Codec || '') && (stream.Width || 0) >= 3840)) ? '<span class="sh-hero-badge">4K UHD</span>' : ''}
                            ${item.OfficialRating ? `<span class="sh-hero-badge">${this._escape(item.OfficialRating)}</span>` : ''}
                    `;
                    this._attachExternalRatings(metaEl, item);
                }
                if (overviewEl) overviewEl.textContent = item.Overview;
                if (playBtnSpan) playBtnSpan.textContent = 'Regarder';

                if (heroInfo) {
                    heroInfo.style.transition = 'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1), transform 480ms cubic-bezier(0.16, 1, 0.3, 1)';
                    heroInfo.style.opacity = '1';
                    heroInfo.style.transform = 'translateY(0)';
                    heroInfo.classList.add('sh-hero-info--active');
                }

                existingHero.querySelectorAll('.sh-hero-progress-bar').forEach((p, i) => {
                    const fill = p.querySelector('.sh-hero-progress-fill');
                    p.classList.toggle('active', i === index);
                    if (fill) {
                        fill.style.animation = 'none';
                        void fill.offsetWidth; 
                        if (i === index) {
                            fill.style.animation = 'sh-hero-progress-run 8s linear forwards';
                        }
                    }
                });

                // Ré-attacher les écouteurs de critique sur les nouveaux badges du slide actif
                this._bindCriticEvents(existingHero, item);
            }, 180);
            return;
        }

        const kineticTitle = buildKineticTitle(item.Name);
        container.innerHTML = `
            <div class="sh-hero-container">
                <div class="sh-hero-bg"${safeBackdropUrl ? ` style="background-image: url('${safeBackdropUrl}');"` : ''}></div>
                <div class="sh-hero-gradient-overlay"></div>
                <div class="sh-hero-content">
                    <div class="sh-hero-info sh-hero-info--active">
                        <div class="sh-hero-series-tag">${this._escape(item.tagline || item.categoryTag)}</div>
                        <h1 class="sh-hero-title sh-hero-title--kinetic">${kineticTitle}</h1>
                        <div class="sh-hero-meta">
                            ${Number.isFinite(Number(item.CriticRating)) && Number(item.CriticRating) > 0 ? `<span class="sh-hero-badge sh-hero-badge--critic sh-score-btn sh-score-rt" title="Note presse Jellyfin"><span aria-hidden="true">🍅</span><span>${Math.round(Number(item.CriticRating))}%</span></span>` : ''}
                            ${Number.isFinite(Number(item.CommunityRating)) ? `<span class="sh-hero-badge sh-hero-badge--community" title="Note utilisateurs Jellyfin"><span>★ ${this._escape(Number(item.CommunityRating).toFixed(1))}/10</span></span>` : ''}
                                <!--<svg class="sh-rt-svg" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 8 3.5 8 3.5C8 3.5 9 5 11 5.5C8 6 4 9 4 14C4 18.5 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 6 13 5.5C15 5 16 3.5 16 3.5C16 3.5 14.5 2 12 2Z" fill="#FA320A"/><path d="M12 2C10.5 2 9 3 9 3.5C10 4 11 4.5 12 4.5C13 4.5 14 4 15 3.5C15 3 13.5 2 12 2Z" fill="#00C05B"/></svg>-->

                            <span class="sh-hero-meta-item">${this._escape(item.ProductionYear || '')}</span>
                            ${item.MediaSources?.some(source => (source.MediaStreams || source.VideoStreams || []).some(stream => /hevc|h265/i.test(stream.Codec || '') && (stream.Width || 0) >= 3840)) ? '<span class="sh-hero-badge">4K UHD</span>' : ''}
                            ${item.OfficialRating ? `<span class="sh-hero-badge">${this._escape(item.OfficialRating)}</span>` : ''}
                        </div>
                        <p class="sh-hero-overview">${this._escape(item.Overview)}</p>
                        <div class="sh-hero-actions">
                            <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-play" id="sh-hero-btn-play">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <span>Regarder</span>
                            </button>
                            <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-glass" id="sh-hero-btn-trailer">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                                <span>Bande-annonce</span>
                            </button>
                            <button tabindex="0" data-nav-focusable="true" class="sh-hero-btn-glass" id="sh-hero-btn-details">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                <span>Plus d'infos</span>
                            </button>
                        </div>
                    </div>
                </div>
                <button tabindex="0" data-nav-focusable="true" class="sh-hero-edge-btn sh-hero-edge-btn--prev" id="sh-hero-edge-prev" title="Affiche précédente" aria-label="Affiche précédente">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button tabindex="0" data-nav-focusable="true" class="sh-hero-edge-btn sh-hero-edge-btn--next" id="sh-hero-edge-next" title="Affiche suivante" aria-label="Affiche suivante">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
                <div class="sh-hero-progress-track">
                    ${this._featuredItems.map((it, i) => `
                        <button class="sh-hero-progress-bar ${i === index ? 'active' : ''}" data-index="${i}" title="${this._escape(it.Name)}" aria-label="${this._escape(it.Name)}">
                            <div class="sh-hero-progress-fill" style="${i === index ? 'animation: sh-hero-progress-run 8s linear forwards;' : ''}"></div>
                        </button>
                    `).join('')}
                </div>
                <!-- Indicateur de Défilement Découvrir (Scroll Hint) -->
                <div class="sh-hero-scroll-hint" id="sh-hero-scroll-hint" role="button" tabindex="0" title="Découvrir le catalogue">
                    <span class="sh-scroll-hint-label">Découvrir</span>
                    <svg class="sh-scroll-hint-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
        `;
        this._bindEvents(container, item);
        const metaEl = container.querySelector('.sh-hero-meta');
        if (metaEl) this._attachExternalRatings(metaEl, item);
    }

    _attachExternalRatings(metaEl, item) {
        const ratingCache = window.SpaceHub?.core?.ratingCache;
        if (!ratingCache || !metaEl) return;
        metaEl._heroItem = item;

        // Rafraîchissement des badges déjà affichés après enregistrement d'une clé OMDb
        if (!this._ratingsRefreshBound) {
            this._ratingsRefreshBound = true;
            document.addEventListener('spacehub:ratings-updated', () => {
                document.querySelectorAll('.sh-hero-meta').forEach(m => {
                    if (!m._heroItem) return;
                    m.querySelectorAll('.sh-hero-badge--rt, .sh-hero-badge--imdb, .sh-hero-badge--mc').forEach(b => b.remove());
                    this._attachExternalRatings(m, m._heroItem);
                });
            });
        }

        ratingCache.get(item).then(ratings => {
            if (!document.contains(metaEl)) return;
            // Fusion des données réelles : Jellyfin 🍅 (base) + OMDb (IMDb/MC/RT)
            const base = metaEl._criticData || {};
            if (ratings.rt != null || ratings.imdb != null) {
                metaEl._criticData = {
                    rtScore: ratings.rt ?? base.rtScore ?? null,
                    imdb: ratings.imdb ?? null,
                    imdbVotes: ratings.imdbVotes ?? null,
                    metacritic: ratings.metacritic ?? null,
                    sourceLabel: ratings.rt != null ? 'OMDb' : (base.sourceLabel || null),
                    isSeriesFallback: ratings.isSeriesFallback ?? base.isSeriesFallback ?? false
                };
            }
            // Hiérarchie : avec un score IMDb OMDb, le ★ Jellyfin fait doublon → retiré
            const communityBadge = metaEl.querySelector('.sh-hero-badge--community');
            if (communityBadge && ratings.imdb != null) communityBadge.remove();
            const yearEl = metaEl.querySelector('.sh-hero-meta-item');
            let html = '';
            // Mise à jour du badge 🍅 existant (base Jellyfin) avec la valeur OMDb — pas de doublon
            const existingRt = metaEl.querySelector('.sh-score-rt');
            if (ratings.rt != null) {
                if (existingRt) {
                    const valEl = existingRt.querySelector('span:last-of-type');
                    if (valEl) valEl.textContent = `${ratings.rt}%`;
                    existingRt.title = 'Rotten Tomatoes (OMDb)';
                } else {
                    html += `<span class="sh-hero-badge sh-hero-badge--rt sh-score-btn sh-score-rt" title="Rotten Tomatoes (OMDb)"><span aria-hidden="true">🍅</span><span>${ratings.rt}%</span></span>`;
                }
            }
            const existingImdb = metaEl.querySelector('.sh-score-imdb');
            if (ratings.imdb != null) {
                const imdbTitle = ratings.isSeriesFallback ? 'Note de la série — IMDb (OMDb)' : 'IMDb (OMDb)';
                if (existingImdb) {
                    const valEl = existingImdb.querySelector('span:last-of-type');
                    if (valEl) valEl.textContent = `IMDb ${ratings.imdb.toFixed(1)}`;
                    existingImdb.title = imdbTitle;
                } else {
                    html += `<span class="sh-hero-badge sh-hero-badge--imdb sh-score-btn sh-score-imdb" title="${imdbTitle}"><span>IMDb ${ratings.imdb.toFixed(1)}</span></span>`;
                }
            }
            if (ratings.metacritic != null) {
                html += `<span class="sh-hero-badge sh-hero-badge--mc" title="Metacritic (OMDb)"><span>MC ${ratings.metacritic}</span></span>`;
            }
            if (html && yearEl) {
                yearEl.insertAdjacentHTML('afterend', html);
            }
        }).catch(() => {});
    }

    async _fetchFeaturedItem() {
        try {
            const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
            const currentUser = await window.ApiClient?.getCurrentUser?.();
            const userId = currentUser?.Id || window.ApiClient?.getCurrentUserId?.();

            if (apiClient && userId) {
                const continueRes = await apiClient.getContinueWatching(userId, 1);
                if (continueRes?.Items?.length > 0) {
                    const it = continueRes.Items[0];
                    this._featuredItems[0] = {
                        Id: it.Id,
                        Name: it.Name,
                        SeriesName: it.SeriesName || 'Reprendre la lecture',
                        Overview: it.Overview || '',
                        Type: it.Type,
                        ProductionYear: it.ProductionYear,
                        OfficialRating: it.OfficialRating || '',
                        CommunityRating: it.CommunityRating !== undefined && it.CommunityRating !== null
                            ? Number(it.CommunityRating).toFixed(1)
                            : null,
                        backdropUrl: apiClient.getImageUrl(it.BackdropImageTags?.length ? it.Id : (it.SeriesId || it.Id), 'Backdrop', { maxWidth: 1920, quality: 90 }),
                        posterUrl: apiClient.getImageUrl(it.Id, 'Primary', { maxWidth: 500, quality: 85 })
                    };
                }
            }
        } catch (e) {
            console.warn('[HeroSpotlight] Impossible de récupérer le média Jellyfin:', e);
        }
    }

    destroy() {
        this._pauseAutoSlide();
        if (this._scrollHandler) {
            window.removeEventListener('scroll', this._scrollHandler);
            this._scrollHandler = null;
        }
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        this._slideRenderId++;
        this._featuredItems = [];
    }

    _startAutoSlide(container) {
        if (this._sliderTimer) clearInterval(this._sliderTimer);
        this._sliderTimer = setInterval(() => {
            this._goToSlide(container, this._currentIndex + 1);
        }, 8000);
    }

    _goToSlide(container, targetIndex) {
        if (this._isTransitioning) return;
        this._isTransitioning = true;
        // Fermeture immédiate et forcée de tout popover de critique ouvert
        const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
        if (cardBuilder) {
            cardBuilder.hideAllPopovers?.();
            cardBuilder._hideRTPopover?.(true);
            cardBuilder._hideIMDbPopover?.(true);
        }
        this._currentIndex = (targetIndex + this._featuredItems.length) % this._featuredItems.length;
        this._renderSlide(container, this._currentIndex);
        this._startAutoSlide(container);
        setTimeout(() => {
            this._isTransitioning = false;
        }, 500);
    }

    _pauseAutoSlide(container) {
        if (this._sliderTimer) {
            clearInterval(this._sliderTimer);
            this._sliderTimer = null;
        }
        const activeFill = container?.querySelector('.sh-hero-progress-bar.active .sh-hero-progress-fill');
        if (activeFill) {
            activeFill.style.animationPlayState = 'paused';
        }
    }

    _resumeAutoSlide(container) {
        const activeFill = container?.querySelector('.sh-hero-progress-bar.active .sh-hero-progress-fill');
        if (activeFill) {
            activeFill.style.animationPlayState = 'running';
        }
        this._startAutoSlide(container);
    }

    _bindCriticEvents(container, item) {
        const metaEl = container?.querySelector('.sh-hero-meta');
        if (metaEl && item) {
            // Base réelle depuis Jellyfin (CriticRating) ; OMDb complète via _attachExternalRatings.
            const criticRating = Number(item.CriticRating);
            metaEl._criticData = Number.isFinite(criticRating) && criticRating > 0
                ? { rtScore: Math.round(criticRating), imdb: null, imdbVotes: null, metacritic: null, sourceLabel: 'Jellyfin' }
                : null;
        }

        // ⏸️ Mise en pause intelligente & garantie du défilement lorsque l'utilisateur s'intéresse aux critiques
        const onCriticEnter = () => {
            this._isHoveringCritique = true;
            this._pauseAutoSlide(container);
        };
        const onCriticLeave = () => {
            this._isHoveringCritique = false;
            setTimeout(() => {
                const isHoveringPop = Boolean(document.querySelector('.sh-global-popover:hover, .sh-global-rt-popover:hover, .sh-global-imdb-popover:hover'));
                const isHoveringBadge = Boolean(container?.querySelector('.sh-hero-badge--critic:hover, .sh-hero-badge--community:hover, .sh-score-rt:hover, .sh-score-imdb:hover'));
                if (!isHoveringPop && !isHoveringBadge && !this._isHoveringCritique) {
                    this._resumeAutoSlide(container);
                }
            }, 160);
        };

        container?.querySelectorAll('.sh-hero-badge--critic, .sh-hero-badge--community').forEach(badge => {
            badge.onmouseenter = onCriticEnter;
            badge.onmouseleave = onCriticLeave;
        });

        // ⏸️ Mode TV / télécommande : pause du défilement automatique pendant que le
        // focus reste sur le Hero (le popover 🍅/IMDb reste alors visible sur le slide courant).
        if (!container._tvFocusPauseBound) {
            container._tvFocusPauseBound = true;
            container.addEventListener('focusin', () => {
                this._pauseAutoSlide(container);
            });
            container.addEventListener('focusout', (e) => {
                if (!container.contains(e.relatedTarget)) {
                    this._resumeAutoSlide(container);
                }
            });
        }

        // Liaison avec les popovers globaux s'ils existent
        const globalRTPop = document.getElementById('sh-global-rt-popover');
        const globalIMDbPop = document.getElementById('sh-global-imdb-popover');
        if (globalRTPop) {
            globalRTPop.onmouseenter = onCriticEnter;
            globalRTPop.onmouseleave = onCriticLeave;
        }
        if (globalIMDbPop) {
            globalIMDbPop.onmouseenter = onCriticEnter;
            globalIMDbPop.onmouseleave = onCriticLeave;
        }
    }

    _bindEvents(container, item) {
        this._bindCriticEvents(container, item);
        const heroContainer = container.querySelector('.sh-hero-container');
        const heroBg = container.querySelector('.sh-hero-bg');
        const heroContent = container.querySelector('.sh-hero-content');
        const prevBtn = container.querySelector('#sh-hero-edge-prev');
        const nextBtn = container.querySelector('#sh-hero-edge-next');
        const scrollHint = container.querySelector('#sh-hero-scroll-hint');

        if (heroContainer && heroBg) {
            heroContainer.addEventListener('mousemove', (e) => {
                const rect = heroContainer.getBoundingClientRect();
                const xPercent = (e.clientX - rect.left) / rect.width - 0.5;
                const yPercent = (e.clientY - rect.top) / rect.height - 0.5;
                heroBg.style.transform = `scale(1.03) translate(${(-xPercent * 16).toFixed(1)}px, ${(-yPercent * 10).toFixed(1)}px)`;

                // Révélation dynamique par proximité : uniquement si la souris est tout près du bouton
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const containerWidth = rect.width;
                const centerY = rect.height / 2;

                const isNearLeft = mouseX < 140 && Math.abs(mouseY - centerY) < 220;
                const isNearRight = (containerWidth - mouseX) < 140 && Math.abs(mouseY - centerY) < 220;

                if (prevBtn) prevBtn.classList.toggle('sh-hero-edge-btn--visible', isNearLeft);
                if (nextBtn) nextBtn.classList.toggle('sh-hero-edge-btn--visible', isNearRight);
            });

            heroContainer.addEventListener('mouseleave', () => {
                heroBg.style.transform = 'scale(1.02) translate(0, 0)';
                if (prevBtn) prevBtn.classList.remove('sh-hero-edge-btn--visible');
                if (nextBtn) nextBtn.classList.remove('sh-hero-edge-btn--visible');
            });
        }



        // Clic sur l'indicateur de scroll "Découvrir"
        if (scrollHint) {
            scrollHint.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const target = document.querySelector('.sh-dashboard-body') || document.querySelector('.sh-genre-chips-container') || document.querySelector('.sh-dashboard__grid');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
                }
            });
        }


        // ── Effet Parallaxe & Immersion au Scroll ──
        if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
        {
            let isTicking = false;
            this._scrollHandler = () => {
                if (!isTicking) {
                    requestAnimationFrame(() => {
                        const scrollY = window.scrollY;
                        const heroH = window.innerHeight;

                        if (scrollY <= heroH * 1.2) {
                            const progress = Math.min(1, scrollY / heroH);

                            if (heroBg) {
                                heroBg.style.transform = `scale(${1.02 - progress * 0.04}) translateY(${(scrollY * 0.32).toFixed(1)}px)`;
                            }

                            if (heroContent) {
                                const opacity = Math.max(0, 1 - progress * 1.5);
                                heroContent.style.opacity = opacity.toFixed(2);
                                heroContent.style.transform = `translateY(${(scrollY * 0.22).toFixed(1)}px)`;
                            }

                            if (scrollHint) {
                                const hintOpacity = Math.max(0, 1 - progress * 3.5);
                                scrollHint.style.opacity = hintOpacity.toFixed(2);
                                scrollHint.style.pointerEvents = scrollY > 60 ? 'none' : 'auto';
                            }
                        }
                        isTicking = false;
                    });
                    isTicking = true;
                }
            };
            window.addEventListener('scroll', this._scrollHandler, { passive: true });
        }

        // ── Raccourcis Clavier Hero (Power-User - Sans conflit TV Spatial Navigation) ──
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        {
            this._keyHandler = (e) => {
                const activeTag = document.activeElement?.tagName?.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea' || document.querySelector('.sh-modal--open, .sh-slideup-sheet--open, .sh-trailer-lightbox.sh-lightbox--open')) {
                    return;
                }

                // Touche 'P' pour afficher les détails du Hero sans intercepter les flèches directionnelles
                if (e.key === 'p' || e.key === 'P') {
                    e.preventDefault();
                    const currentItem = this._featuredItems[this._currentIndex];
                    if (currentItem) {
                        if (window.Emby?.Page?.showItem) {
                            window.Emby.Page.showItem(currentItem.Id || currentItem.id);
                        } else {
                            window.location.hash = `#/details?id=${currentItem.Id || currentItem.id}`;
                        }
                    }
                }
            };
            window.addEventListener('keydown', this._keyHandler);
        }

        container.querySelector('#sh-hero-edge-prev')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._goToSlide(container, this._currentIndex - 1);
        });

        container.querySelector('#sh-hero-edge-next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._goToSlide(container, this._currentIndex + 1);
        });

        container.querySelectorAll('.sh-hero-progress-bar').forEach(bar => {
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.dataset.index, 10);
                if (!isNaN(idx)) {
                    this._goToSlide(container, idx);
                }
            });
        });

        const getCurrentItem = () => {
            return this._featuredItems[this._currentIndex] || this._featuredItems[0];
        };

        container.querySelector('#sh-hero-btn-play')?.addEventListener('click', () => {
            const current = getCurrentItem();
            if (!current) return;
            if (window.SpaceHub?.player?.play) {
                window.SpaceHub.player.play(current.rawItem || current);
            } else if (window.Emby?.Page?.showItem) {
                window.Emby.Page.showItem(current.Id || current.id);
            }
        });

        container.querySelector('#sh-hero-btn-trailer')?.addEventListener('click', (e) => {
            const current = getCurrentItem();
            if (!current) return;
            const mediaItem = current.rawItem || current;
            // Bandes-annonces via notre TrailerService : serveur Jellyfin d'abord,
            // puis YouTube dans la fenêtre SpaceHub (plus d'iframe brute).
            if (window.SpaceHub?.trailers) {
                window.SpaceHub.trailers.open(
                    { Id: mediaItem.Id || mediaItem.id, Name: mediaItem.Name || mediaItem.title || 'Film', RemoteTrailers: mediaItem.RemoteTrailers },
                    e.currentTarget
                );
            } else {
                window.SpaceHub?.ui?.components?.toaster?.info?.('Bande-annonce indisponible.');
            }
        });

        container.querySelector('#sh-hero-btn-details')?.addEventListener('click', () => {
            const current = getCurrentItem();
            if (!current) return;
            if (window.SpaceHub?.ui?.modalSlideUpSheet) {
                window.SpaceHub.ui.modalSlideUpSheet.open(current.rawItem || current);
            } else if (current.Id || current.id) {
                window.location.hash = `#/details?id=${current.Id || current.id}`;
            }
        });
    }

    _escapeUrl(value) {
        const url = String(value || '').trim();
        if (!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            return parsed.href.replace(/(["'\\])/g, '\\$1');
        } catch {
            return '';
        }
    }

    _escape(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    _injectStyles() {
        if (document.getElementById('sh-hero-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-hero-styles';
        style.textContent = `
.sh-hero-container { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #000000; }
.sh-hero-bg { position: absolute; top: -2%; left: -2%; right: -2%; bottom: -2%; background-size: cover; background-position: center 20%; animation: sh-ken-burns 36s ease-in-out infinite alternate; transition: background-image 500ms ease, opacity 500ms ease, transform 500ms ease; will-change: transform, opacity; pointer-events: none !important; }
@keyframes sh-ken-burns { 0% { transform: scale(1.02) translate(0, 0); } 50% { transform: scale(1.04) translate(-8px, -4px); } 100% { transform: scale(1.02) translate(0, 0); } }
.sh-hero-gradient-overlay {
        position: absolute;
        inset: 0;
        background: 
            linear-gradient(to right, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.7) 35%, transparent 65%),
            linear-gradient(to top, #000000 0%, #000000 12%, rgba(0,0,0,0.85) 30%, transparent 75%);
        z-index: 6; pointer-events: none !important; }
.sh-hero-content { position: relative; z-index: 10; height: 100%; max-width: 1600px; margin: 0 auto; padding: 0 54px; display: flex; align-items: flex-end; padding-bottom: 84px; pointer-events: none !important; }
.sh-hero-info { max-width: 700px; pointer-events: auto !important; }




.sh-hero-series-tag { display: inline-flex; color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; }
.sh-hero-title {
    font-size: clamp(32px, 4.4vw, 54px);
    font-weight: 900;
    color: #ffffff;
    margin: 0 0 16px 0;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.8px;
}
.sh-kt-word { display: inline-block; white-space: nowrap; margin-right: 0.2em; }
.sh-kt-char { display: inline-block; animation: sh-kt-in 400ms cubic-bezier(0.3, 1.3, 0.6, 1) forwards; opacity: 0; transform: translateY(20px); }
@keyframes sh-kt-in { to { opacity: 1; transform: translateY(0); } }
.sh-hero-meta { display: flex; gap: 12px; color: #fff; margin-bottom: 20px; }
.sh-hero-badge {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.sh-hero-badge--rt, .sh-hero-badge--imdb, .sh-hero-badge--critic {
    position: relative;
    cursor: pointer !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 4px 8px !important;
    border-radius: 4px !important;
    background: rgba(255, 255, 255, 0.15) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    font-weight: 700 !important;
    font-size: 12px !important;
    color: #ffffff !important;
    user-select: none !important;
    transform: translateZ(0);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 200ms ease,
                border-color 200ms ease,
                box-shadow 200ms ease !important;
}

.sh-hero-badge--rt:hover {
    transform: scale(1.18) translateY(-2px) translateZ(0) !important;
    background: rgba(255, 255, 255, 0.22) !important;
    border-color: rgba(250, 50, 10, 0.85) !important;
    box-shadow: 0 0 18px rgba(250, 50, 10, 0.85), 0 4px 12px rgba(0, 0, 0, 0.5) !important;
    z-index: 50 !important;
}
.sh-hero-badge--rt .sh-rt-svg {
    width: 13px;
    height: 13px;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sh-hero-badge--rt:hover .sh-rt-svg {
    transform: scale(1.25) rotate(-12deg);
    filter: drop-shadow(0 0 6px #fa320a) !important;
}

.sh-hero-badge--imdb:hover {
    transform: scale(1.18) translateY(-2px) translateZ(0) !important;
    background: rgba(255, 255, 255, 0.22) !important;
    border-color: rgba(245, 197, 24, 0.85) !important;
    box-shadow: 0 0 18px rgba(245, 197, 24, 0.85), 0 4px 12px rgba(0, 0, 0, 0.5) !important;
    z-index: 50 !important;
}
.sh-hero-badge--imdb .sh-imdb-star-svg {
    width: 13px;
    height: 13px;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sh-hero-badge--imdb:hover .sh-imdb-star-svg {
    transform: scale(1.25) rotate(14deg);
    filter: drop-shadow(0 0 6px #f5c518) !important;
}
.sh-hero-overview { color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 30px; }
.sh-hero-actions { display: flex; gap: 16px; }
.sh-hero-btn-play { display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #000; border: none; padding: 12px 30px; border-radius: 12px; font-size: 15px; font-weight: 800; cursor: pointer; transition: transform 180ms ease; }
.sh-hero-btn-play:hover { transform: scale(1.03); }
.sh-hero-btn-glass { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; backdrop-filter: blur(10px); transition: background 180ms ease, transform 180ms ease; }
.sh-hero-btn-glass:hover { background: rgba(255,255,255,0.18); transform: scale(1.02); }
.sh-hero-edge-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%) scale(0.88);
    z-index: 35 !important;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(12, 12, 18, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    line-height: 0 !important;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 200ms ease,
                border-color 200ms ease,
                color 200ms ease,
                box-shadow 200ms ease;
}
.sh-hero-edge-btn--prev { left: 24px; }
.sh-hero-edge-btn--next { right: 24px; }

/* ── FLÈCHES HERO EN MODE TV FOCUS ── */
.sh-hero-edge-btn.sh-focus-active,
.sh-hero-edge-btn.sh-tv-focused {
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: translateY(-50%) scale(1.15) !important;
    border-color: #ff9f0a !important;
    background: rgba(30, 30, 45, 0.95) !important;
    box-shadow: 0 0 0 2.5px #ff9f0a, 0 0 24px rgba(255, 159, 10, 0.8) !important;
    z-index: 999 !important;
}


.sh-hero-edge-btn.sh-hero-edge-btn--visible {
    opacity: 0.90;
    pointer-events: auto !important;
    transform: translateY(-50%) scale(1);
}

.sh-hero-edge-btn:hover {
    opacity: 1;
    pointer-events: auto !important;
    transform: translateY(-50%) scale(1.08) !important;
    background: rgba(26, 26, 36, 0.85);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8), 0 0 12px rgba(255, 255, 255, 0.08);
}
.sh-hero-edge-btn:active {
    transform: translateY(-50%) scale(0.94) !important;
}
.sh-hero-progress-track {
    position: absolute;
    right: 48px;
    bottom: 36px;
    z-index: 35 !important;
    pointer-events: auto !important;

    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(6, 6, 10, 0.50);
    padding: 8px 14px;
    border-radius: 9999px;
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.75);
    transition: background 250ms ease, border-color 250ms ease;
}

.sh-hero-progress-track:hover {
    background: rgba(10, 10, 16, 0.75);
    border-color: rgba(255, 255, 255, 0.22);
}

.sh-hero-progress-bar {
    position: relative;
    width: 24px;
    height: 4px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.22);
    border: none;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    will-change: width, background, box-shadow, transform;
    transform: translateZ(0);
    transition: width 280ms cubic-bezier(0.25, 1, 0.5, 1),
                background 200ms ease,
                box-shadow 200ms ease,
                transform 200ms ease;
}

/* Zone tampon stable pour le survol sans flickering */
.sh-hero-progress-bar::before {
    content: '';
    position: absolute;
    top: -12px;
    bottom: -12px;
    left: -4px;
    right: -4px;
    z-index: 10;
}

.sh-hero-progress-bar:hover {
    width: 36px;
    background: rgba(255, 255, 255, 0.65);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.85), 0 0 18px rgba(255, 255, 255, 0.40);
}

.sh-hero-progress-bar.active {
    width: 48px;
    background: rgba(255, 255, 255, 0.30);
}

.sh-hero-progress-bar.active:hover {
    width: 54px;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.95), 0 0 22px rgba(255, 255, 255, 0.50);
}

.sh-hero-progress-bar:active {
    transform: scale(0.95) translateZ(0);
}

.sh-hero-progress-fill {
    height: 100%;
    width: 0%;
    border-radius: 9999px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.75) 65%, #ffffff 100%);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.9), 0 0 16px rgba(255, 255, 255, 0.5);
}
@keyframes sh-hero-progress-run { from { width: 0%; } to { width: 100%; } }

/* Lightbox Bande-Annonce Vidéo */
.sh-trailer-lightbox {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0, 0, 0, 0.88);
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
    width: 82vw; max-width: 1040px;
    aspect-ratio: 16/9;
    background: #000000;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12);
    position: relative;
}
.sh-trailer-close {
    position: absolute; top: 14px; right: 14px; z-index: 10;
    width: 38px; height: 38px; border-radius: 50%;
    background: rgba(14, 14, 20, 0.75); border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff; cursor: pointer;
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    padding: 0 !important; line-height: 0 !important;
    transition: all 180ms ease;
}
.sh-trailer-close svg {
    display: block;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
}
.sh-trailer-close:hover { background: rgba(255, 255, 255, 0.25); transform: scale(1.1); }
.sh-trailer-content { width: 100%; height: 100%; }

/* ── Indicateur de Défilement Découvrir (Scroll Hint) ── */
.sh-hero-scroll-hint {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 35 !important;
    pointer-events: auto !important;
    display: inline-flex;

    align-items: center;
    gap: 6px;
    background: rgba(14, 14, 20, 0.60);
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 9999px;
    padding: 6px 14px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
    transition: background 200ms ease, border-color 200ms ease, transform 200ms ease, opacity 250ms ease;
    animation: sh-hint-float 3.5s ease-in-out infinite;
}
.sh-hero-scroll-hint:hover {
    background: rgba(26, 26, 36, 0.85);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
    transform: translateX(-50%) scale(1.06);
}
.sh-scroll-hint-chevron {
    animation: sh-hint-bounce 1.6s ease-in-out infinite;
}
@keyframes sh-hint-float {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(-4px); }
}
@keyframes sh-hint-bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(3px); }
}
        `;
        document.head.appendChild(style);
    }
}

export default HeroSpotlightComponent;
