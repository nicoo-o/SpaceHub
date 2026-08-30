/**
 * SpaceHub — App Layout Shell
 * Version: 2.0.0 (Apple TV Premium)
 *
 * Conteneur principal de l'application cliente SpaceHub.
 * En-tête cinématique flottant transparent & shell zéro-marge.
 */

'use strict';

import Logger from '../../core/Logger.js';
import LibraryView from '../views/LibraryView.js';
import DownloadsView from '../views/DownloadsView.js';
import AppSidebarDrawer from '../components/AppSidebarDrawer.js';
import AnalyticsModal from '../components/AnalyticsModal.js';
import AdminDashboardView from '../views/AdminDashboardView.js';
import SpatialNavigation  from '../../core/SpatialNavigation.js';

class AppLayout {
    constructor() {
        this._log = new Logger('AppLayout');
        this._currentView = 'dashboard';
        this._views = {
            library: new LibraryView(),
            downloads: new DownloadsView()
        };
                this._sidebar = new AppSidebarDrawer();
        this._clockInterval = null;
        this._spatialNav = null;
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    render(container) {
        const user = this._auth?.getUser();
        const serverUrl = this._auth?.getServerUrl();
        const userAvatarUrl = user?.PrimaryImageTag && user?.Id && serverUrl 
            ? `${serverUrl}/Users/${user.Id}/Images/Primary?quality=90`
            : null;

        container.innerHTML = `
            <div class="sh-app-shell">
                <!-- Zone de détection supérieure Dynamic Island -->
                <div class="sh-island-nav-wrapper">
                    <!-- Dynamic Island Ambient Glass Shadow -->
                    <div class="sh-island-underglow" id="sh-island-underglow"></div>

                    <nav class="sh-dynamic-island sh-island--compact" id="sh-dynamic-island">
                        <!-- Phase 1 : Mode Compact Island (Logo + Point Blanc Pur + Horloge Live 12•30) -->

                        <div class="sh-island-compact-view">
                            <div class="sh-luminous-dot" title="SpaceHub Live Hub Active">
                                <div class="sh-dot-core"></div>
                            </div>
                            <svg class="sh-island-rocket" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                            </svg>
                            <span class="sh-island-label">SpaceHub</span>
                            <div class="sh-island-clock-badge" id="sh-island-clock-badge">
                                <span class="sh-clock-hh">12</span><span class="sh-clock-pulse-dot">•</span><span class="sh-clock-mm">30</span>
                            </div>
                        </div>

                        <!-- Phase 2 : Mode Déployé Complet -->
                        <div class="sh-island-full-view">
                            <div class="sh-nav-brand">
                                <div class="sh-luminous-dot" title="SpaceHub Active">
                                    <div class="sh-dot-core"></div>
                                </div>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                                </svg>
                                <span class="sh-nav-brand-txt">SpaceHub</span>
                            </div>

                            <div class="sh-nav-tabs" id="sh-nav-tabs">
                                <div class="sh-nav-tabs-sliding-pill" id="sh-nav-tabs-pill"></div>
                                <button class="sh-nav-tab-btn ${this._currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                                    Accueil
                                </button>
                                <button class="sh-nav-tab-btn ${this._currentView === 'library' ? 'active' : ''}" data-view="library">
                                    Bibliothèques
                                </button>
                                <button class="sh-nav-tab-btn ${this._currentView === 'flux' || this._currentView === 'downloads' ? 'active' : ''}" data-view="flux">
                                    Flux
                                </button>
                            </div>

                            <div class="sh-nav-actions">
                                <button class="sh-nav-action-btn" id="sh-btn-quick-search" title="Recherche rapide (⌘K)">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                </button>

                                <div class="sh-user-menu-wrapper">
                                    <button class="sh-user-avatar-btn" id="sh-user-menu-btn" tabindex="0" data-nav-focusable="true" title="${user?.Name || 'Utilisateur'}">
                                        <div class="sh-avatar-pill" ${userAvatarUrl ? `style="background-image: url('${userAvatarUrl}'); background-size: cover; background-position: center;"` : ''}>
                                            ${userAvatarUrl ? '' : (user?.Name || 'U').charAt(0).toUpperCase()}
                                        </div>
                                    </button>
                                    <div class="sh-user-dropdown" id="sh-user-dropdown" style="display:none;">
                                        <div class="sh-user-dropdown__header">
                                            <strong>${user?.Name || 'Utilisateur'}</strong>
                                            <span class="sh-user-server sh-truncate">${serverUrl || 'Jellyfin Server'}</span>
                                        </div>
                                        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.08); margin:10px 0;"/>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-switch-theme" style="--item-idx: 0;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
                                                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
                                                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
                                                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
                                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                                            </svg>
                                            <span>Changer de thème</span>
                                        </button>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-customize-dashboard" style="--item-idx: 1;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <rect x="3" y="3" width="7" height="7"></rect>
                                                <rect x="14" y="3" width="7" height="7"></rect>
                                                <rect x="14" y="14" width="7" height="7"></rect>
                                                <rect x="3" y="14" width="7" height="7"></rect>
                                            </svg>
                                            <span>Personnaliser l'accueil</span>
                                        </button>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-refresh-app" style="--item-idx: 2;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                                            </svg>
                                            <span>Actualiser l'affichage</span>
                                        </button>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-open-analytics" style="--item-idx: 3;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                                <line x1="6" y1="20" x2="6" y2="14"></line>
                                            </svg>
                                            <span>Mes Statistiques</span>
                                        </button>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-open-admin" style="--item-idx: 4;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                            </svg>
                                            <span>Administration Serveur</span>
                                        </button>
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-open-settings" style="--item-idx: 5;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                            <span>Réglages</span>
                                        </button>
                                        <button class="sh-user-dropdown__item sh-danger" id="sh-btn-logout" style="--item-idx: 6;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                            <span>Déconnexion</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Phase 3 : Mode Recherche Spotlight (Option 1 : Expansion Directe iOS 18) -->
                        <div class="sh-island-search-view" id="sh-island-search-view"></div>
                    </nav>
                </div>

                <!-- Zone de contenu principale -->
                <main class="sh-app-main" id="sh-main-view-container"></main>
            </div>
        `;

        this._bindHeaderEvents(container);
        this._sidebar.render(document.body);
        this.navigate(this._currentView);
        this._spatialNav = new SpatialNavigation({ root: container });
        if (window.SpaceHub) {
            window.SpaceHub.spatialNav = this._spatialNav;
            if (!window.SpaceHub.core) window.SpaceHub.core = {};
            window.SpaceHub.core.spatialNavigation = this._spatialNav;
        }
    }

    _bindHeaderEvents(container) {
        const island = container.querySelector('#sh-dynamic-island');
        let _islandCloseTimer = null;

        const setIslandState = (state) => {
            if (island?.classList.contains('sh-island--search')) return;
            const underglow = container.querySelector('#sh-island-underglow');

            if (state === 'compact') {
                if (island?.classList.contains('sh-island--compact') && !island?.classList.contains('sh-island--expanded')) {
                    return; // Déjà en mode compact, ignorer l'animation
                }
                island?.classList.remove('sh-island--expanded');
                island?.classList.add('sh-island--collapsing');
                island?.classList.add('sh-island--compact');
                if (underglow) underglow.className = 'sh-island-underglow sh-underglow--collapsing';

                setTimeout(() => {
                    island?.classList.remove('sh-island--collapsing');
                    if (island?.classList.contains('sh-island--compact') && underglow) {
                        underglow.className = 'sh-island-underglow sh-underglow--compact';
                    }
                }, 600);
            } else {
                if (island?.classList.contains('sh-island--expanded') && !island?.classList.contains('sh-island--compact')) {
                    return; // Déjà en mode déployé, ignorer l'animation
                }
                island?.classList.remove('sh-island--compact', 'sh-island--collapsing');
                island?.classList.add('sh-island--expanded');
                if (underglow) {
                    underglow.className = 'sh-island-underglow sh-underglow--expanded';
                }
            }
        };

        // Initialisation immédiate en mode Compact permanent
        setIslandState('compact');

                // Support tactile mobile (toggle au tap et fermeture au clic extérieur)
        island?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (island?.classList.contains('sh-island--compact')) {
                setIslandState('expanded');
            }
        });

