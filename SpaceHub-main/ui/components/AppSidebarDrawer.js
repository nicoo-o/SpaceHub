/**
 * SpaceHub — Ghost Sidebar Drawer (Pure OLED Translucent Glass & Animated Liquid Capsule)
 * Version: 3.2.0
 *
 * Navigation latérale 100% monochrome, épurée et invisible au repos.
 * - Fond Noir Translucide Glass (rgba(0, 0, 0, 0.72) + blur(48px)) laissant délicatement transparaître l'arrière-plan.
 * - Capsule active blanche Apple animée (Liquid Spring Sliding Tracker) qui glisse avec fluidité d'un onglet à l'autre.
 * - Synchronisation bidirectionnelle instantanée avec la navigation (Accueil, Films, Séries, Animés, etc.).
 * - 100% Icônes Vectorielles SVG SF Symbols (zéro emoji).
 * - Contrôleur Ambilight & Lumières connecté intégré.
 * - Raccourcis Administration Serveur & Téléchargements.
 */

'use strict';

import AdminDashboardView from '../views/AdminDashboardView.js';

class AppSidebarDrawer {
    constructor() {
        this._isOpen = false;
        this._drawerEl = null;
        this._currentActiveNav = 'dashboard';
        this._currentActiveParams = {};
        this._ambilightPrefs = this._loadAmbilightPrefs();
        this._injectStyles();

        const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('sidebar', () => {
                const drawer = document.querySelector('.sh-sidebar-drawer, .sh-sidebar--open');
                if (!drawer) return [];
                return Array.from(drawer.querySelectorAll('.sh-sidebar-item, .sh-sidebar-btn, [data-nav-focusable="true"]'));
            });
        }

    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    get _api() {
        return window.SpaceHub?.jellyfin?.api;
    }

    _loadAmbilightPrefs() {
        try {
            const saved = localStorage.getItem('sh_ambilight_prefs');
            return saved ? JSON.parse(saved) : {
                enabled: true,
                intensity: 80,
                preset: 'dynamic',
                syncVideo: true
            };
        } catch {
            return { enabled: true, intensity: 80, preset: 'dynamic', syncVideo: true };
        }
    }

    _saveAmbilightPrefs() {
        try {
            localStorage.setItem('sh_ambilight_prefs', JSON.stringify(this._ambilightPrefs));
        } catch { /* ignore */ }
    }

    render(container = document.body) {
        if (document.getElementById('sh-sidebar-drawer')) return;

        const drawerEl = document.createElement('div');
        drawerEl.id = 'sh-sidebar-drawer';
        drawerEl.className = 'sh-sidebar';
        drawerEl.innerHTML = `
            <!-- Zone fantôme de détection sur le bord gauche -->
            <div class="sh-sidebar-trigger-zone" id="sh-sidebar-trigger">
                <div class="sh-sidebar-trigger-glow"></div>
            </div>

            <!-- Panneau latéral Glissant Noir Translucide Glass -->
            <aside class="sh-sidebar-panel" id="sh-sidebar-panel">
                <!-- En-tête : Logo SpaceHub Monochrome -->
                <div class="sh-sidebar-header">
                    <div class="sh-sidebar-brand">
                        <div class="sh-sidebar-luminous-dot" title="SpaceHub Active">
                            <div class="sh-sidebar-dot-core"></div>
                        </div>
                        <svg class="sh-sidebar-rocket-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                        </svg>
                        <span class="sh-sidebar-brand-title">SpaceHub</span>
                    </div>
                </div>

                <!-- Navigation Déroulante Épurée avec Tracker de Capsule Blanche Glissante -->
                <nav class="sh-sidebar-nav" id="sh-sidebar-nav">
                    <!-- Indicateur Coulissant de Capsule Active Apple TV -->
                    <div class="sh-sidebar-active-indicator" id="sh-sidebar-active-indicator"></div>

                    <!-- NAVIGATION PRINCIPALE -->
                    <div class="sh-sidebar-section">
                        <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item active" data-nav="dashboard">
                            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                <polyline points="9 22 9 12 15 12 15 22"></polyline>
                            </svg>
                            <span>Accueil</span>
                        </button>
                    </div>

                    <!-- MÉDIATHÈQUES SYNCHRONISÉES -->
                    <div class="sh-sidebar-section" id="sh-sidebar-libraries-section">
                        <div class="sh-sidebar-dynamic-libs" id="sh-sidebar-dynamic-libs">
                            <div tabindex="0" data-nav-focusable="true" class="sh-sidebar-item-loading">Chargement...</div>
                        </div>
                    </div>

                    <div class="sh-sidebar-divider"></div>

                    <!-- EXPÉRIENCE & SERVICES -->
                    <div class="sh-sidebar-section">
                        <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item sh-sidebar-btn" id="sh-sidebar-btn-lights">
                            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
                                <path d="M9 18h6"></path>
                                <path d="M10 22h4"></path>
                            </svg>
                            <span>Ambilight & Lumières</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item sh-sidebar-btn" id="sh-sidebar-btn-downloads">
                            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            <span>Flux & Contrôle</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item sh-sidebar-btn" id="sh-sidebar-btn-admin" style="${this._auth?.getUser?.()?.Policy?.IsAdministrator === true ? '' : 'display:none;'}">
                            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            <span>Administration</span>
                        </button>
                    </div>
                </nav>

                <!-- PIED FIXE : RECHERCHE & RÉGLAGES -->
                <div class="sh-sidebar-footer">
                    <button class="sh-sidebar-footer-btn" id="sh-sidebar-btn-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <span>Rechercher</span>
                        <kbd>⌘K</kbd>
                    </button>

                    <button class="sh-sidebar-footer-btn" id="sh-sidebar-btn-settings">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        <span>Réglages</span>
                    </button>
                </div>
            </aside>
        `;

        this._drawerEl = drawerEl;
        container.appendChild(drawerEl);
        this._bindEvents(drawerEl);
        this._loadDynamicLibraries(drawerEl);
    }

