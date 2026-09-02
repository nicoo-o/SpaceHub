/**
 * SpaceHub — Gabarit : feuille de details (fiche media)
 *
 * 317 lignes, le plus gros gabarit de l'application : affiche, fond, notes,
 * badges de qualite, onglets et actions. Vingt et une valeurs locales le
 * nourrissent — elles deviennent des parametres explicites au lieu d'etre
 * capturees par fermeture.
 *
 * Ce module ne contient que du HTML. Il ne lit rien, n'ecrit rien, n'ecoute
 * rien : il transforme un objet de valeurs en chaine. Le comportement reste
 * entierement dans le composant appelant.
 *
 * Extrait mecaniquement du composant, sans reecriture : le HTML produit est
 * identique octet pour octet a celui d'avant l'extraction, ce que verifie
 * tests/gabarits.test.js contre une empreinte prise avant le deplacement.
 */

'use strict';

/**
 * @param {Object} ctx  valeurs necessaires au gabarit, fournies par l'appelant
 * @returns {string} HTML
 */
export function gabaritFeuille(ctx) {
    const { item, title, year, rating, overview, genres, duration, backBtnLabel, cardBuilder, rtScore, imdbScore, has4K, hasAtmos, hasDolbyVision, isEpisode, isSeries, isMusic, isCollection, isCalendarOrServarr, safeBackdropUrl, safePosterUrl } = ctx;
    return `
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
                            <img decoding="async" src="${safePosterUrl}" alt="${ctx._escape(title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="sh-cinema-poster-fallback" style="display: none; width: 100%; height: 100%; background: rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${ctx._escape(title)}</small>
                            </div>
                        ` : `
                            <div class="sh-cinema-poster-fallback" style="display: flex; width: 100%; height: 100%; background: rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; box-sizing: border-box;">
                                <span style="font-size: 38px;">${isEpisode || isSeries ? '📺' : '🎬'}</span>
                                <small style="font-size: 11px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7); font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${ctx._escape(title)}</small>
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

                        <h1 class="sh-cinema-title">${ctx._escape(title)}</h1>

                        <!-- Ligne Typographique Épurée de Métadonnées avec Badges Critiques Officiels (Navigation Onglet À Propos) -->
                        <div class="sh-cinema-meta-line">
                            ${rating !== null ? `<span class="sh-modal-header-badge sh-modal-header-badge--community" title="Note Jellyfin"><span aria-hidden="true">★</span><span>${rating.toFixed(1)}/10</span></span>` : ''}
                            <span class="sh-score-ext" data-item-id="${ctx._escape(item.Id || item.id || '')}" style="display:contents"></span>
                            ${year ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${ctx._escape(year)}</span>` : ''}
                            ${duration ? `<span class="sh-meta-bullet">•</span><span class="sh-meta-text">${ctx._escape(duration)}</span>` : ''}
                            <span class="sh-meta-bullet">•</span>
                            <span class="sh-meta-text" id="sh-hero-genres">${ctx._escape(genres)}</span>
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
                        <button class="sh-tab-btn ${ctx._activeTab === 'episodes' ? 'active' : ''}" data-tab="episodes"><span>Épisodes & Saisons</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'casting' ? 'active' : ''}" data-tab="casting"><span>Distribution & Équipe</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Séries similaires</span></button>
                    ` : isCollection ? `
                        <button class="sh-tab-btn ${ctx._activeTab === 'sagafilms' ? 'active' : ''}" data-tab="sagafilms"><span>Films de la Saga</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Collections similaires</span></button>
                    ` : isMusic ? `
                        <button class="sh-tab-btn ${ctx._activeTab === 'tracks' ? 'active' : ''}" data-tab="tracks"><span>Pistes de l'Album</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Albums similaires</span></button>
                    ` : `
                        <button class="sh-tab-btn ${ctx._activeTab === 'synopsis' ? 'active' : ''}" data-tab="synopsis"><span>À propos</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'casting' ? 'active' : ''}" data-tab="casting"><span>Distribution & Équipe</span></button>
                        <button class="sh-tab-btn ${ctx._activeTab === 'similaires' ? 'active' : ''}" data-tab="similaires"><span>Titres similaires</span></button>
                    `}
                </div>

                <div class="sh-cinema-panels-wrapper">
                    
                    <!-- 📺 SÉRIES : Panneau Épisodes & Sélecteur de Saisons -->
                    ${isSeries ? `
                        <div class="sh-tab-panel ${ctx._activeTab === 'episodes' ? 'active' : ''}" id="sh-panel-episodes">
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
                        <div class="sh-tab-panel ${ctx._activeTab === 'sagafilms' ? 'active' : ''}" id="sh-panel-sagafilms">
                            <div class="sh-saga-films-grid">
                                <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des films de la saga...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 🎵 MUSIQUE : Panneau Pistes de l'Album -->
                    ${isMusic ? `
                        <div class="sh-tab-panel ${ctx._activeTab === 'tracks' ? 'active' : ''}" id="sh-panel-tracks">
                            <div class="sh-album-tracks-container">
                                <div class="sh-tracks-table">
                                    <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des pistes audio...</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panneau Universel : À propos (Hiérarchie : Synopsis -> Critiques Bento -> Fiche Technique) -->
                    <div class="sh-tab-panel ${ctx._activeTab === 'synopsis' ? 'active' : ''}" id="sh-panel-synopsis">
                        <div class="sh-synopsis-layout">
                            
                            <!-- 1. 📖 LE GRAND SYNOPSIS (En premier) -->
                            <div class="sh-synopsis-text-block">
                                <div class="sh-section-subtitle">Synopsis & Histoire</div>
                                <p class="sh-panel-overview" id="sh-panel-overview">${ctx._escape(overview)}</p>
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
                                    <span class="sh-cell-val" id="sh-meta-genres-val">${ctx._escape(genres)}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Réalisation / Réseau</span>
                                    <span class="sh-cell-val" id="sh-meta-director-val">${ctx._escape(item.network || item.studio || 'Non renseigné par Jellyfin')}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Format & Qualité</span>
                                    <span class="sh-cell-val" id="sh-meta-format-val">${item.hasFile ? 'Disponible dans la médiathèque' : 'Format non renseigné par Jellyfin'}</span>
                                </div>
                                <div class="sh-meta-card">
                                    <span class="sh-cell-label">Classification & Statut</span>
                                    <span class="sh-cell-val" id="sh-meta-rating-val">${item.hasFile ? '✓ Téléchargé & Prêt' : ctx._escape(item.OfficialRating || 'Statut non renseigné par Jellyfin')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Panneau Casting & Équipe -->
                    ${!isMusic ? `
                        <div class="sh-tab-panel ${ctx._activeTab === 'casting' ? 'active' : ''}" id="sh-panel-casting">
                            <div class="sh-cast-luxury-grid" id="sh-cast-luxury-grid">
                                <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement de la distribution...</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panneau Titres Similaires -->
                    <div class="sh-tab-panel ${ctx._activeTab === 'similaires' ? 'active' : ''}" id="sh-panel-similaires">
                        <div class="sh-bento-luxury-grid" id="sh-bento-luxury-grid">
                            <div style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Chargement des recommandations...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
}

export default gabaritFeuille;