        document.addEventListener('click', (e) => {
            if (island && !island.contains(e.target) && island.classList.contains('sh-island--expanded') && !island.classList.contains('sh-island--search')) {
                setIslandState('compact');
            }
        });

        // Horloge dynamique en temps réel
        const updateClock = () => {
            const badge = container.querySelector('#sh-island-clock-badge');
            if (!badge) return;
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const hhEl = badge.querySelector('.sh-clock-hh');
            const mmEl = badge.querySelector('.sh-clock-mm');
            if (hhEl) hhEl.textContent = hh;
            if (mmEl) mmEl.textContent = mm;
        };
        updateClock();
        this._clockInterval = setInterval(updateClock, 10000);

        island?.addEventListener('mouseenter', () => {
            if (island?.classList.contains('sh-island--search')) return;
            const modalOpen = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-console-modal-overlay.open, .sh-admin-modal-overlay, #spacehub-settings');
            if (modalOpen) return;

            if (_islandCloseTimer) {
                clearTimeout(_islandCloseTimer);
                _islandCloseTimer = null;
            }
            setIslandState('expanded');

            const refreshPill = () => {
                const activeBtn = container.querySelector(`.sh-nav-tab-btn[data-view="${this._currentView}"]`) || container.querySelector('.sh-nav-tab-btn.active');
                if (activeBtn) updateTabPill(activeBtn, false);
            };

            refreshPill();
            requestAnimationFrame(refreshPill);
            setTimeout(refreshPill, 80);
            setTimeout(refreshPill, 200);
            setTimeout(refreshPill, 360);
        });