    /** Ouvre ou ferme le drawer pour les commandes Menu de la télécommande. */
    toggle() {
        if (!this._drawerEl) return;
        const panel = this._drawerEl.querySelector('#sh-sidebar-panel');
        if (!panel) return;

        if (this._isOpen) {
            this._closePanel?.();
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            spatialNav?.restorePreviousFocus?.();
            return;
        }

        panel.classList.add('open');
        this._isOpen = true;
        const firstItem = panel.querySelector('.sh-sidebar-item.active, .sh-sidebar-item:not(.sh-sidebar-item-loading), .sh-sidebar-footer-btn');
        const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
        if (firstItem) {
            spatialNav?.setFocus?.(firstItem, { reason: 'sidebar-open', instantScroll: true });
        }
        const activeEl = panel.querySelector('.sh-sidebar-item.active');
        if (activeEl) requestAnimationFrame(() => this._updateActiveIndicator(activeEl, false));
    }

    open() {
        if (!this._isOpen) this.toggle();
    }

    close() {
        if (this._isOpen) this.toggle();
    }

    _getLibrarySvgIcon(lib) {
        const rawType = (lib.CollectionType || lib.Type || '').toLowerCase();
        const name = (lib.Name || '').toLowerCase();

        if (rawType.includes('movie')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                </svg>
            `;
        }
        if (name.includes('anime')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>
                </svg>
            `;
        }
        if (rawType.includes('tv') || rawType.includes('series')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect>
                    <polyline points="17 2 12 7 7 2"></polyline>
                </svg>
            `;
        }
        if (rawType.includes('boxset')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m2 9 10-5 10 5-10 5Z"></path>
                    <path d="m2 14 10 5 10-5"></path>
                    <path d="m2 19 10 5 10-5"></path>
                </svg>
            `;
        }
        if (rawType.includes('music')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
            `;
        }
        if (rawType.includes('playlist')) {
            return `
                <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15V6"></path>
                    <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path>
                    <path d="M12 12H3"></path>
                    <path d="M16 6H3"></path>
                    <path d="M12 18H3"></path>
                </svg>
            `;
        }
        return `
            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
            </svg>
        `;
    }

    async _loadDynamicLibraries(drawerEl) {
        const libsContainer = drawerEl.querySelector('#sh-sidebar-dynamic-libs');
        if (!libsContainer) return;

        try {
            let views = await this._api?.getUserViews?.();
            if (!views || views.length === 0) {
                const apiClient = window.SpaceHub?.core?.api?.getClient('jellyfin');
                const rawViews = await window.ApiClient?.getUserViews?.(apiClient?.getUserId?.() || this._api?.getUserId?.());
                views = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
            }

            // Filtrage des bibliothèques désactivées
            const hiddenIds = new Set(JSON.parse(localStorage.getItem('sh_library_hidden_ids') || '[]'));
            if (hiddenIds.size > 0 && views && views.length > 0) {
                views = views.filter(v => !hiddenIds.has(v.Id));
            }

            // Tri personnalisé
            const order = JSON.parse(localStorage.getItem('sh_library_order') || '[]');
            if (order && order.length > 0 && views && views.length > 0) {
                const orderMap = new Map(order.map((id, index) => [id, index]));
                views.sort((a, b) => (orderMap.has(a.Id) ? orderMap.get(a.Id) : 999) - (orderMap.has(b.Id) ? orderMap.get(b.Id) : 999));
            }

            if (!views || views.length === 0) {
                drawerEl.querySelector('#sh-sidebar-libraries-section')?.remove();
                return;
            }

            libsContainer.innerHTML = views.map(lib => {
                const iconSvg = this._getLibrarySvgIcon(lib);
                const rawType = (lib.CollectionType || lib.Type || '').toLowerCase();
                return `
                    <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item sh-sidebar-btn" data-lib-id="${lib.Id}" data-lib-type="${rawType}">
                        ${iconSvg}
                        <span class="sh-truncate">${this._escape(lib.Name)}</span>
                    </button>
                `;
            }).join('');

            libsContainer.querySelectorAll('.sh-sidebar-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const libId = btn.dataset.libId;
                    this._justNavigated = true;
                    this.setActive('library', { libraryId: libId });
                    if (window.SpaceHub?.ui?.appLayout?.navigate) {
                        window.SpaceHub.ui.appLayout.navigate('library', { libraryId: libId });
                    }
                    // En mode TV, le choix doit rendre immédiatement le focus au contenu.
                    this._closePanel?.();
                });
            });

            // Mettre à jour l'indicateur sur l'item courant une fois les bibliothèques injectées
            this.setActive(this._currentActiveNav, this._currentActiveParams);

        } catch (e) {
            console.warn('[AppSidebarDrawer] Impossible de charger les bibliothèques:', e);
            drawerEl.querySelector('#sh-sidebar-libraries-section')?.remove();
        }
    }

    /**
     * 🚀 Déplace avec animation ressort la capsule blanche sur l'élément actif
     */
    _updateActiveIndicator(activeEl, animate = true) {
        if (!this._drawerEl) return;
        const nav = this._drawerEl.querySelector('#sh-sidebar-nav');
        const indicator = this._drawerEl.querySelector('#sh-sidebar-active-indicator');
        if (!nav || !indicator) return;

        if (!activeEl) {
            indicator.style.opacity = '0';
            return;
        }

        const navRect = nav.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const top = activeRect.top - navRect.top + nav.scrollTop;
        const height = activeRect.height;

        if (height <= 0) {
            // L'élément n'est pas encore visible (drawer fermé), mémorisation
            return;
        }

        if (!animate) {
            indicator.style.transition = 'none';
        } else {
            indicator.style.transition = 'transform 360ms cubic-bezier(0.16, 1, 0.3, 1), height 240ms ease, opacity 180ms ease';
        }

        indicator.style.transform = `translateY(${top}px)`;
        indicator.style.height = `${height}px`;
        indicator.style.opacity = '1';
    }

    /**
     * 🔄 Synchronise l'item actif avec la route / médiathèque courante
     */
    setActive(viewName, params = {}) {
        this._currentActiveNav = viewName;
        this._currentActiveParams = params;

        if (!this._drawerEl) return;
        const items = this._drawerEl.querySelectorAll('.sh-sidebar-item');
        items.forEach(i => i.classList.remove('active'));

        let target = null;
        if (viewName === 'dashboard' || viewName === 'home') {
            target = this._drawerEl.querySelector('.sh-sidebar-item[data-nav="dashboard"]');
        } else if (viewName === 'library') {
            if (params.libraryId) {
                target = this._drawerEl.querySelector(`.sh-sidebar-item[data-lib-id="${params.libraryId}"]`);
            } else if (params.targetType) {
                const btn = Array.from(this._drawerEl.querySelectorAll('.sh-sidebar-item[data-lib-id]')).find(b => {
                    const type = (b.dataset.libType || '').toLowerCase();
                    const name = (b.textContent || '').toLowerCase();
                    if (params.targetType === 'movies') return type.includes('movie') || name.includes('film');
                    if (params.targetType === 'series') return type.includes('tv') || type.includes('series') || name.includes('série');
                    if (params.targetType === 'music') return type.includes('music') || name.includes('musique');
                    return false;
                });
                target = btn || this._drawerEl.querySelector('.sh-sidebar-item[data-lib-id]');
            } else {
                target = this._drawerEl.querySelector('.sh-sidebar-item[data-lib-id]');
            }
        }

        if (target) {
            target.classList.add('active');
            requestAnimationFrame(() => {
                this._updateActiveIndicator(target, true);
            });
        } else {
            this._updateActiveIndicator(null, false);
        }
    }

    _bindEvents(el) {
        const trigger = el.querySelector('#sh-sidebar-trigger');
        const panel = el.querySelector('#sh-sidebar-panel');

        const openPanel = () => {
            panel.classList.add('open');
            this._isOpen = true;
            // Réajuster immédiatement la position de la capsule à l'ouverture
            const activeEl = panel.querySelector('.sh-sidebar-item.active');
            if (activeEl) {
                requestAnimationFrame(() => {
                    this._updateActiveIndicator(activeEl, false);
                });
            }
        };

        const closeImmediately = () => {
            panel.classList.remove('open');
            this._isOpen = false;
        };

        this._closePanel = closeImmediately;

        trigger?.addEventListener('mouseenter', openPanel);
        panel?.addEventListener('mouseenter', openPanel);

        // Fermeture instantanée et propre dès que la souris quitte la zone
        panel?.addEventListener('mouseleave', closeImmediately);
        trigger?.addEventListener('mouseleave', (e) => {
            if (!panel.contains(e.relatedTarget)) {
                closeImmediately();
            }
        });

        // Fermeture au clic en dehors (ex: clic sur la page)
        document.addEventListener('click', (e) => {
            if (this._isOpen && !panel.contains(e.target) && !trigger.contains(e.target)) {
                closeImmediately();
            }
        });

        // Navigation Principale (Accueil)
        el.querySelectorAll('.sh-sidebar-item[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = btn.dataset.nav;
                if (nav) {
                    this.setActive(nav);
                    if (window.SpaceHub?.ui?.appLayout?.navigate) {
                        window.SpaceHub.ui.appLayout.navigate(nav);
                    }
                    this._closePanel?.();
                }
            });
        });

        // Bouton Lumières & Ambilight
        el.querySelector('#sh-sidebar-btn-lights')?.addEventListener('click', () => {
            this._openAmbilightModal();
            closeImmediately();
        });

        // Bouton Téléchargements (*arr / Torrents / Flux)
        el.querySelector('#sh-sidebar-btn-downloads')?.addEventListener('click', () => {
            this.setActive('downloads');
            if (window.SpaceHub?.ui?.appLayout?.navigate) {
                window.SpaceHub.ui.appLayout.navigate('downloads');
            }
            closeImmediately();
        });

        // Bouton Administration Serveur
        el.querySelector('#sh-sidebar-btn-admin')?.addEventListener('click', () => {
            this._openAdminDashboard();
            closeImmediately();
        });

        // Actions footer (Recherche Spotlight & Réglages)
        el.querySelector('#sh-sidebar-btn-search')?.addEventListener('click', () => {
            window.SpaceHub?.jellyfin?.search?.open();
            closeImmediately();
        });

        el.querySelector('#sh-sidebar-btn-settings')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.settingsPanel?.open();
            closeImmediately();
        });
    }

    /**
     * 💡 Ouvre le contrôleur d'Ambilight & Lumières Connectées en Verre Dépoli VisionOS
     */
    _openAmbilightModal() {
        document.getElementById('sh-ambilight-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-ambilight-modal';
        modal.className = 'sh-sidebar-modal-overlay';
        modal.innerHTML = `
            <div class="sh-sidebar-modal-card">
                <div class="sh-sidebar-modal-header">
                    <div>
                        <div class="sh-sidebar-modal-badge">DOMOTIQUE & AMBIANCE</div>
                        <h2 class="sh-sidebar-modal-title">Ambilight & Lumières</h2>
                        <p class="sh-sidebar-modal-subtitle">Contrôlez l'ambiance lumineuse synchronisée de votre salon pendant la lecture.</p>
                    </div>
                    <button class="sh-sidebar-modal-close" id="sh-ambilight-close">✕</button>
                </div>

                <div class="sh-sidebar-modal-body sh-scrollbar">
                    <!-- Toggle Principal Ambilight -->
                    <div class="sh-ambilight-card">
                        <div class="sh-ambilight-card-info">
                            <div>
                                <div class="sh-ambilight-card-title">Ambilight Dynamique Vidéo</div>
                                <div class="sh-ambilight-card-sub">Synchronise les couleurs de vos LED avec l'écran vidéo en direct</div>
                            </div>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-ambilight-toggle" ${this._ambilightPrefs.enabled ? 'checked' : ''}/>
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>

                    <!-- Sélecteur d'ambiance / Presets -->
                    <div class="sh-ambilight-section-label">AMBIANCES & TEINTES CINÉMA</div>
                    <div class="sh-ambilight-presets-grid">
                        <div class="sh-ambilight-preset ${this._ambilightPrefs.preset === 'dynamic' ? 'active' : ''}" data-preset="dynamic">
                            <span class="sh-preset-glow" style="background: linear-gradient(135deg, #ffffff, #666666);"></span>
                            <span class="sh-preset-name">Dynamique Vidéo</span>
                        </div>
                        <div class="sh-ambilight-preset ${this._ambilightPrefs.preset === 'warm_white' ? 'active' : ''}" data-preset="warm_white">
                            <span class="sh-preset-glow" style="background: #ffa834;"></span>
                            <span class="sh-preset-name">Blanc Chaud (2700K)</span>
                        </div>
                        <div class="sh-ambilight-preset ${this._ambilightPrefs.preset === 'night_blue' ? 'active' : ''}" data-preset="night_blue">
                            <span class="sh-preset-glow" style="background: #0070f3;"></span>
                            <span class="sh-preset-name">Bleu Nuit Océan</span>
                        </div>
                        <div class="sh-ambilight-preset ${this._ambilightPrefs.preset === 'cinema_red' ? 'active' : ''}" data-preset="cinema_red">
                            <span class="sh-preset-glow" style="background: #e50914;"></span>
                            <span class="sh-preset-name">Rouge Dolby</span>
                        </div>
                        <div class="sh-ambilight-preset ${this._ambilightPrefs.preset === 'cyberpunk' ? 'active' : ''}" data-preset="cyberpunk">
                            <span class="sh-preset-glow" style="background: linear-gradient(135deg, #00f2fe, #4facfe);"></span>
                            <span class="sh-preset-name">Cyberpunk</span>
                        </div>
                    </div>

                    <!-- Slider d'Intensité -->
                    <div class="sh-ambilight-section-label">LUMINOSITÉ & INTENSITÉ (${this._ambilightPrefs.intensity}%)</div>
                    <input type="range" class="sh-ambilight-slider" id="sh-ambilight-slider" min="10" max="100" value="${this._ambilightPrefs.intensity}"/>
                </div>

                <div class="sh-sidebar-modal-footer">
                    <button class="sh-sidebar-modal-btn-pri" id="sh-ambilight-done">Enregistrer</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.add('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            spatialNav?.onModalOpened?.(modal, modal.querySelector('#sh-ambilight-toggle'));
        });

        const closeModal = () => {
            modal.classList.remove('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            spatialNav?.onModalClosed?.();
            setTimeout(() => modal.remove(), 240);
        };

        modal.querySelector('#sh-ambilight-close')?.addEventListener('click', closeModal);
        modal.querySelector('#sh-ambilight-done')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Toggles & Presets handlers
        const toggle = modal.querySelector('#sh-ambilight-toggle');
        const slider = modal.querySelector('#sh-ambilight-slider');
        const label = modal.querySelector('.sh-ambilight-section-label:nth-of-type(2)');

        toggle?.addEventListener('change', () => {
            this._ambilightPrefs.enabled = toggle.checked;
            this._saveAmbilightPrefs();
            window.SpaceHub?.ui?.components?.toaster?.success?.(`Ambilight : ${this._ambilightPrefs.enabled ? 'Activé' : 'Désactivé'}`);
        });

        slider?.addEventListener('input', (e) => {
            const val = e.target.value;
            this._ambilightPrefs.intensity = Number(val);
            if (label) label.textContent = `LUMINOSITÉ & INTENSITÉ (${val}%)`;
            this._saveAmbilightPrefs();
        });

        modal.querySelectorAll('.sh-ambilight-preset').forEach(presetEl => {
            presetEl.addEventListener('click', () => {
                modal.querySelectorAll('.sh-ambilight-preset').forEach(p => p.classList.remove('active'));
                presetEl.classList.add('active');
                this._ambilightPrefs.preset = presetEl.dataset.preset;
                this._saveAmbilightPrefs();
                window.SpaceHub?.ui?.components?.toaster?.info?.(`Ambiance appliquée : ${presetEl.querySelector('.sh-preset-name')?.textContent}`);
            });
        });
    }

    /**
     * 📥 Ouvre le gestionnaire centralisé des Téléchargements (*arr / qBittorrent / Jellyseerr / Bazarr)
     */
    async _openDownloadsModal() {
        document.getElementById('sh-downloads-hub-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-downloads-hub-modal';
        modal.className = 'sh-sidebar-modal-overlay';
        modal.innerHTML = `
            <div class="sh-sidebar-modal-card sh-downloads-hub-card">
                <div class="sh-sidebar-modal-header">
                    <div>
                        <div class="sh-sidebar-modal-badge">HUB DE GESTION & TÉLÉCHARGEMENTS</div>
                        <h2 class="sh-sidebar-modal-title">Centre de Téléchargements & Médias</h2>
                    </div>
                    <button class="sh-sidebar-modal-close" id="sh-downloads-close" aria-label="Fermer">✕</button>
                </div>

                <!-- Onglets de Navigation VisionOS -->
                <div class="sh-downloads-hub-tabs">
                    <button class="sh-hub-tab-btn active" data-tab="qbit">⚡ qBittorrent</button>
                    <button class="sh-hub-tab-btn" data-tab="jellyseerr">🍿 Jellyseerr</button>
                    <button class="sh-hub-tab-btn" data-tab="sonarr">📺 Séries (Sonarr)</button>
                    <button class="sh-hub-tab-btn" data-tab="radarr">🎬 Films (Radarr)</button>
                    <button class="sh-hub-tab-btn" data-tab="bazarr">📝 Sous-titres (Bazarr)</button>
                </div>

                <!-- Zone de Contenu Dynamique des Widgets -->
                <div class="sh-downloads-hub-body" id="sh-downloads-hub-body">
                    <div class="sh-hub-widget-slot" id="sh-hub-slot-1"></div>
                    <div class="sh-hub-widget-slot" id="sh-hub-slot-2" style="margin-top: 16px;"></div>
                </div>

                <div class="sh-sidebar-modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
                    <a href="${this._escape(window.SpaceHub?.core?.settings?.get('qbittorrent.url') || 'http://localhost:8080')}" target="_blank" class="sh-hub-ext-link" style="color: var(--sh-color-primary, #64d2ff); font-size: 12px; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                        <span>Ouvrir qBittorrent WebUI brute ↗</span>
                    </a>
                    <button class="sh-sidebar-modal-btn-pri" id="sh-downloads-done">Fermer</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.add('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            spatialNav?.onModalOpened?.(modal, modal.querySelector('.sh-hub-tab-btn.active'));
        });

        const closeModal = () => {
            modal.classList.remove('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            spatialNav?.onModalClosed?.();
            setTimeout(() => modal.remove(), 240);
        };

        modal.querySelector('#sh-downloads-close')?.addEventListener('click', closeModal);
        modal.querySelector('#sh-downloads-done')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Gestionnaire de changement d'onglet
        const slot1 = modal.querySelector('#sh-hub-slot-1');
        const slot2 = modal.querySelector('#sh-hub-slot-2');
        const dashboard = window.SpaceHub?.ui?.dashboard;

        const renderTab = async (tabKey) => {
            if (!slot1 || !slot2) return;
            slot1.innerHTML = '<p style="color:var(--sh-text-muted); text-align:center; padding: 24px;">Chargement du module...</p>';
            slot2.innerHTML = '';

            try {
                if (tabKey === 'qbit') {
                    const SpeedClass = dashboard?._registeredWidgets?.get('qbittorrent-speed');
                    const ActiveClass = dashboard?._registeredWidgets?.get('qbittorrent-active');
                    slot1.innerHTML = '';
                    if (SpeedClass) {
                        const speed = new SpeedClass();
                        await speed.render(slot1);
                    }
                    if (ActiveClass) {
                        const active = new ActiveClass();
                        await active.render(slot2);
                    }
                } else if (tabKey === 'jellyseerr') {
                    const ReqClass = dashboard?._registeredWidgets?.get('jellyseerr-requests');
                    const TrendClass = dashboard?._registeredWidgets?.get('jellyseerr-trending');
                    slot1.innerHTML = '';
                    if (ReqClass) {
                        const req = new ReqClass();
                        await req.render(slot1);
                    }
                    if (TrendClass) {
                        const trend = new TrendClass();
                        await trend.render(slot2);
                    }
                } else if (tabKey === 'sonarr') {
                    const UpClass = dashboard?._registeredWidgets?.get('sonarr-upcoming');
                    const QueueClass = dashboard?._registeredWidgets?.get('sonarr-queue');
                    slot1.innerHTML = '';
                    if (UpClass) {
                        const up = new UpClass();
                        await up.render(slot1);
                    }
                    if (QueueClass) {
                        const q = new QueueClass();
                        await q.render(slot2);
                    }
                } else if (tabKey === 'radarr') {
                    const UpClass = dashboard?._registeredWidgets?.get('radarr-upcoming');
                    const QueueClass = dashboard?._registeredWidgets?.get('radarr-queue');
                    slot1.innerHTML = '';
                    if (UpClass) {
                        const up = new UpClass();
                        await up.render(slot1);
                    }
                    if (QueueClass) {
                        const q = new QueueClass();
                        await q.render(slot2);
                    }
                } else if (tabKey === 'bazarr') {
                    const BazClass = dashboard?._registeredWidgets?.get('bazarr-wanted');
                    slot1.innerHTML = '';
                    if (BazClass) {
                        const baz = new BazClass();
                        await baz.render(slot1);
                    }
                }
            } catch (err) {
                console.error('[DownloadsHub] Erreur rendu onglet:', err);
                slot1.innerHTML = `<p style="color:var(--sh-color-error, #ff453a); text-align:center; padding: 20px;">Erreur : ${this._escape(err.message)}</p>`;
            }
        };

        modal.querySelectorAll('.sh-hub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.sh-hub-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderTab(btn.dataset.tab);
            });
        });

        // Rendu initial
        await renderTab('qbit');
    }

    /**
     * 🛡️ Accès au Centre d'Administration & Supervision Serveur SpaceHub
     */
    _openAdminDashboard() {
        const adminView = window.SpaceHub?.ui?.adminDashboard || new AdminDashboardView();
        adminView.open();
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    _injectStyles() {
        if (document.getElementById('sh-sidebar-drawer-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-sidebar-drawer-styles';
        style.textContent = `
/* ── Zone Fantôme de Détection Gauche ── */
.sh-sidebar-trigger-zone {
    position: fixed;
    top: 0;
    left: 0;
    width: 20px;
    height: 100vh;
    z-index: 290;
    background: transparent;
    pointer-events: auto;
}

.sh-sidebar-trigger-glow {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 2px;
    background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    opacity: 0;
    transition: opacity 280ms ease;
}

.sh-sidebar-trigger-zone:hover .sh-sidebar-trigger-glow {
    opacity: 1;
}

/* ── Panneau Latéral Glissant Noir Translucide Glass (Apple VisionOS / TV) ── */
.sh-sidebar-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: 270px;
    height: 100vh;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(48px) saturate(190%);
    -webkit-backdrop-filter: blur(48px) saturate(190%);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 300;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 24px 16px;
    transform: translateX(-100%);
    transition: transform 340ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 340ms ease;
    box-shadow: 20px 0 60px rgba(0, 0, 0, 0.85);
    overflow-x: hidden !important;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
}

.sh-sidebar-panel::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}

.sh-sidebar-panel.open {
    transform: translateX(0);
}

/* ── En-tête : Logo Monochrome ── */
.sh-sidebar-header {
    margin-bottom: 20px;
    padding-left: 8px;
}

.sh-sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #ffffff;
    cursor: default;
    user-select: none;
}

.sh-sidebar-brand:hover .sh-sidebar-rocket-icon {
    transform: translateY(-2px) rotate(-8deg) scale(1.15);
    stroke: #ffffff;
}

.sh-sidebar-rocket-icon {
    transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), stroke 200ms ease;
}

