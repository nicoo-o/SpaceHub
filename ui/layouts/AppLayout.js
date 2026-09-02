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
import { FOCUSABLES } from '../../core/DomContracts.js';

import './AppLayout.css';
import * as svc from '../../core/services.js';
class AppLayout {
    constructor() {
        this._log = new Logger('AppLayout');
        this._currentView = 'dashboard';
        this._navigationId = 0;
        this._documentHandlers = [];
        this._eventBusOff = null;
        this._pillSquashTimer = null;
        this._navigationQueue = Promise.resolve();
        this._views = {
            library: new LibraryView(),
            downloads: new DownloadsView()
        };
        this._sidebar = new AppSidebarDrawer();
        this._clockInterval = null;
        this._spatialNav = svc.nav() || svc.nav() || null;
        this._injectStyles();

        this._spatialNav = svc.nav() || svc.nav();
        if (this._spatialNav?.registerFocusables) {
            this._spatialNav.registerFocusables('dynamic-island', () => {

                const island = document.querySelector('.sh-dynamic-island, #sh-dynamic-island');
                if (!island) return [];
                // Le scope "dock" ne doit pas être un piège : on renvoie les éléments
                // du dock PUIS ceux de la vue, pour qu'une descente puisse en sortir.
                const inIsland = Array.from(island.querySelectorAll(FOCUSABLES.dynamicIsland));
                const dropdown = Array.from(document.querySelectorAll('.sh-user-dropdown.open .sh-user-dropdown__item'));
                const viewRoot = document.querySelector('.sh-dashboard, .sh-library-view, #app') || document;
                const inView = Array.from(viewRoot.querySelectorAll('[data-nav-focusable="true"]'))
                    .filter(el => !island.contains(el));
                return [...inIsland, ...dropdown, ...inView];
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }

        // Asservissement de la sliding pill au focus

        this._eventBusOff = svc.eventBus()?.on('navigation:focusChanged', (evt) => {
            if (evt?.current?.classList?.contains('sh-nav-tab-btn')) {
                const targetView = evt.current.dataset.view;
                if (targetView && targetView !== this._currentView) {
                    this._updateSlidingPill(evt.current);
                }
            }
        });


        if (typeof window !== 'undefined' && window.SpaceHub) {
            window.SpaceHub.appLayout = this;
            if (!window.SpaceHub.ui) window.SpaceHub.ui = {};
            window.SpaceHub.ui.sidebar = this._sidebar;
            window.SpaceHub.ui.appLayout = this;
        }
    }

    get _auth() {
        return svc.auth();
    }

    _escape(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    render(container) {
        const user = this._auth?.getUser();
        const serverUrl = this._auth?.getServerUrl();
        const safeUserName = this._escape(user?.Name || 'Utilisateur');
        const safeServerUrl = this._escape(serverUrl || 'Jellyfin Server');
        const userAvatarUrl = user?.PrimaryImageTag && user?.Id && serverUrl
            ? `${serverUrl}/Users/${encodeURIComponent(user.Id)}/Images/Primary?quality=90`
            : null;
        const safeUserAvatarUrl = userAvatarUrl ? this._escape(userAvatarUrl) : '';

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
                                <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island" class="sh-nav-tab-btn ${this._currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                                    Accueil
                                </button>
                                <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island" class="sh-nav-tab-btn ${this._currentView === 'library' ? 'active' : ''}" data-view="library">
                                    Bibliothèques
                                </button>
                                <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island" class="sh-nav-tab-btn ${this._currentView === 'flux' || this._currentView === 'downloads' ? 'active' : ''}" data-view="flux">
                                    Flux
                                </button>
                            </div>

                            <div class="sh-nav-actions">
                                <button tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island" class="sh-nav-action-btn" id="sh-btn-quick-search" title="Recherche rapide (⌘K)">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                </button>

                                <div class="sh-user-menu-wrapper">

                                    <button class="sh-user-avatar-btn" id="sh-user-menu-btn" tabindex="0" data-nav-focusable="true" data-nav-scope="dynamic-island" title="${safeUserName}">
                                        <div class="sh-avatar-pill" ${safeUserAvatarUrl ? `style="background-image: url('${safeUserAvatarUrl}'); background-size: cover; background-position: center;"` : ''}>
                                            ${safeUserAvatarUrl ? '' : safeUserName.charAt(0).toUpperCase()}
                                        </div>
                                    </button>
                                    <div class="sh-user-dropdown" id="sh-user-dropdown" style="display:none;">
                                        <div class="sh-user-dropdown__header">
                                            <strong>${safeUserName}</strong>
                                            <span class="sh-user-server sh-truncate">${safeServerUrl}</span>
                                        </div>
                                        <hr style="border:none; border-top:1px solid rgba(var(--sh-ink, 255, 255, 255), 0.08); margin:10px 0;"/>
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
                                        <button tabindex="0" data-nav-focusable="true" class="sh-user-dropdown__item" id="sh-btn-open-admin" style="--item-idx: 4; ${user?.Policy?.IsAdministrator === true ? '' : 'display:none;'}">
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
        this._spatialNav = svc.nav() || svc.nav();
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

        // Exposé au moteur TV : le header peut être déployé au focus, sans souris.
        this._setIslandState = setIslandState;

        // Sans ceci, `setIslandState` n'était appelée QUE par mouseenter et click :
        // à la télécommande le dock restait compact, son contenu en visibility:hidden,
        // donc filtré comme invisible et définitivement inatteignable.
        this._islandFocusOff = svc.eventBus()?.on('navigation:focusChanged', (evt) => {
            const inIsland = Boolean(evt?.current?.closest?.('.sh-dynamic-island, #sh-dynamic-island'));
            if (inIsland && island?.classList.contains('sh-island--compact')) {
                setIslandState('expanded');
            } else if (!inIsland && island?.classList.contains('sh-island--expanded')
                       && !island.classList.contains('sh-island--search')) {
                setIslandState('compact');
            }
        });

        // Initialisation immédiate en mode Compact permanent
        setIslandState('compact');

                // Support tactile mobile (toggle au tap et fermeture au clic extérieur)
        island?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (island?.classList.contains('sh-island--compact')) {
                setIslandState('expanded');
            }
        });

        const onIslandOutsideClick = (e) => {
            if (island && !island.contains(e.target) && island.classList.contains('sh-island--expanded') && !island.classList.contains('sh-island--search')) {
                setIslandState('compact');
            }
        };
        document.addEventListener('click', onIslandOutsideClick);
        this._documentHandlers.push(['click', onIslandOutsideClick]);

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

        // Le menu utilisateur doit être ouvrable par le moteur de navigation
        // spatiale. C'était fait en collant une fonction sur la variable globale
        // (`window.SpaceHub._toggleUserDropdown`) : un pont invisible, que rien
        // ne déclarait et que rien ne vérifiait. Il devient un service nommé.
        svc.registry()?.register?.('ui.userDropdown', {
            toggle: (montrer) => toggleDropdown(montrer),
        }, { override: true });
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
                tabsPill.style.boxShadow = '0 6px 22px rgba(var(--sh-ink, 255, 255, 255),  0.60), 0 0 1px #ffffff';

                _pillSquashTimer = setTimeout(() => {
                    if (_activePillTarget === targetBtn) {
                        tabsPill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
                        tabsPill.style.boxShadow = '0 4px 14px rgba(var(--sh-ink, 255, 255, 255),  0.35)';
                    }
                }, 160);
            } else if (!animate) {
                tabsPill.style.transition = 'none';
                tabsPill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
                tabsPill.style.boxShadow = '0 4px 14px rgba(var(--sh-ink, 255, 255, 255),  0.35)';
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
            svc.search()?.open();
        });

        // Ouvrir / fermer dropdown utilisateur
        userBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        dropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const onDropdownOutsideClick = () => {
            if (dropdown && dropdown.style.display !== 'none') {
                toggleDropdown(false);
            }
        };
        document.addEventListener('click', onDropdownOutsideClick);
        this._documentHandlers.push(['click', onDropdownOutsideClick]);

        // Changer de thème depuis le menu utilisateur
        container.querySelector('#sh-btn-switch-theme')?.addEventListener('click', () => {
            const themes = svc.themes();
            if (themes) {
                themes.next();
                const currentId = themes.getCurrent();
                const available = themes.getAvailable();
                const currentTheme = available.find(t => t.id === currentId);
                svc.toaster()?.info?.(`Thème actif : ${currentTheme?.name || currentId}`);
            }
            toggleDropdown(false);
        });

        // Personnaliser l'accueil depuis le menu utilisateur
        container.querySelector('#sh-btn-customize-dashboard')?.addEventListener('click', () => {
            svc.settingsPanel()?.open?.('dashboard');
            toggleDropdown(false);
        });

        // Actualiser l'affichage depuis le menu utilisateur
        container.querySelector('#sh-btn-refresh-app')?.addEventListener('click', () => {
            svc.dashboard()?.render?.();
            svc.toaster()?.success?.('Affichage et widgets actualisés !');
            toggleDropdown(false);
        });

        // Ouvrir Mes Statistiques depuis le menu utilisateur
        container.querySelector('#sh-btn-open-analytics')?.addEventListener('click', () => {
            const analyticsModal = new AnalyticsModal();
            analyticsModal.open();
            toggleDropdown(false);
        });

        // Ouvrir Administration Serveur depuis le menu utilisateur.
        // Gelée par défaut : le bouton disparaît plutôt que d'ouvrir une vue
        // qui n'existe pas — un bouton mort est pire qu'un bouton absent.
        const boutonAdmin = container.querySelector('#sh-btn-open-admin');
        if (svc.features()?.isEnabled?.('features.adminConsole') === false) {
            boutonAdmin?.remove();
        } else {
            boutonAdmin?.addEventListener('click', () => {
                const adminView = svc.adminDashboard() || new AdminDashboardView();
                adminView.open();
                toggleDropdown(false);
            });
        }

        // Réglages depuis le menu utilisateur
        container.querySelector('#sh-btn-open-settings')?.addEventListener('click', () => {
            svc.settingsPanel()?.open();
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

    _unbindEvents() {
        this._documentHandlers.forEach(([event, handler]) => document.removeEventListener(event, handler));
        this._documentHandlers = [];
        this._eventBusOff?.();
        this._eventBusOff = null;
        if (this._pillSquashTimer) {
            clearTimeout(this._pillSquashTimer);
            this._pillSquashTimer = null;
        }
        svc.registry()?.register?.('ui.userDropdown', null, { override: true });
        this._setIslandState = null;
    }

    destroy() {
        this._navigationId += 1;
        this._unbindEvents();
        if (this._clockInterval) {
            clearInterval(this._clockInterval);
            this._clockInterval = null;
        }
        Object.values(this._views).forEach(view => view?.destroy?.());
        this._sidebar?.destroy?.();
        this._spatialNav = null; // Déréférencement local pur sans détruire le singleton
        window.SpaceHub && delete window.SpaceHub.appLayout;
    }

    navigate(viewName, params = {}) {
        const run = () => this._navigateInternal(viewName, params);
        this._navigationQueue = this._navigationQueue.catch(() => {}).then(run);
        return this._navigationQueue;
    }

    async _navigateInternal(viewName, params = {}) {
        const navigationId = ++this._navigationId;
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

        const previousView = this._currentView;
        if (previousView === 'dashboard' && normalizedView !== 'dashboard') {
            // Annuler proprement les requêtes/rendus du dashboard avant de
            // remplacer son conteneur par une autre vue.
            svc.dashboard()?.destroy?.();
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
            await svc.dashboard()?.render(container, params);
        } else if (normalizedView === 'library') {
            await this._views.library.render(container, params);
        } else if (normalizedView === 'flux' || normalizedView === 'downloads') {
            await this._views.downloads.render(container, params);
        }

        // Une réponse lente d'une ancienne navigation ne doit jamais prendre la main.
        if (navigationId !== this._navigationId) {
            return;
        }

        const spatialNav = this._spatialNav || svc.nav() || svc.nav();
        spatialNav?.focusFirst?.(normalizedView === 'flux' ? 'downloads' : normalizedView);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans AppLayout.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default AppLayout;