        // Dropdown utilisateur
        const userBtn = container.querySelector('#sh-user-menu-btn');
        const dropdown = container.querySelector('#sh-user-dropdown');

        window.SpaceHub = window.SpaceHub || {};
        window.SpaceHub._toggleUserDropdown = (show) => toggleDropdown(show);
        const toggleDropdown = (show) => {
            if (!dropdown) return;
            const isOpen = dropdown.classList.contains('sh-dropdown--open');
            const willOpen = (show !== undefined) ? show : !isOpen;

            if (willOpen) {
                if (_islandCloseTimer) {
                    clearTimeout(_islandCloseTimer);
                    _islandCloseTimer = null;
                }
                dropdown.classList.remove('sh-dropdown--closing');
                dropdown.style.display = 'block';
                void dropdown.offsetWidth; // Reflow pour redémarrer l'animation
                dropdown.classList.add('sh-dropdown--open');
                island?.classList.add('sh-dropdown-active');
            } else {
                if (!isOpen && dropdown.style.display === 'none') return;
                dropdown.classList.remove('sh-dropdown--open');
                dropdown.classList.add('sh-dropdown--closing');
                island?.classList.remove('sh-dropdown-active');

                setTimeout(() => {
                    if (dropdown.classList.contains('sh-dropdown--closing')) {
                        dropdown.style.display = 'none';
                        dropdown.classList.remove('sh-dropdown--closing');
                    }
                    if (!island?.matches(':hover') && !island?.classList.contains('sh-island--search')) {
                        _islandCloseTimer = setTimeout(() => {
                            if (!island?.matches(':hover') && !island?.classList.contains('sh-island--search') && (!dropdown || dropdown.style.display === 'none')) {
                                setIslandState('compact');
                            }
                        }, 240);
                    }
                }, 180);
            }
        };

        island?.addEventListener('mouseleave', () => {
            if (island?.classList.contains('sh-island--search')) return;
            if (dropdown && dropdown.style.display !== 'none') return; // Ne pas fermer si le menu est ouvert
            if (_islandCloseTimer) clearTimeout(_islandCloseTimer);
            // Délai fluide et soyeux avant déclenchement du ressort souple (240ms)
            _islandCloseTimer = setTimeout(() => {
                if (!island?.classList.contains('sh-island--search') && (!dropdown || dropdown.style.display === 'none')) {
                    setIslandState('compact');
                }
            }, 240);
        });

        // Liquid Tab Switch Morph Logic (Apple Squash & Stretch Spring Physics)
        const tabsTrack = container.querySelector('#sh-nav-tabs');
        const tabsPill = container.querySelector('#sh-nav-tabs-pill');
        let _activePillTarget = null;
        let _pillSquashTimer = null;