.sh-sidebar-luminous-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-sidebar-dot-core {
    width: 3.5px;
    height: 3.5px;
    border-radius: 50%;
    background: #ffffff;
    animation: sh-pulse-dot 2s infinite ease-in-out;
}

@keyframes sh-pulse-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.5; }
}

.sh-sidebar-brand-title {
    font-size: 18px;
    font-weight: 750;
    letter-spacing: -0.03em;
    color: #ffffff;
}

/* ── Navigation List avec Capsule Coulissante ── */
.sh-sidebar-nav {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
    padding-right: 2px;
}

.sh-sidebar-nav::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}

/* 🌟 Indicateur Coulissant Apple TV (Liquid Spring Slider) 🌟 */
.sh-sidebar-active-indicator {
    position: absolute;
    left: 0;
    right: 0;
    height: 40px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 22px rgba(255, 255, 255, 0.38), 0 1px 3px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    z-index: 1;
    transform: translateY(0);
    transition: transform 320ms cubic-bezier(0.19, 1, 0.22, 1), height 220ms ease, opacity 180ms ease;
    opacity: 0;
}

.sh-sidebar-section {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.sh-sidebar-dynamic-libs {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.sh-sidebar-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
    margin: 10px 8px;
    position: relative;
    z-index: 2;
}

.sh-sidebar-item {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.65);
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 550;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
    transition: color 200ms ease, background-color 200ms ease;
}

