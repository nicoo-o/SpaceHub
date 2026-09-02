/**
 * SpaceHub — Gabarit : lecteur video plein ecran
 *
 * 281 lignes de HTML qui occupaient un cinquieme de VideoPlayer.js. Les sortir
 * rend enfin lisible la logique de lecture, de negociation HLS et de sous-titres
 * qui les entourait.
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
export function gabaritLecteur(ctx) {
    const { isEpisode, seriesName, episodeNumber, episodeTitle } = ctx;
    return `
            <!-- Aura Cinématique Luminescente -->
            <div class="sh-ambient-halo"></div>

            <!-- Vidéo Principale -->
            <video class="sh-cinema-video" playsinline preload="auto"></video>

            <!-- Dégradés de Vignettage Haut et Bas -->
            <div class="sh-vignette-top"></div>
            <div class="sh-vignette-bottom"></div>

            <!-- 🌀 Spinner de Chargement Ambré Minimaliste -->
            <div class="sh-cinema-buffering" id="sh-player-buffering-spinner">
                <div class="sh-buffering-glass">
                    <div class="sh-buffering-dot"></div>
                    <div class="sh-buffering-ring"></div>
                </div>
                <span class="sh-buffering-label">Chargement...</span>
            </div>

            <!-- Zones Gestuelles Gauche / Droite (Double-Tap Ripple) -->
            <div class="sh-gesture-zone sh-gesture-zone--left" id="sh-zone-left">
                <div class="sh-ripple-badge" id="sh-ripple-left">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                    <span>-10s</span>
                </div>
            </div>
            <div class="sh-gesture-zone sh-gesture-zone--right" id="sh-zone-right">
                <div class="sh-ripple-badge" id="sh-ripple-right">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                    <span>+10s</span>
                </div>
            </div>

            <!-- 🍏 TOP BAR : EN-TÊTE CINÉMA TRANSLUCIDE ÉPURÉ (Sans badges techniques) -->
            <header class="sh-cinema-topbar">
                
                <!-- Bloc Gauche : Capsule Titre Tout-en-un -->
                <div class="sh-topbar-brand-capsule">
                    <button class="sh-back-btn" id="sh-btn-back" tabindex="0" data-nav-focusable="true" title="Quitter la lecture (Échap)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span>Quitter</span>
                    </button>

                    <div class="sh-capsule-divider"></div>

                    <div class="sh-media-meta-group">
                        <div class="sh-brand-led" title="SpaceHub Live Hub Active">
                            <div class="sh-brand-led-core"></div>
                        </div>
                        <span class="sh-media-title">${ctx._escape(isEpisode ? seriesName : title)}</span>
                        <span class="sh-media-dot">•</span>
                        <span class="sh-media-sub">${isEpisode ? `${episodeNumber} « ${ctx._escape(episodeTitle)} »` : (year ? `${year} · Film` : 'Cinéma')}</span>
                    </div>
                </div>

                <!-- Bloc Droite : Actions Secondaires Flottantes -->
                <div class="sh-topbar-actions-pill">
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-aspect" title="Format d'image (16:9, 21:9, Plein écran)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                    </button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-pip" title="Fenêtre flottante (PiP)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="12" y="12" rx="1" fill="currentColor"/></svg>
                    </button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-fullscreen" title="Plein écran (F)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                </div>

            </header>

            <!-- 🌟 Centre Flash OSD (Jauge Ambrée) -->
            <div class="sh-cinema-osd" id="sh-player-osd">
                <div class="sh-osd-icon-wrap"><span id="sh-osd-icon">▶</span></div>
                <div class="sh-osd-info">
                    <span class="sh-osd-text" id="sh-osd-text">Lecture</span>
                    <div class="sh-osd-gauge" id="sh-osd-bar-wrap" style="display:none;">
                        <div class="sh-osd-gauge-fill" id="sh-osd-bar-fill"></div>
                    </div>
                </div>
            </div>

            <!-- ⏭️ Smart Skip Intro Pill -->
            <button class="sh-smart-skip-pill" id="sh-smart-skip-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"/></svg>
                <span>Passer l'intro</span>
            </button>

            <!-- 📺 Next Episode Card -->
            <div class="sh-next-ep-card" id="sh-next-ep-card">
                <div class="sh-next-ep-inner">
                    <div class="sh-next-ep-thumb">
                        <img decoding="async" id="sh-next-ep-img" src="" alt="Prochain épisode"/>
                        <div class="sh-next-ep-countdown"><span id="sh-next-ep-sec">5</span></div>
                    </div>
                    <div class="sh-next-ep-meta">
                        <span class="sh-next-ep-kicker">ÉPISODE SUIVANT</span>
                        <h4 class="sh-next-ep-name" id="sh-next-ep-title"></h4>
                    </div>
                    <div class="sh-next-ep-btns">
                        <button class="sh-next-ep-play-btn" id="sh-next-ep-play-now">Lancer</button>
                        <button class="sh-next-ep-close-btn" id="sh-next-ep-cancel" title="Annuler">✕</button>
                    </div>
                </div>
            </div>

            <!-- 🍏 GRAND CINEMA LIQUID DOCK (Disposition Studio Apple TV+ Rééquilibrée) -->
            <div class="sh-cinema-dock-anchor">
                <div class="sh-dock-amber-glow"></div>

                <!-- Dock Principal -->
                <div class="sh-liquid-ribbon-dock">
                    
                    <!-- Section Gauche : Commandes Transport Proportionnées & Temps Écoulé -->
                    <div class="sh-ribbon-group sh-ribbon-group--left">
                        <!-- Play / Pause Master Pearl (32px Calibré) -->
                        <button class="sh-pearl-play-btn" id="sh-btn-play-pause" tabindex="0" data-nav-focusable="true" title="Lecture / Pause (Espace)">
                            <svg class="sh-icon-play" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                            <svg class="sh-icon-pause" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        </button>

                        <!-- Sauts ±10s (30px) -->
                        <button class="sh-micro-btn" id="sh-btn-skip-back" tabindex="0" data-nav-focusable="true" title="Reculer de 10s (←)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            <span class="sh-micro-num">10</span>
                        </button>
                        <button class="sh-micro-btn" id="sh-btn-skip-fwd" tabindex="0" data-nav-focusable="true" title="Avancer de 10s (→)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                            <span class="sh-micro-num">10</span>
                        </button>

                        <!-- Horodatage Écoulé -->
                        <span class="sh-time-elapsed-label" id="sh-time-elapsed">00:00:00</span>
                    </div>

                    <!-- Section Centrale : Timeline Scrubber Étendu (Zéro Vide) -->
                    <div class="sh-ribbon-timeline-wrapper">
                        <div class="sh-ribbon-timeline" id="sh-player-timeline-focus" tabindex="0" data-nav-focusable="true" role="slider" aria-label="Position de lecture" aria-valuemin="0" aria-valuemax="100">
                            <div class="sh-ribbon-timeline-bg"></div>
                            <div class="sh-ribbon-timeline-buffered" id="sh-timeline-buffer"></div>
                            <div class="sh-ribbon-timeline-played" id="sh-timeline-played"></div>
                            <div class="sh-ribbon-timeline-thumb" id="sh-timeline-handle"></div>
                            
                            <div class="sh-timeline-tooltip" id="sh-timeline-tooltip">
                                <span id="sh-tooltip-time">00:00:00</span>
                            </div>
                        </div>
                        <!-- Horodatage Restant -->
                        <span class="sh-time-remaining-label" id="sh-time-remaining">-00:00:00</span>
                    </div>

                    <!-- Section Droite : Volume Compact & Boutons Dépliants Ancrés -->
                    <div class="sh-ribbon-group sh-ribbon-group--right">
                        
                        <!-- Volume Coulissant Compact -->
                        <div class="sh-volume-flow-box">
                            <button class="sh-micro-btn" id="sh-btn-volume" tabindex="0" data-nav-focusable="true" title="Volume / Muet (M)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                            </button>
                            <div class="sh-volume-track">
                                <input type="range" class="sh-volume-range" id="sh-volume-range" min="0" max="1" step="0.02" value="${ctx._volume}">
                            </div>
                        </div>

                        <!-- Épisode Précédent / Suivant (Séries) -->
                        <button class="sh-micro-btn" id="sh-btn-prev-ep" tabindex="0" data-nav-focusable="true" title="Épisode précédent" style="display:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                        </button>
                        <button class="sh-micro-btn" id="sh-btn-next-ep" tabindex="0" data-nav-focusable="true" title="Épisode suivant" style="display:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                        </button>

                        <!-- Ancre Dépliante 1 : Épisodes (Séries) -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-episodes" style="display:none;">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-episodes" title="Liste des épisodes">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                                <span>Épisodes</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-episodes">
                                <div class="sh-popover-inner sh-popover-inner--episodes">
                                    <div class="sh-popover-section-title">Épisodes de la Saison</div>
                                    <div class="sh-episodes-popover-list sh-scrollbar" id="sh-player-episodes-list">
                                        <!-- Injecté dynamiquement -->
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Ancre Dépliante 2 : Audio & Sous-titres -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-audio-subs">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-audio-subs" title="Pistes Audio & Sous-Titres (S)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
                                <span>Audio & Subs</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-audio-subs">
                                <div class="sh-popover-inner sh-popover-inner--audio-subs">
                                    <div class="sh-popover-cols">
                                        <!-- Colonne 1 : Pistes Audio -->
                                        <div class="sh-popover-col">
                                            <div class="sh-popover-col-header">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                                <span>Pistes Audio</span>
                                            </div>
                                            <div class="sh-popover-list" id="sh-player-audio-list">
                                                <!-- Injecté dynamiquement -->
                                            </div>
                                        </div>

                                        <div class="sh-popover-divider"></div>

                                        <!-- Colonne 2 : Sous-titres & Décalage -->
                                        <div class="sh-popover-col">
                                            <div class="sh-popover-col-header">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
                                                <span>Sous-titres</span>
                                            </div>
                                            <div class="sh-popover-list" id="sh-player-subs-list">
                                                <!-- Injecté dynamiquement -->
                                            </div>

                                            <!-- Stepper de Synchronisation Direct -->
                                            <div class="sh-popover-sub-sync">
                                                <div class="sh-popover-sub-sync-title">Synchronisation Live</div>
                                                <div class="sh-sync-grid">
                                                    <button class="sh-sync-btn" data-offset="-0.5">-0.5s</button>
                                                    <button class="sh-sync-btn" data-offset="-0.1">-0.1s</button>
                                                    <button class="sh-sync-btn sh-sync-btn--reset" data-offset="0">0.0s</button>
                                                    <button class="sh-sync-btn" data-offset="+0.1">+0.1s</button>
                                                    <button class="sh-sync-btn" data-offset="+0.5">+0.5s</button>
                                                </div>
                                                <div class="sh-sync-label">Décalage : <strong id="sh-popover-offset-val">${ctx._subOffset > 0 ? '+' : ''}${ctx._subOffset.toFixed(1)}s</strong></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Ancre Dépliante 3 : Vitesse & Réglages -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-settings">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-settings" title="Vitesse & Réglages (C)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                                <span id="sh-speed-indicator">${ctx._playbackRate}x</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-settings">
                                <div class="sh-popover-inner sh-popover-inner--settings">
                                    <div class="sh-popover-section">
                                        <div class="sh-popover-section-title">Vitesse de Lecture</div>
                                        <div class="sh-settings-chips" id="sh-player-speed-chips">
                                            <button class="sh-chip-btn ${ctx._playbackRate === 0.5 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="0.5">0.5x</button>
                                            <button class="sh-chip-btn ${ctx._playbackRate === 0.75 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="0.75">0.75x</button>
                                            <button class="sh-chip-btn ${ctx._playbackRate === 1.0 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="1.0">1.0x (Normal)</button>
                                            <button class="sh-chip-btn ${ctx._playbackRate === 1.25 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="1.25">1.25x</button>
                                            <button class="sh-chip-btn ${ctx._playbackRate === 1.5 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="1.5">1.5x</button>
                                            <button class="sh-chip-btn ${ctx._playbackRate === 2.0 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-speed="2.0">2.0x</button>
                                        </div>
                                    </div>

                                    <div class="sh-popover-section" style="margin-top: 12px;">
                                        <div class="sh-popover-section-title">Format d'Image</div>
                                        <div class="sh-settings-chips" id="sh-player-aspect-chips">
                                            <button class="sh-chip-btn ${ctx._aspectRatioIndex === 0 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-aspect-idx="0">16:9 Adapté</button>
                                            <button class="sh-chip-btn ${ctx._aspectRatioIndex === 1 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-aspect-idx="1">21:9 Cinéma Scope</button>
                                            <button class="sh-chip-btn ${ctx._aspectRatioIndex === 2 ? 'active' : ''}" tabindex="0" data-nav-focusable="true" data-aspect-idx="2">Plein écran Étiré</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                </div>
            </div>
        `;
}

export default gabaritLecteur;
