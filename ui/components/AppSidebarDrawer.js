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
import { LAYERS, FOCUSABLES } from '../../core/DomContracts.js';

import './AppSidebarDrawer.css';
import * as svc from '../../core/services.js';
class AppSidebarDrawer {
    constructor() {
        this._isOpen = false;
        this._drawerEl = null;
        this._currentActiveNav = 'dashboard';
        this._currentActiveParams = {};
        this._ambilightPrefs = this._loadAmbilightPrefs();
        this._injectStyles();

        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('sidebar', () => {
                // Le panneau ouvert est #sh-sidebar-panel.open (cf. DomContracts.LAYERS.sidebar).
                // L'ancien selecteur .sh-sidebar-drawer / .sh-sidebar--open ne matchait rien :
                // ce provider renvoyait toujours une liste vide.
                const panel = document.querySelector(LAYERS.sidebar) || document.getElementById('sh-sidebar-panel');
                if (!panel) return [];
                return Array.from(panel.querySelectorAll(FOCUSABLES.sidebar));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }

    }

    get _auth() {
        return svc.auth();
    }

    get _api() {
        return svc.jellyfinApi();
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
                        ${svc.features()?.isEnabled?.('features.ambilight') === false ? '' : `
                        <button tabindex="0" data-nav-focusable="true" class="sh-sidebar-item sh-sidebar-btn" id="sh-sidebar-btn-lights">
                            <svg class="sh-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
                                <path d="M9 18h6"></path>
                                <path d="M10 22h4"></path>
                            </svg>
                            <span>Ambilight & Lumières</span>
                        </button>`}
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
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.restorePreviousFocus?.();
            return;
        }

        panel.classList.add('open');
        this._isOpen = true;
        const firstItem = panel.querySelector('.sh-sidebar-item.active, .sh-sidebar-item:not(.sh-sidebar-item-loading), .sh-sidebar-footer-btn');
        const spatialNav = svc.nav() || svc.nav();
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
                const apiClient = svc.api()?.getClient('jellyfin');
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
                    if (svc.appLayout()?.navigate) {
                        svc.appLayout().navigate('library', { libraryId: libId });
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
        // Audit 3.9 — un AbortController par cycle de rendu.
        // Le drawer est reconstruit à chaque montage de l'AppLayout (connexion,
        // changement de vue) : sans cela, chaque reconstruction ajoutait un
        // écouteur « clic » de plus sur `document`, jamais retiré, et la
        // fermeture au clic extérieur se déclenchait N fois.
        this._ac?.abort();
        this._ac = new AbortController();
        const signal = this._ac.signal;

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
        }, { signal });

        // Navigation Principale (Accueil)
        el.querySelectorAll('.sh-sidebar-item[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = btn.dataset.nav;
                if (nav) {
                    this.setActive(nav);
                    if (svc.appLayout()?.navigate) {
                        svc.appLayout().navigate(nav);
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
            if (svc.appLayout()?.navigate) {
                svc.appLayout().navigate('downloads');
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
            svc.search()?.open();
            closeImmediately();
        });

        el.querySelector('#sh-sidebar-btn-settings')?.addEventListener('click', () => {
            svc.settingsPanel()?.open();
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
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.onModalOpened?.(modal, modal.querySelector('#sh-ambilight-toggle'));
        });

        const closeModal = () => {
            modal.classList.remove('open');
            const spatialNav = svc.nav() || svc.nav();
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
            svc.toaster()?.success?.(`Ambilight : ${this._ambilightPrefs.enabled ? 'Activé' : 'Désactivé'}`);
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
                svc.toaster()?.info?.(`Ambiance appliquée : ${presetEl.querySelector('.sh-preset-name')?.textContent}`);
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
                    <a href="${this._escape(svc.settings()?.get('qbittorrent.url') || 'http://localhost:8080')}" target="_blank" class="sh-hub-ext-link" style="color: var(--sh-color-primary, #64d2ff); font-size: 12px; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                        <span>Ouvrir qBittorrent WebUI brute ↗</span>
                    </a>
                    <button class="sh-sidebar-modal-btn-pri" id="sh-downloads-done">Fermer</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.add('open');
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.onModalOpened?.(modal, modal.querySelector('.sh-hub-tab-btn.active'));
        });

        const closeModal = () => {
            modal.classList.remove('open');
            const spatialNav = svc.nav() || svc.nav();
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
        const dashboard = svc.dashboard();

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
        // Gelée : l'objet n'est pas instancié au démarrage. Sans ce garde-fou,
        // le repli `|| new AdminDashboardView()` la ressusciterait ici.
        if (svc.features()?.isEnabled?.('features.adminConsole') === false) {
            svc.toaster()?.info?.(
                "La console d'administration est gelée. Réglages → Fonctionnalités pour la rallumer.");
            return;
        }
        const adminView = svc.adminDashboard() || new AdminDashboardView();
        adminView.open();
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    /**
     * Démonte le drawer : coupe les écouteurs de `document` posés par
     * `_bindEvents`. Appelé par AppLayout.destroy().
     */
    destroy() {
        this._ac?.abort();
        this._ac = null;
        this._isOpen = false;
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans AppSidebarDrawer.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default AppSidebarDrawer;