.sh-sidebar-item:active {
    transform: scale(0.97);
}

.sh-sidebar-icon {
    stroke: rgba(255, 255, 255, 0.65);
    flex-shrink: 0;
    transition: stroke 200ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-sidebar-item-loading {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.35);
    padding: 8px 14px;
}

.sh-sidebar-item:hover:not(.active) {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
}

.sh-sidebar-item:hover:not(.active) .sh-sidebar-icon {
    stroke: #ffffff;
    transform: scale(1.12);
}

/* 🌟 Élément Sélectionné traversé par la Capsule Blanche 🌟 */
.sh-sidebar-item.active {
    color: #000000 !important;
    font-weight: 750;
    background: transparent !important;
    transform: none !important;
}

.sh-sidebar-item.active .sh-sidebar-icon {
    stroke: #000000 !important;
}

/* ── Pied de Sidebar : Capsules Verre Fixes ── */
.sh-sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.sh-sidebar-footer-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 11px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-sidebar-footer-btn svg {
    stroke: rgba(255, 255, 255, 0.75);
    transition: stroke 140ms ease;
}

.sh-sidebar-footer-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    transform: translateY(-1.5px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}

.sh-sidebar-footer-btn:active {
    transform: scale(0.97);
}

.sh-sidebar-footer-btn:hover svg {
    stroke: #ffffff;
}