        const updateTabPill = (targetBtn, animate = true) => {
            if (!tabsPill || !targetBtn || !tabsTrack) return;
            const left = targetBtn.offsetLeft;
            const width = targetBtn.offsetWidth;
            if (width <= 0) return;

            const isAlreadyAtTarget = _activePillTarget === targetBtn;
            _activePillTarget = targetBtn;

            if (_pillSquashTimer) {
                clearTimeout(_pillSquashTimer);
                _pillSquashTimer = null;
            }

            if (animate && !isAlreadyAtTarget) {
                // Effet Ressort Élastique Apple (Squash & Stretch Spring Physics)
                tabsPill.style.transition = 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), width 340ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease';
                tabsPill.style.transform = `translateX(${left}px) scaleX(1.08) scaleY(0.94)`;
                tabsPill.style.boxShadow = '0 6px 22px rgba(255, 255, 255, 0.60), 0 0 1px #ffffff';

                _pillSquashTimer = setTimeout(() => {
                    if (_activePillTarget === targetBtn) {
                        tabsPill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
                        tabsPill.style.boxShadow = '0 4px 14px rgba(255, 255, 255, 0.35)';
                    }
                }, 160);
            } else if (!animate) {
                tabsPill.style.transition = 'none';
                tabsPill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
                tabsPill.style.boxShadow = '0 4px 14px rgba(255, 255, 255, 0.35)';
            }
            tabsPill.style.width = `${width}px`;
            tabsPill.style.opacity = '1';
        };
        this._updateTabPill = updateTabPill;

        requestAnimationFrame(() => {
            const activeBtn = container.querySelector(`.sh-nav-tab-btn[data-view="${this._currentView}"]`) || container.querySelector('.sh-nav-tab-btn.active');
            if (activeBtn) updateTabPill(activeBtn, false);
        });

        // Onglets de navigation Accueil / Bibliothèques
        container.querySelectorAll('.sh-nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                if (view) {
                    this.navigate(view);
                }
            });
        });

        // Animation tactile & visuelle au clic sur le logo SpaceHub
        const triggerLogoAnimation = (el) => {
            if (!el) return;
            el.classList.remove('sh-logo-clicked');
            void el.offsetWidth; // Force reflow
            el.classList.add('sh-logo-clicked');
            setTimeout(() => el.classList.remove('sh-logo-clicked'), 520);
        };

        const scrollToTop = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const compactEl = container.querySelector('.sh-island-compact-view');
            const brandEl = container.querySelector('.sh-nav-brand');
            triggerLogoAnimation(compactEl);
            triggerLogoAnimation(brandEl);

            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
            document.body.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('.sh-app-shell')?.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('#sh-main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('.sh-dashboard')?.scrollTo({ top: 0, behavior: 'smooth' });
        };

        const compactView = container.querySelector('.sh-island-compact-view');
        const brandView = container.querySelector('.sh-nav-brand');

        // Empêcher la sélection de texte du navigateur au double-clic ou glisser
        compactView?.addEventListener('mousedown', (e) => e.preventDefault());
        brandView?.addEventListener('mousedown', (e) => e.preventDefault());

        compactView?.addEventListener('click', scrollToTop);
        brandView?.addEventListener('click', scrollToTop);

        // Recherche rapide Ctrl+K
        container.querySelector('#sh-btn-quick-search')?.addEventListener('click', () => {
            window.SpaceHub?.jellyfin?.search?.open();
        });

        // Ouvrir / fermer dropdown utilisateur
        userBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        dropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.addEventListener('click', () => {
            if (dropdown && dropdown.style.display !== 'none') {
                toggleDropdown(false);
            }
        });

        // Changer de thème depuis le menu utilisateur
        container.querySelector('#sh-btn-switch-theme')?.addEventListener('click', () => {
            const themes = window.SpaceHub?.ui?.themes;
            if (themes) {
                themes.next();
                const currentId = themes.getCurrent();
                const available = themes.getAvailable();
                const currentTheme = available.find(t => t.id === currentId);
                window.SpaceHub?.ui?.components?.toaster?.info?.(`Thème actif : ${currentTheme?.name || currentId}`);
            }
            toggleDropdown(false);
        });

        // Personnaliser l'accueil depuis le menu utilisateur
        container.querySelector('#sh-btn-customize-dashboard')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.settingsPanel?.open?.('dashboard');
            toggleDropdown(false);
        });

        // Actualiser l'affichage depuis le menu utilisateur
        container.querySelector('#sh-btn-refresh-app')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.dashboard?.render?.();
            window.SpaceHub?.ui?.components?.toaster?.success?.('Affichage et widgets actualisés !');
            toggleDropdown(false);
        });

        // Ouvrir Mes Statistiques depuis le menu utilisateur
        container.querySelector('#sh-btn-open-analytics')?.addEventListener('click', () => {
            const analyticsModal = new AnalyticsModal();
            analyticsModal.open();
            toggleDropdown(false);
        });

        // Ouvrir Administration Serveur depuis le menu utilisateur
        container.querySelector('#sh-btn-open-admin')?.addEventListener('click', () => {
            const adminView = window.SpaceHub?.ui?.adminDashboard || new AdminDashboardView();
            adminView.open();
            toggleDropdown(false);
        });

        // Réglages depuis le menu utilisateur
        container.querySelector('#sh-btn-open-settings')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.settingsPanel?.open();
            toggleDropdown(false);
        });

        // Déconnexion
        container.querySelector('#sh-btn-logout')?.addEventListener('click', () => {
            toggleDropdown(false);
            this._auth?.logout();
        });
    }

    /**
     * Bascule vers une vue donnée.
     * @param {'dashboard'|'library'|'flux'|'downloads'|'home'|'movies'|'series'|'music'} viewName
     * @param {Object} [params]
     */
    async     destroy() {
        if (this._clockInterval) {
            clearInterval(this._clockInterval);
            this._clockInterval = null;
        }
        if (this._spatialNav) {
            this._spatialNav.destroy();
            this._spatialNav = null;
        }
    }

    async navigate(viewName, params = {}) {
        let normalizedView = viewName;
        if (viewName === 'home' || viewName === 'dashboard') {
            normalizedView = 'dashboard';
        } else if (viewName === 'library' || viewName === 'libraries') {
            normalizedView = 'library';
        } else if (viewName === 'flux' || viewName === 'hub' || viewName === 'downloads' || viewName === 'download') {
            normalizedView = 'flux';
        } else if (viewName === 'movies' || viewName === 'series' || viewName === 'music') {
            normalizedView = 'library';
            params = { ...params, targetType: viewName };
        }

        this._currentView = normalizedView;

        // Synchroniser le bouton actif et la capsule blanche dans le dock
        const buttons = document.querySelectorAll('.sh-nav-tab-btn');
        let activeBtn = null;
        buttons.forEach(b => {
            const isActive = b.dataset.view === normalizedView || (normalizedView === 'flux' && b.dataset.view === 'downloads');
            b.classList.toggle('active', isActive);
            if (isActive) activeBtn = b;
        });

        if (activeBtn && this._updateTabPill) {
            this._updateTabPill(activeBtn, true);
        }

        // Synchroniser la capsule animée dans la Side Bar
        this._sidebar?.setActive(normalizedView, params);

        const container = document.querySelector('#sh-main-view-container');
        if (!container) return;

        container.innerHTML = '';

        if (normalizedView === 'dashboard') {
            await window.SpaceHub?.ui?.dashboard?.render(container, params);
        } else if (normalizedView === 'library') {
            await this._views.library.render(container, params);
        } else if (normalizedView === 'flux' || normalizedView === 'downloads') {
            await this._views.downloads.render(container, params);
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-layout-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-layout-styles';
        style.textContent = `
/* ── Universal Smooth Scroll Flow (Apple TV Zero-Constraint) ── */
html, body {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    background-color: #000000 !important;
    overflow-x: hidden;
    overflow-y: auto !important;
    scrollbar-width: none;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}

.sh-app-shell {
    display: block;
    width: 100%;
    min-height: 100vh;
    background-color: #000000;
    overflow: visible;
    position: relative;
}

.sh-app-main {
    display: block;
    width: 100%;
    background-color: #000000;
    overflow: visible;
    position: relative;
}



/* ── Dynamic Island Liquid Glass (Apple Dynamic Island Spring Physics) */
/* ── Dynamic Island Liquid Glass (Apple Dynamic Island Spring Physics) */
.sh-island-nav-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100vw;
    height: 80px;
    z-index: 10003;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}

.sh-dynamic-island.sh-island--portal-active {
    border-color: rgba(255, 255, 255, 0.35) !important;
    box-shadow: 
        0 0 35px rgba(255, 255, 255, 0.22),
        0 20px 50px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.60),
        0 0 0 1px rgba(255, 255, 255, 0.15) !important;
    transform: translateX(-50%) scale(1.02) !important;
}

/* Dynamic Island Ambient Glass Shadow (Monochrome & Épuré) */
.sh-island-underglow {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 44px;
    height: 20px;
    border-radius: 9999px;
    background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.10) 0%, transparent 80%);
    filter: blur(16px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 450ms ease, width 850ms cubic-bezier(0.34, 1.45, 0.45, 1), height 750ms cubic-bezier(0.34, 1.45, 0.45, 1);
}
.sh-island-underglow.sh-underglow--compact {
    opacity: 0.40;
    width: 204px;
    height: 38px;
}
.sh-island-underglow.sh-underglow--expanded {
    opacity: 0.65;
    width: 535px;
    height: 50px;
}

.sh-dynamic-island {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    background: rgba(12, 12, 16, 0.92);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    box-shadow: 
        0 20px 50px rgba(0, 0, 0, 0.90),
        inset 0 1px 0 rgba(255, 255, 255, 0.25),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05);
    transition: 
        width 440ms cubic-bezier(0.16, 1, 0.3, 1),
        height 440ms cubic-bezier(0.16, 1, 0.3, 1),
        border-radius 360ms cubic-bezier(0.16, 1, 0.3, 1),
        background 400ms ease,
        border-color 400ms ease,
        box-shadow 440ms ease;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10002;
}

/* Liseré Spéculaire Fin au survol (100% Monochrome & Épuré) */
.sh-dynamic-island:hover {
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 
        0 26px 70px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 0 0 1px rgba(255, 255, 255, 0.08);
}

/* ── Vue Micro Encoche (Phase 0) ────────────────────────────── */
.sh-island-notch {
    position: absolute;
    width: 36px;
    height: 5px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.25);
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
    visibility: hidden;
    transition: opacity 300ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1), visibility 300ms;
}

/* ── Animations Élastiques & Ressort Souple (Soft Damped Spring) ── */
@keyframes shIslandSquashBounce {
    0% {
        width: 535px;
        height: 52px;
    }
    44% {
        width: 156px; /* Compression prononcée bien visible (Squash profond) */
        height: 35px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.60), 0 0 14px rgba(255, 255, 255, 0.20);
    }
    72% {
        width: 216px; /* Rebond élastique bien visible */
        height: 39px;
    }
    88% {
        width: 202px; /* Micro oscillation d'amorti organique */
        height: 37.8px;
    }
    100% {
        width: 204px; /* Repos stabilisé parfait */
        height: 38px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.26);
    }
}

@keyframes shUnderglowSquashBounce {
    0% {
        width: 535px;
        height: 50px;
        opacity: 0.65;
    }
    44% {
        width: 150px;
        height: 32px;
        opacity: 0.75;
    }
    72% {
        width: 218px;
        height: 40px;
        opacity: 0.45;
    }
    88% {
        width: 202px;
        height: 37.5px;
        opacity: 0.42;
    }
    100% {
        width: 204px;
        height: 38px;
        opacity: 0.40;
    }
}

.sh-dynamic-island.sh-island--collapsing {
    animation: shIslandSquashBounce 600ms cubic-bezier(0.2, 0.85, 0.25, 1) forwards !important;
}

.sh-island-underglow.sh-underglow--collapsing {
    animation: shUnderglowSquashBounce 600ms cubic-bezier(0.2, 0.85, 0.25, 1) forwards !important;
}

/* ── Vue Compacte (Phase 1 : 204px) ─────────────────────────── */
.sh-island-compact-view {
    position: absolute;
    left: 18px;
    display: flex;
    align-items: center;
    gap: 11px;
    white-space: nowrap;
    opacity: 0;
    transform: scale(0.65) translateY(-2px);
    filter: blur(4px);
    pointer-events: none;
    visibility: hidden;
    transition: opacity 200ms ease, transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms ease, visibility 200ms;
}

/* ── Vue Déployée Complète (Phase 2 : 535px) ────────────────── */
.sh-island-full-view {
    position: absolute;
    left: 18px;
    right: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    white-space: nowrap;
    pointer-events: none;
    visibility: hidden;
    transition: visibility 220ms;
}

/* ── ÉTAT 0 : Stealth (Micro encoche) ────────────────────────── */
.sh-dynamic-island.sh-island--stealth {
    width: 36px;
    height: 5px;
    padding: 0;
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.12);
    opacity: 0.35;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.sh-dynamic-island.sh-island--stealth .sh-island-notch {
    opacity: 1;
    transform: scale(1);
    visibility: visible;
}

/* ── ÉTAT 1 : Compact Island (204px) ─────────────────────────── */
.sh-dynamic-island.sh-island--compact {
    width: 204px;
    height: 38px;
    background: rgba(12, 12, 16, 0.94);
    border-color: rgba(255, 255, 255, 0.18);
    opacity: 1;
    cursor: pointer;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.26);
    transition: 
        width 480ms cubic-bezier(0.2, 0.8, 0.2, 1),
        height 400ms cubic-bezier(0.2, 0.8, 0.2, 1),
        border-radius 340ms cubic-bezier(0.16, 1, 0.3, 1),
        background 320ms ease,
        border-color 320ms ease,
        box-shadow 460ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sh-dynamic-island.sh-island--compact .sh-island-compact-view {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0px);
    pointer-events: auto;
    visibility: visible;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) 180ms, transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1) 160ms, filter 260ms ease 180ms, visibility 280ms;
}

/* Liquid Pinch en mode compact : les éléments convergent au centre et sont masqués */
.sh-dynamic-island.sh-island--compact .sh-nav-brand {
    opacity: 0;
    transform: translateX(65px) scale(0.60);
    filter: blur(3px);
    transition: opacity 120ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 140ms ease;
}

.sh-dynamic-island.sh-island--compact .sh-nav-tabs {
    opacity: 0;
    transform: scale(0.55, 0.75);
    filter: blur(3px);
    transition: opacity 120ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 140ms ease;
}

.sh-dynamic-island.sh-island--compact .sh-nav-actions {
    opacity: 0;
    transform: translateX(-65px) scale(0.60);
    filter: blur(3px);
    transition: opacity 120ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 140ms ease;
}

/* ── ÉTAT 2 : Full Expanded (535px — Apple Spring Morphing) ─── */
.sh-dynamic-island.sh-island--expanded,
.sh-dynamic-island.sh-dropdown-active {
    width: 535px;
    height: 52px;
    background: rgba(10, 10, 14, 0.96);
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 
        0 26px 70px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.32);
    opacity: 1;
    overflow: visible !important;
    transition: 
        width 500ms cubic-bezier(0.34, 1.45, 0.45, 1),
        height 420ms cubic-bezier(0.34, 1.45, 0.45, 1),
        border-radius 360ms cubic-bezier(0.16, 1, 0.3, 1),
        background 350ms ease,
        border-color 350ms ease,
        box-shadow 460ms cubic-bezier(0.34, 1.45, 0.45, 1);
}
.sh-dynamic-island.sh-island--expanded .sh-island-compact-view,
.sh-dynamic-island.sh-dropdown-active .sh-island-compact-view {
    opacity: 0;
    transform: scale(0.65) translateY(-4px);
    filter: blur(4px);
    pointer-events: none;
    visibility: hidden;
    transition: opacity 160ms ease, transform 200ms ease, filter 160ms ease, visibility 160ms;
}
.sh-dynamic-island.sh-island--expanded .sh-island-full-view,
.sh-dynamic-island.sh-dropdown-active .sh-island-full-view {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    overflow: visible !important;
}

/* Apparition fluide et déploiement des éléments internes */
.sh-dynamic-island.sh-island--expanded .sh-nav-brand {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0px);
    transition: opacity 350ms cubic-bezier(0.16, 1, 0.3, 1) 120ms, transform 450ms cubic-bezier(0.34, 1.45, 0.45, 1) 100ms, filter 300ms ease 120ms;
}

.sh-dynamic-island.sh-island--expanded .sh-nav-tabs {
    opacity: 1;
    transform: scale(1);
    filter: blur(0px);
    transition: opacity 320ms cubic-bezier(0.16, 1, 0.3, 1) 150ms, transform 420ms cubic-bezier(0.34, 1.45, 0.45, 1) 130ms, filter 300ms ease 150ms;
}

.sh-dynamic-island.sh-island--expanded .sh-nav-actions {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0px);
    transition: opacity 350ms cubic-bezier(0.16, 1, 0.3, 1) 180ms, transform 450ms cubic-bezier(0.34, 1.45, 0.45, 1) 160ms, filter 300ms ease 180ms;
}

/* ── ÉTAT 3 : Search Spotlight (Concept 3 : Framer FLIP Dynamic Morph) ─── */
.sh-dynamic-island.sh-island--search {
    top: 14px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: min(660px, 92vw) !important;
    height: 500px !important;
    max-height: 75vh !important;
    border-radius: 24px !important;
    background: rgba(12, 12, 16, 0.94) !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    box-shadow: 
        0 35px 95px rgba(0, 0, 0, 0.96),
        inset 0 1px 0 rgba(255, 255, 255, 0.30),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.08) !important;
    z-index: 10002 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    padding: 0 !important;
    cursor: default !important;
    overflow: hidden !important;
    transition: none !important;
}

.sh-dynamic-island.sh-island--search .sh-island-notch,
.sh-dynamic-island.sh-island--search .sh-island-compact-view,
.sh-dynamic-island.sh-island--search .sh-island-full-view {
    opacity: 0 !important;
    transform: scale(0.90) translateY(-6px) !important;
    filter: blur(6px) !important;
    pointer-events: none !important;
    visibility: hidden !important;
    transition: opacity 120ms ease, transform 140ms ease, filter 120ms ease, visibility 120ms !important;
}

.sh-island-search-view {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: scale(0.97) translateY(-6px);
    filter: blur(4px);
    pointer-events: none;
    visibility: hidden;
    overflow: hidden;
    transition: opacity 220ms ease 80ms, transform 300ms cubic-bezier(0.16, 1, 0.3, 1) 80ms, filter 220ms ease 80ms, visibility 220ms 80ms;
}

.sh-dynamic-island.sh-island--search .sh-island-search-view {
    opacity: 1 !important;
    transform: scale(1) translateY(0) !important;
    filter: blur(0px) !important;
    pointer-events: auto !important;
    visibility: visible !important;
}

/* ── Point Jaune / Orange Ambré iPhone (Indicateur Téléphone Apple) ── */
.sh-luminous-dot {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 5px #ff9f0a, 0 0 12px rgba(255, 159, 10, 0.85);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 300ms ease;
}

.sh-dynamic-island:hover .sh-luminous-dot {
    transform: scale(1.18);
    box-shadow: 0 0 8px #ff9f0a, 0 0 16px rgba(255, 159, 10, 0.95);
}

.sh-dot-core {
    position: absolute;
    inset: 1px;
    border-radius: 50%;
    background: #ffb340;
}

/* 🕒 Micro-Badge Horloge Live (Mode Compact) */
.sh-island-clock-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: -0.2px;
}

.sh-clock-pulse-dot {
    color: rgba(255, 255, 255, 0.90);
    font-weight: 800;
    animation: sh-clock-dot-blink 2.2s ease-in-out infinite;
}

@keyframes sh-clock-dot-blink {
    0%, 100% { opacity: 0.90; transform: scale(1); }
    50%      { opacity: 0.30; transform: scale(0.85); }
}

.sh-island-label {
    font-size: 13px;
    font-weight: 750;
    color: #ffffff;
    letter-spacing: -0.2px;
    user-select: none !important;
    -webkit-user-select: none !important;
}

.sh-island-rocket {
    color: #ffffff;
    transition: transform 260ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.sh-nav-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
    cursor: pointer !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 180ms ease;
}

.sh-nav-brand:hover,
.sh-island-compact-view:hover {
    transform: scale(1.04);
}

.sh-nav-brand:active,
.sh-island-compact-view:active {
    transform: scale(0.94);
}

.sh-nav-brand-txt {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: #ffffff;
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
}

/* 🚀 Animation de Décollage / Propulsion au Clic sur le Logo */
.sh-nav-brand.sh-logo-clicked,
.sh-island-compact-view.sh-logo-clicked {
    animation: shLogoClickBurst 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards !important;
}

.sh-nav-brand.sh-logo-clicked svg,
.sh-island-compact-view.sh-logo-clicked svg {
    animation: shRocketThrust 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards !important;
}

.sh-nav-brand.sh-logo-clicked .sh-dot-core,
.sh-island-compact-view.sh-logo-clicked .sh-dot-core {
    animation: shDotRippleShockwave 500ms ease-out forwards !important;
}

@keyframes shLogoClickBurst {
    0% {
        transform: scale(0.92);
        filter: brightness(1);
    }
    40% {
        transform: scale(1.10) translateY(-2px);
        filter: brightness(1.4);
    }
    100% {
        transform: scale(1) translateY(0);
        filter: brightness(1);
    }
}

@keyframes shRocketThrust {
    0% {
        transform: scale(0.9) rotate(0deg);
    }
    45% {
        transform: scale(1.30) translateY(-3px) rotate(-14deg);
        filter: drop-shadow(0 0 10px #64d2ff);
    }
    100% {
        transform: scale(1) translateY(0) rotate(0deg);
        filter: none;
    }
}

@keyframes shDotRippleShockwave {
    0% {
        transform: scale(1);
        box-shadow: 0 0 4px #30d158;
    }
    50% {
        transform: scale(1.6);
        box-shadow: 0 0 16px #30d158, 0 0 26px rgba(48, 209, 88, 0.7);
    }
    100% {
        transform: scale(1);
        box-shadow: 0 0 6px #30d158;
    }
}

.sh-nav-tabs {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.08);
    padding: 3px;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    margin-right: 8px;
}

.sh-nav-tabs-sliding-pill {
    position: absolute;
    top: 3px;
    left: 0;
    height: calc(100% - 6px);
    background: #ffffff;
    border-radius: 9999px;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.35);
    pointer-events: none;
    z-index: 1;
    transform-origin: center center;
    transition: transform 380ms cubic-bezier(0.16, 1, 0.3, 1), width 340ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease;
    will-change: transform, width;
}

.sh-nav-tab-btn {
    position: relative;
    z-index: 2;
    background: transparent !important;
    border: none;
    padding: 7px 18px;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 200ms ease;
}

.sh-nav-tab-btn:hover {
    color: #ffffff;
}

.sh-nav-tab-btn.active {
    color: #000000 !important;
    font-weight: 750;
    background: transparent !important;
    box-shadow: none !important;
}

.sh-nav-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 8px;
}

.sh-nav-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    cursor: pointer;
    backdrop-filter: blur(16px);
    transition: all 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sh-nav-action-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.28);
    transform: scale(1.08);
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.18);
}

.sh-user-menu-wrapper {
    position: relative;
    z-index: 20000;
}

.sh-user-avatar-btn {
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
}

.sh-avatar-pill {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: #ffffff;
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(20px);
    transition: transform 150ms ease;
}

.sh-avatar-pill:hover {
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.28);
}

.sh-user-dropdown {
    position: absolute;
    top: calc(100% + 14px);
    right: -6px;
    width: 240px;
    background: rgba(14, 14, 20, 0.96) !important;
    backdrop-filter: blur(48px) saturate(200%) !important;
    -webkit-backdrop-filter: blur(48px) saturate(200%) !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 18px !important;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.95), 0 0 1px rgba(255, 255, 255, 0.4) !important;
    padding: 14px !important;
    z-index: 20005 !important;
    transform-origin: top right;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.88) translateY(-10px);
    filter: blur(10px);
    transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-user-dropdown.sh-dropdown--open {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0px);
    pointer-events: auto;
}

.sh-user-dropdown.sh-dropdown--closing {
    opacity: 0;
    transform: scale(0.92) translateY(-8px);
    filter: blur(6px);
    pointer-events: none;
    transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease;
}

.sh-user-dropdown.sh-dropdown--open .sh-user-dropdown__item {
    animation: sh-menu-item-cascade 220ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
    animation-delay: calc(var(--item-idx, 0) * 22ms + 40ms);
}

@keyframes sh-menu-item-cascade {
    0% {
        opacity: 0;
        transform: translateY(8px) scale(0.96);
    }
    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.sh-user-dropdown__header strong {
    display: block;
    font-size: 14px;
    color: #ffffff;
}

.sh-user-server {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 2px;
}

.sh-user-dropdown__item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: transparent;
    border: none;
    padding: 10px 12px;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 120ms ease;
    margin-bottom: 2px;
}

.sh-user-dropdown__item:hover {
    background: rgba(255, 255, 255, 0.10);
    color: #ffffff;
}

.sh-user-dropdown__item.sh-danger {
    color: #ff453a;
}
.sh-user-dropdown__item.sh-danger:hover {
    background: rgba(255, 69, 58, 0.15);
}

.sh-app-main {
    flex: 1;
    background-color: #000000;
}
        `;
        document.head.appendChild(style);
    }
}

export default AppLayout;