.sh-sidebar-footer-btn kbd {
    margin-left: auto;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 2px 5px;
    border-radius: 5px;
    color: rgba(255, 255, 255, 0.65);
    font-family: inherit;
}

/* ── Modales Spéciales (Ambilight / Lights) ── */
.sh-sidebar-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(30px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    opacity: 0;
    pointer-events: none;
    transition: opacity 200ms ease;
}

.sh-sidebar-modal-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

.sh-sidebar-modal-card {
    width: 100%;
    max-width: 460px;
    max-height: 85vh;
    background: rgba(12, 12, 14, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 22px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.94) translateY(10px);
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-sidebar-modal-overlay.open .sh-sidebar-modal-card {
    transform: scale(1) translateY(0);
}

.sh-sidebar-modal-header {
    padding: 20px 22px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.sh-sidebar-modal-badge {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 3px;
}

.sh-sidebar-modal-title {
    font-size: 19px;
    font-weight: 750;
    color: #ffffff;
    margin: 0 0 3px;
}

.sh-sidebar-modal-subtitle {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.50);
    margin: 0;
    line-height: 1.35;
}

.sh-sidebar-modal-close {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.10);
    color: #ffffff;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-sidebar-modal-close:hover {
    background: rgba(255, 255, 255, 0.16);
}

.sh-sidebar-modal-body {
    padding: 16px 22px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.sh-ambilight-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
}

.sh-ambilight-card-title {
    font-size: 13.5px;
    font-weight: 650;
    color: #ffffff;
}

.sh-ambilight-card-sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 2px;
}

.sh-ambilight-section-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.40);
    margin-top: 4px;
}

.sh-ambilight-presets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
}

.sh-ambilight-preset {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-ambilight-preset:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.14);
}

.sh-ambilight-preset.active {
    background: rgba(255, 255, 255, 0.10);
    border-color: #ffffff;
}

.sh-preset-glow {
    width: 20px;
    height: 20px;
    border-radius: 50%;
}

.sh-preset-name {
    font-size: 10.5px;
    font-weight: 600;
    color: #ffffff;
    text-align: center;
}

.sh-ambilight-slider {
    width: 100%;
    accent-color: #ffffff;
    cursor: pointer;
}

.sh-sidebar-modal-footer {
    padding: 14px 22px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

.sh-sidebar-modal-btn-pri {
    background: #ffffff;
    border: none;
    border-radius: 9999px;
    color: #000000;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 20px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.25);
    transition: all 140ms ease;
}

.sh-sidebar-modal-btn-pri:hover {
    transform: scale(1.02);
}

/* ── Centre de Téléchargements & Médias (Hub) ── */
.sh-downloads-hub-card {
    max-width: 960px !important;
    width: 90vw !important;
    max-height: 86vh !important;
    display: flex;
    flex-direction: column;
}

.sh-downloads-hub-tabs {
    display: flex;
    gap: 8px;
    margin: 14px 0 16px 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
}
.sh-downloads-hub-tabs::-webkit-scrollbar {
    display: none;
}

.sh-hub-tab-btn {
    padding: 8px 18px;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    backdrop-filter: blur(16px);
}

.sh-hub-tab-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    transform: translateY(-1px);
}

.sh-hub-tab-btn.active {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.38);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.sh-downloads-hub-body {
    flex: 1;
    overflow-y: auto;
    padding-right: 6px;
    max-height: 56vh;
}
.sh-downloads-hub-body::-webkit-scrollbar {
    width: 6px;
}
.sh-downloads-hub-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 9999px;
}
        `;
        document.head.appendChild(style);
    }
}

export default AppSidebarDrawer;
