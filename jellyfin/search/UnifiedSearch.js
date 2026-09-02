/**
 * SpaceHub — Unified Search & Command Spotlight
 * Version: 2.0.0 (Dynamic Island Morph & Advanced Search Hub Edition)
 *
 * Moteur de recherche avancé & Palette de Navigation Universelle.
 * - Émergence fluide et organique directement depuis la Capsule Supérieure (Dynamic Island)
 * - Translucidité identique à la capsule (rgba(12, 12, 16, 0.92) + blur(50px) saturate(220%))
 * - Format mono-colonne ultra-aéré (Single-Pane, suppression de l'inspecteur d'aperçu lourd)
 * - Touche Entrée (↵) ou Clic : Ouvre systématiquement la fiche détaillée (ModalSlideUpSheet)
 * - Hub de Navigation complet (Accueil, Bibliothèques, Films, Séries, Musique, Réglages)
 */

'use strict';

import Logger from '../../core/Logger.js';

import './UnifiedSearch.css';
import * as svc from '../../core/services.js';
import inputRouter, { PRIORITES } from '../../core/InputRouter.js';
class UnifiedSearch {
    constructor() {
        // Confirmation du scope search dans le Focus Registry
        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('search', (container) => {
                const root = container || document.querySelector('.sh-unified-search--open') || document;
                return Array.from(root.querySelectorAll('.sh-spotlight-input, .sh-spotlight-tab-btn, .sh-spotlight-item, [data-nav-focusable="true"]'));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }
        this._log = new Logger('UnifiedSearch');
        this._overlay = null;
        this._spotlight = null;
        this._isOpen = false;
        this._debounceTimer = null;
        this._activeFilter = 'All';
        this._query = '';
        this._selectedIndex = 0;
        this._visibleItems = [];
        this._recentSearches = this._loadRecentSearches();
        this._currentSearchSeq = 0;

        this._setupKeyboardShortcut();
        this._injectStyles();
        this._log.info('Spotlight Capsule Edition Initialisé.');
    }

    get _apiClient() {
        return svc.api()?.getClient('jellyfin');
    }

    _loadRecentSearches() {
        try {
            const saved = localStorage.getItem('sh_spotlight_recents');
            return saved ? JSON.parse(saved) : ['Dune', 'Arcane', 'Interstellar'];
        } catch {
            return ['Dune', 'Arcane', 'Interstellar'];
        }
    }

    _saveRecentSearch(term) {
        if (!term || term.trim().length < 2) return;
        const clean = term.trim();
        this._recentSearches = [clean, ...this._recentSearches.filter(s => s.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
        try {
            localStorage.setItem('sh_spotlight_recents', JSON.stringify(this._recentSearches));
        } catch { /* ignore */ }
    }

    _clearRecentSearches() {
        this._recentSearches = [];
        try {
            localStorage.removeItem('sh_spotlight_recents');
        } catch { /* ignore */ }
    }

    _getNavigationItems() {
        return [
            {
                id: 'nav-home',
                Name: 'Accueil',
                title: 'Accueil',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
                sub: 'Tableau de bord principal',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.appLayout()?.navigate('home');
                    });
                }
            },
            {
                id: 'nav-libraries',
                Name: 'Bibliothèques',
                title: 'Bibliothèques',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`,
                sub: 'Explorer tous vos médias',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.appLayout()?.navigate('library');
                    });
                }
            },
            {
                id: 'nav-movies',
                Name: 'Films',
                title: 'Films',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`,
                sub: 'Longs-métrages & Cinéma',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.appLayout()?.navigate('movies');
                    });
                }
            },
            {
                id: 'nav-series',
                Name: 'Séries TV',
                title: 'Séries TV',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`,
                sub: 'Saisons & Épisodes complets',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.appLayout()?.navigate('series');
                    });
                }
            },
            {
                id: 'nav-music',
                Name: 'Musique & OST',
                title: 'Musique & OST',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
                sub: 'Bandes originales et albums',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.appLayout()?.navigate('music');
                    });
                }
            },
            {
                id: 'nav-settings',
                Name: 'Réglages SpaceHub',
                title: 'Réglages SpaceHub',
                Type: 'Navigation',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
                sub: 'Préférences & Clés API',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.settingsPanel()?.open();
                    });
                }
            }
        ];
    }

    _getSystemCommands() {
        return [
            {
                id: 'cmd-theme',
                Name: 'Changer de Thème',
                title: 'Changer de Thème',
                Type: 'Command',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`,
                sub: 'Basculer les ambiances visuelles',
                action: () => {
                    this._navigateAndDismiss(() => {
                        const themes = ['space-dark', 'cyberpunk', 'oled-black', 'aurora'];
                        const current = svc.settings()?.get('ui.theme', 'space-dark') || 'space-dark';
                        const next = themes[(themes.indexOf(current) + 1) % themes.length];
                        svc.themes()?.applyTheme(next);
                        svc.toaster()?.success(`Thème : ${next}`);
                    });
                }
            },
            {
                id: 'cmd-random',
                Name: 'Surprenez-moi !',
                title: 'Surprenez-moi !',
                Type: 'Command',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path></svg>`,
                sub: 'Lancer un média au hasard',
                action: () => {
                    this._navigateAndDismiss(() => {
                        svc.toaster()?.info('Sélection d\'un média aléatoire...');
                        const sampleItems = this._getDefaultCatalog();
                        const pick = sampleItems[Math.floor(Math.random() * sampleItems.length)];
                        setTimeout(() => {
                            svc.slideUpSheet()?.open(pick);
                        }, 80);
                    });
                }
            },
            {
                id: 'cmd-refresh',
                Name: 'Actualiser le Dashboard',
                title: 'Actualiser le Dashboard',
                Type: 'Command',
                icon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`,
                sub: 'Synchroniser tous les flux',
                action: () => {
                    this._navigateAndDismiss(() => {
                        const mainContainer = document.querySelector('#sh-main-view-container');
                        if (mainContainer) {
                            svc.dashboard()?.render(mainContainer);
                        }
                        svc.toaster()?.success('Dashboard actualisé');
                    });
                }
            }
        ];
    }

    async _getRecentMediaHighlights() {
        try {
            const api = svc.jellyfinApi();
            if (!api) return [];
            
            // 1. Essai sur les reprises en cours
            let items = await api.getResumeItems(5);
            // 2. Si pas de reprise, prendre les derniers ajouts
            if (!items || items.length === 0) {
                items = await api.getLatestItems({ limit: 5 });
            }
            // 3. Fallback sur les films
            if (!items || items.length === 0) {
                items = await api.getMovies({ limit: 5 });
            }

            return (items || []).map(item => ({
                ...item,
                title: item.Name,
                imageUrl: api.getImageUrl(item.Id, 'Primary', { maxWidth: 200, maxHeight: 300 }),
                backdropUrl: api.getImageUrl(item.Id, 'Backdrop', { maxWidth: 1200 }),
                duration: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000000 / 60) + ' min' : '',
                format: item.MediaStreams?.some(s => s.Width >= 3800) ? '4K UHD' : '1080p HD'
            }));
        } catch (e) {
            console.warn('[UnifiedSearch] Erreur récupération médias récents:', e);
            return [];
        }
    }

    _setupKeyboardShortcut() {
        // Le routeur d'entrée remplace une inscription portant le même nom :
        // le drapeau global qui protégeait autrefois d'une double inscription
        // n'a plus d'objet.
        inputRouter.inscrire('search', (e) => {
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

            // Ouvrir avec Ctrl+K ou Cmd+K ou « / » (hors champ de saisie).
            // Renvoyer `true` remplace l'ancien stopPropagation() : la touche
            // est consommée ici, elle ne redescend pas vers la navigation
            // spatiale — qui interpréterait « / » comme une frappe ordinaire.
            if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k') {
                e.preventDefault();
                if (svc.search()) svc.search().toggle();
                else this.toggle();
                return true;
            }
            if (e.key === '/' && !isTyping && !this._isOpen) {
                e.preventDefault();
                if (svc.search()) svc.search().open();
                else this.open();
                return true;
            }
            return false;
        }, { priorite: PRIORITES.search });
    }

    toggle() {
        if (this._isOpen) this.close();
        else this.open();
    }

        open() {
        const isEnabled = svc.settings()?.get('jellyfin.search.enabled', true);
        if (isEnabled === false) {
            this._log.debug('Recherche unifiée désactivée dans les paramètres.');
            return;
        }
        if (this._isOpen) return;

        // Signale l'ouverture au moteur de navigation, qui tient la pile des
        // couches. Sans cela la recherche n'y figurait pas : ouverte par-dessus
        // les réglages, un appui sur Échap fermait les RÉGLAGES en dessous et
        // laissait la recherche à l'écran.
        svc.nav()?.pushLayer?.('search');

        const island = document.getElementById('sh-dynamic-island');
        const underglow = document.getElementById('sh-island-underglow');
        this._prevIslandState = island?.classList.contains('sh-island--expanded') ? 'expanded' : 'compact';

        // 1. Étape 1 : Si le dock est compact, l'ouvrir d'abord en mode normal déployé
        const isCurrentlyCompact = island && !island.classList.contains('sh-island--expanded');
        if (island && isCurrentlyCompact) {
            island.classList.remove('sh-island--compact');
            island.classList.add('sh-island--expanded');
            if (underglow) {
                underglow.className = 'sh-island-underglow sh-underglow--expanded';
            }
        }

        // Animation subtile de mise en évidence sur l'icône de la loupe
        const loupeBtn = document.getElementById('sh-btn-quick-search');
        if (loupeBtn) {
            loupeBtn.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease';
            loupeBtn.style.transform = 'scale(1.22)';
            loupeBtn.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.6)';
            setTimeout(() => {
                loupeBtn.style.transform = '';
                loupeBtn.style.boxShadow = '';
            }, 280);
        }

        // Laisser le temps à l'œil humain d'admirer le dock s'ouvrir (320ms si compact, 60ms si déjà déployé)
        const transitionDelay = isCurrentlyCompact ? 320 : 60;

        setTimeout(() => {
            this._launchModalExpansion(island, loupeBtn);
        }, transitionDelay);
    }

    _createGenieBuffer(W, H) {
        const buffer = document.createElement('canvas');
        buffer.width = W;
        buffer.height = H;
        const ctx = buffer.getContext('2d');

        // Dessin vectoriel du modal avec verre dépoli, bordure spéculaire et contenu fidèle
        ctx.save();
        const r = 24;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(W - r, 0);
        ctx.quadraticCurveTo(W, 0, W, r);
        ctx.lineTo(W, H - r);
        ctx.quadraticCurveTo(W, H, W - r, H);
        ctx.lineTo(r, H);
        ctx.quadraticCurveTo(0, H, 0, H - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(13, 13, 18, 0.98)';
        ctx.fill();

        // Liseré spéculaire fin blanc éclatant
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.stroke();

        // Reflet supérieur
        const grad = ctx.createLinearGradient(0, 0, 0, 65);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();

        // Barre de recherche simulée
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(18, 14, W - 36, 42);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
        ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('🔍  Rechercher un film, une série, ou naviguer...', 32, 40);

        // Pastilles de filtre simulées
        const filterX = W - 230;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(filterX, 22, 42, 24);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(filterX + 50, 22, 50, 24);
        ctx.fillRect(filterX + 108, 22, 52, 24);

        // Ligne de séparation
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(0, 70);
        ctx.lineTo(W, 70);
        ctx.stroke();

        // Lignes de contenu simulées avec contrastes
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(20, 95 + i * 58, W - 40, 48);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.fillRect(32, 107 + i * 58, 30, 24);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
            ctx.fillRect(72, 110 + i * 58, 140, 10);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.fillRect(72, 126 + i * 58, 90, 8);
        }
        ctx.restore();

        return buffer;
    }

    _playGenieAnimation(direction, onComplete) {
        let canvas = document.getElementById('sh-genie-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'sh-genie-canvas';
            canvas.style.cssText = 'position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:10002;';
            document.body.appendChild(canvas);
        }

        const dpr = window.devicePixelRatio || 1;
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        canvas.width = viewW * dpr;
        canvas.height = viewH * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const modalW = Math.min(680, viewW * 0.92);
        const modalH = Math.min(510, viewH * 0.80);
        const targetX = (viewW - modalW) / 2;
        const targetY = (viewH - modalH) / 2;

        const loupeX = this._loupeOrigin?.x || (viewW / 2 + 180);
        const loupeY = this._loupeOrigin?.y || 38;
        const loupeW = 28;

        const buffer = this._createGenieBuffer(modalW, modalH);

        const duration = direction === 'open' ? 620 : 480;
        const startTime = performance.now();
        const numSlices = 52;
        const sliceH = modalH / numSlices;
        const lag = 0.52; // Courbure liquide prononcée et spectaculaire

        // Easing cubique fluide Apple
        const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
        const easeInCubic = (x) => x * x * x;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            let progress = Math.min(1, elapsed / duration);
            if (direction === 'close') progress = 1 - progress;

            ctx.clearRect(0, 0, viewW, viewH);

            // Halo lumineux d'éjection à la position de la loupe
            if (direction === 'open' && progress < 0.55) {
                const beamAlpha = (1 - progress / 0.55) * 0.85;
                const beamGrad = ctx.createRadialGradient(loupeX, loupeY, 2, loupeX, loupeY, 36);
                beamGrad.addColorStop(0, `rgba(56, 189, 248, ${beamAlpha})`);
                beamGrad.addColorStop(0.4, `rgba(255, 255, 255, ${beamAlpha * 0.9})`);
                beamGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.arc(loupeX, loupeY, 36, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1.0; // 100% de contraste dès la 1ère milliseconde

            for (let i = 0; i < numSlices; i++) {
                const v = i / numSlices; // 0 = haut de la fenêtre, 1 = bas de la fenêtre

                // Construction du bas vers le haut : la base sort en premier de la loupe
                const sliceT = Math.max(0, Math.min(1, (progress - (1 - v) * lag) / (1 - lag)));
                const e = direction === 'open' ? easeOutCubic(sliceT) : easeInCubic(sliceT);

                // Largeur de la tranche : entonnoir continu
                const currentW = loupeW + (modalW - loupeW) * e;

                // Position X centrale : courbe dynamique vers le centre
                const currentCenterX = loupeX + ((targetX + modalW / 2) - loupeX) * e;

                // Position Y : le haut s'étire vers targetY, le bas reste collé à loupeY
                const currentY = loupeY + ((targetY + i * sliceH) - loupeY) * e;

                const currentX = currentCenterX - currentW / 2;

                if (currentW > 1.5) {
                    ctx.drawImage(
                        buffer,
                        0, i * sliceH, modalW, sliceH,
                        currentX, currentY, currentW, sliceH + 0.9
                    );
                }
            }

            if ((direction === 'open' && elapsed < duration) || (direction === 'close' && elapsed < duration)) {
                requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, viewW, viewH);
                if (direction === 'close') {
                    canvas.remove();
                }
                if (onComplete) onComplete();
            }
        };

        requestAnimationFrame(animate);
    }

    _launchModalExpansion(island, loupeBtn) {
        if (this._isOpen) return;

        // 2. Mesurer les coordonnées réelles de la loupe déployée
        let startX = window.innerWidth / 2;
        let startY = 38;
        if (loupeBtn) {
            const r = loupeBtn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                startX = r.left + r.width / 2;
                startY = r.top + r.height / 2;
            }
        }
        this._loupeOrigin = { x: startX, y: startY };

        this._query = '';
        this._activeFilter = 'All';
        this._selectedIndex = 0;

        // 3. Overlay backdrop
        if (!this._overlay) {
            this._overlay = document.createElement('div');
            this._overlay.className = 'sh-spotlight-overlay';
            this._overlay.addEventListener('click', () => this.close());
        }
        document.body.appendChild(this._overlay);

        // 4. Command Center Modal
        if (!this._modal) {
            this._modal = document.createElement('div');
            this._modal.className = 'sh-spotlight-macos-modal';
            this._modal.id = 'sh-spotlight-macos-modal';
            this._modal.setAttribute('role', 'dialog');
            this._modal.setAttribute('aria-modal', 'true');
        }
        this._modal.style.display = 'none'; // Caché pendant l'animation du génie
        this._modal.innerHTML = `
            <!-- En-tête Translucide avec Input Épuré & Filtres -->
            <div class="sh-spotlight-header">
                <div class="sh-spotlight-search-bar">
                    <svg class="sh-spotlight-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="sh-spotlight-input" placeholder="Rechercher un film, une série, ou naviguer..." autocomplete="off" spellcheck="false" />
                    <button class="sh-spotlight-clear-btn" style="display:none;" title="Effacer">✕</button>
                    
                    <!-- Filtres discrets sous forme de pastilles -->
                    <div class="sh-spotlight-tabs-row">
                        <button class="sh-spotlight-tab-btn active" data-filter="All">Tout</button>
                        <button class="sh-spotlight-tab-btn" data-filter="Movie">Films</button>
                        <button class="sh-spotlight-tab-btn" data-filter="Series">Séries</button>
                        <button class="sh-spotlight-tab-btn" data-filter="Navigation">Navigation</button>
                        <button class="sh-spotlight-tab-btn" data-filter="Command">Actions</button>
                    </div>

                    <span class="sh-spotlight-esc-pill">ESC</span>
                </div>
            </div>

            <!-- Corps Mono-Colonne Aéré (Single-Pane Hub) -->
            <div class="sh-spotlight-body">
                <div class="sh-spotlight-results-pane sh-scrollbar" id="sh-spotlight-results-pane">
                    <!-- Curseur Glissant Actif (Framer layoutId Pill) -->
                    <div class="sh-spotlight-active-indicator" id="sh-spotlight-active-indicator"></div>
                    <!-- Injecté dynamiquement -->
                </div>
            </div>

            <!-- Barre de pied unifiée avec aide raccourcis -->
            <div class="sh-spotlight-footer">
                <div class="sh-spotlight-shortcut-hints">
                    <span><kbd>↑↓</kbd> Naviguer</span>
                    <span><kbd>↵</kbd> Ouvrir la fiche</span>
                    <span><kbd>Tab</kbd> Filtrer</span>
                    <span><kbd>ESC</kbd> Fermer</span>
                </div>
                <div class="sh-spotlight-brand-badge">
                    <span>SpaceHub Search</span>
                </div>
            </div>
        `;
        document.body.appendChild(this._modal);
        this._spotlight = this._modal;

        requestAnimationFrame(() => {
            this._overlay.classList.add('open');
        });

        // 5. Lancement de la véritable animation Effet Génie Canvas
        this._playGenieAnimation('open', () => {
            this._modal.style.display = 'flex';
            this._modal.querySelector('.sh-spotlight-input')?.focus();
        });

        // Pendant l'effet génie (à mi-course, 200ms), le dock supérieur s'estompe en douceur
        setTimeout(() => {
            if (island) {
                island.style.transition = 'opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
                island.style.opacity = '0';
                island.style.transform = 'translateX(-50%) scale(0.96)';
            }
        }, 200);

        this._isOpen = true;
        document.body.style.overflow = 'hidden';

        // Garde anti-duplication : _bindEvents etait rappele a CHAQUE open()
        // alors que l'overlay et la modale sont reutilises. Les ecouteurs
        // s'empilaient : a la N-ieme ouverture, une fleche sautait N elements.
        if (!this._eventsBound) { this._bindEvents(); this._eventsBound = true; }
        this._renderInitialView();
    }

    close() {
        if (!this._isOpen) return;

        // Retire la couche de la pile : fermée par un clic ou par la croix, elle
        // ne doit plus être la cible du prochain « Retour ».
        svc.nav()?.onLayerClosed?.('search');

        const island = document.getElementById('sh-dynamic-island');
        const underglow = document.getElementById('sh-island-underglow');

        this._overlay?.classList.remove('open');

        // Cacher le DOM live pour laisser place à la déformation Génie Canvas
        if (this._modal) {
            this._modal.style.display = 'none';
        }

        // 1. S'assurer que le dock supérieur reste en mode normal déployé
        if (island) {
            island.style.transition = 'opacity 300ms ease';
            island.style.opacity = '1';
            island.style.transform = 'translateX(-50%) scale(1)';
            island.classList.remove('sh-island--compact', 'sh-island--collapsing');
            island.classList.add('sh-island--expanded');
            if (underglow) underglow.className = 'sh-island-underglow sh-underglow--expanded';
        }

        // 2. Lancement de l'aspiration Génie Canvas (rentrée fluide dans la loupe)
        this._playGenieAnimation('close', () => {
            this._modal?.remove();
            this._modal = null;
            this._spotlight = null;

            // Effet lumineux d'absorption sur l'icône de recherche à la fin
            const loupeBtn = document.getElementById('sh-btn-quick-search');
            if (loupeBtn) {
                loupeBtn.style.transition = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease';
                loupeBtn.style.transform = 'scale(1.22)';
                loupeBtn.style.boxShadow = '0 0 18px rgba(56, 189, 248, 0.65)';
                setTimeout(() => {
                    loupeBtn.style.transform = '';
                    loupeBtn.style.boxShadow = '';
                }, 240);
            }

            // Une fois l'animation de rentrée totalement terminée, replier le dock en mode compact
            setTimeout(() => {
                if (island && !island.matches(':hover')) {
                    island.classList.remove('sh-island--expanded');
                    island.classList.add('sh-island--collapsing');
                    island.classList.add('sh-island--compact');
                    if (underglow) underglow.className = 'sh-island-underglow sh-underglow--collapsing';

                    setTimeout(() => {
                        island.classList.remove('sh-island--collapsing');
                        if (island.classList.contains('sh-island--compact') && underglow) {
                            underglow.className = 'sh-island-underglow sh-underglow--compact';
                        }
                    }, 600);
                }
            }, 260);
        });

        setTimeout(() => {
            this._overlay?.remove();
            this._overlay = null;
        }, 500);

        this._isOpen = false;
        document.body.style.overflow = '';
    }

    /**
     * 🚀 Animation de plongée immersive vers l'avant (Forward Dive & Dissolve)
     * Utilisée lorsqu'on sélectionne une destination pour entrer directement dedans
     * sans déclencher l'aspiration de fermeture du génie.
     */
    _navigateAndDismiss(callback) {
        if (!this._isOpen) {
            if (callback) callback();
            return;
        }

        const island = document.getElementById('sh-dynamic-island');
        const underglow = document.getElementById('sh-island-underglow');

        // 1. Animation cinématographique de plongée vers l'avant (Scale 1.08 + Flou + Fondu)
        if (this._modal) {
            this._modal.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease, filter 200ms ease';
            this._modal.style.transform = 'translate(-50%, -50%) scale(1.08)';
            this._modal.style.opacity = '0';
            this._modal.style.filter = 'blur(12px)';
        }

        if (this._overlay) {
            this._overlay.style.transition = 'opacity 220ms ease';
            this._overlay.style.opacity = '0';
        }

        // 2. Repli discret et harmonieux du dock en arrière-plan
        if (island) {
            island.style.transition = 'opacity 300ms ease, transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
            island.style.opacity = '1';
            island.style.transform = 'translateX(-50%) scale(1)';
            island.classList.remove('sh-island--expanded');
            island.classList.add('sh-island--compact');
            if (underglow) {
                underglow.className = 'sh-island-underglow sh-underglow--compact';
            }
        }

        // 3. Exécution de la navigation / ouverture au climax de la transition
        setTimeout(() => {
            if (callback) callback();
        }, 110);

        // 4. Nettoyage DOM
        setTimeout(() => {
            this._modal?.remove();
            this._modal = null;
            this._spotlight = null;
            this._overlay?.remove();
            this._overlay = null;
            if (island) island.style.transition = '';
        }, 250);

        this._isOpen = false;
        document.body.style.overflow = '';
    }

    _bindEvents() {
        const input = this._spotlight.querySelector('.sh-spotlight-input');
        const clearBtn = this._spotlight.querySelector('.sh-spotlight-clear-btn');
        const tabBtns = this._spotlight.querySelectorAll('.sh-spotlight-tab-btn');

        input?.addEventListener('input', (e) => {
            const val = e.target.value || '';
            this._query = val;
            const queryClean = val.trim();
            if (clearBtn) clearBtn.style.display = queryClean ? 'flex' : 'none';

            clearTimeout(this._debounceTimer);
            if (queryClean.length < 2) {
                this._renderInitialView();
                return;
            }

            this._debounceTimer = setTimeout(() => {
                this._performSearch();
            }, 100);
        });

        clearBtn?.addEventListener('click', () => {
            if (input) {
                input.value = '';
                input.focus();
            }
            this._query = '';
            if (clearBtn) clearBtn.style.display = 'none';
            this._renderInitialView();
        });

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._activeFilter = btn.dataset.filter;
                this._selectedIndex = 0;
                if (this._query) this._performSearch();
                else this._renderInitialView();
            });
        });

        this._overlay?.addEventListener('click', () => this.close());

        this._spotlight?.addEventListener('keydown', (e) => {
            const total = this._visibleItems.length;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (total === 0) return;
                this._selectedIndex = (this._selectedIndex + 1) % total;
                this._updateActiveSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (total === 0) return;
                this._selectedIndex = (this._selectedIndex - 1 + total) % total;
                this._updateActiveSelection();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._triggerPrimaryAction();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this._cycleFilters();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });
    }

    _cycleFilters() {
        const filters = ['All', 'Movie', 'Series', 'Navigation', 'Command'];
        const nextIdx = (filters.indexOf(this._activeFilter) + 1) % filters.length;
        this._activeFilter = filters[nextIdx];

        const tabBtns = this._spotlight.querySelectorAll('.sh-spotlight-tab-btn');
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === this._activeFilter));
        this._selectedIndex = 0;

        if (this._query) this._performSearch();
        else this._renderInitialView();
    }

    async _renderInitialView() {
        const resultsPane = this._spotlight.querySelector('#sh-spotlight-results-pane');
        if (!resultsPane) return;

        const navItems = this._getNavigationItems();
        const commands = this._getSystemCommands();

        let filteredNav = (this._activeFilter === 'All' || this._activeFilter === 'Navigation') ? navItems : [];
        let filteredCommands = (this._activeFilter === 'All' || this._activeFilter === 'Command') ? commands : [];

        // Récupération des vrais médias récents de l'utilisateur
        let realHighlights = [];
        if (this._activeFilter === 'All' || this._activeFilter === 'Movie' || this._activeFilter === 'Series') {
            realHighlights = await this._getRecentMediaHighlights();
            if (this._activeFilter === 'Movie') realHighlights = realHighlights.filter(i => (i.Type || '').toLowerCase() === 'movie');
            else if (this._activeFilter === 'Series') realHighlights = realHighlights.filter(i => (i.Type || '').toLowerCase() === 'series');
        }

        this._visibleItems = [...filteredNav, ...realHighlights, ...filteredCommands];
        this._selectedIndex = Math.min(this._selectedIndex, Math.max(0, this._visibleItems.length - 1));

        let html = '';

        // Section 1 : Récents (Pastilles minimalistes)
        if (this._activeFilter === 'All' && this._recentSearches.length > 0) {
            html += `
                <div class="sh-spotlight-section-header">
                    <span>RECHERCHES RÉCENTES</span>
                    <button class="sh-spotlight-clear-history-btn" id="sh-spotlight-clear-history">Effacer</button>
                </div>
                <div class="sh-spotlight-recent-tags-row">
                    ${this._recentSearches.map(term => `
                        <button class="sh-spotlight-recent-pill" data-term="${this._escape(term)}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sh-spotlight-clock-icon">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span>${this._escape(term)}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }

        // Section 2 : Navigation Rapide
        if (filteredNav.length > 0) {
            html += `
                <div class="sh-spotlight-section-header">
                    <span>NAVIGATION RAPIDE</span>
                </div>
                <div class="sh-spotlight-items-list">
                    ${filteredNav.map((nav) => {
                        const globalIndex = this._visibleItems.indexOf(nav);
                        const isSelected = globalIndex === this._selectedIndex;
                        return `
                            <div class="sh-spotlight-item ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                                <div class="sh-spotlight-icon-wrap">${nav.icon}</div>
                                <div class="sh-spotlight-item-text">
                                    <span class="sh-spotlight-item-title">${this._escape(nav.Name)}</span>
                                    <span class="sh-spotlight-item-sub">${this._escape(nav.sub)}</span>
                                </div>
                                <div class="sh-spotlight-action-hint">
                                    <span>Accéder ↵</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // Section 3 : Médias de votre Bibliothèque Jellyfin
        if (realHighlights.length > 0) {
            html += `
                <div class="sh-spotlight-section-header">
                    <span>VOS MÉDIAS RÉCENTS</span>
                </div>
                <div class="sh-spotlight-items-list">
                    ${realHighlights.map((media) => {
                        const globalIndex = this._visibleItems.indexOf(media);
                        const isSelected = globalIndex === this._selectedIndex;
                        const sub = `${media.ProductionYear || ''} · ${media.Type === 'Movie' ? 'Film' : media.Type === 'Series' ? 'Série' : 'Média'} · ${media.format || 'HD'}`;
                        return `
                            <div class="sh-spotlight-item ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                                <div class="sh-spotlight-thumb-wrap">
                                    ${media.imageUrl ? `<img decoding="async" src="${media.imageUrl}" alt="${this._escape(media.title)}" />` : `<div class="sh-spotlight-thumb-fallback"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>`}
                                </div>
                                <div class="sh-spotlight-item-text">
                                    <span class="sh-spotlight-item-title">${this._escape(media.title)}</span>
                                    <span class="sh-spotlight-item-sub">${sub}</span>
                                </div>
                                <div class="sh-spotlight-action-hint">
                                    <span>Ouvrir la fiche ↵</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // Section 4 : Commandes & Actions
        if (filteredCommands.length > 0) {
            html += `
                <div class="sh-spotlight-section-header">
                    <span>ACTIONS SYSTÈME</span>
                </div>
                <div class="sh-spotlight-items-list">
                    ${filteredCommands.map((cmd) => {
                        const globalIndex = this._visibleItems.indexOf(cmd);
                        const isSelected = globalIndex === this._selectedIndex;
                        return `
                            <div class="sh-spotlight-item ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                                <div class="sh-spotlight-icon-wrap">${cmd.icon}</div>
                                <div class="sh-spotlight-item-text">
                                    <span class="sh-spotlight-item-title">${this._escape(cmd.Name)}</span>
                                    <span class="sh-spotlight-item-sub">${this._escape(cmd.sub)}</span>
                                </div>
                                <div class="sh-spotlight-action-hint">
                                    <span>Exécuter ↵</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        resultsPane.innerHTML = `
            <div class="sh-spotlight-active-indicator" id="sh-spotlight-active-indicator"></div>
            ${html}
        `;
        this._bindItemClicks(resultsPane);
        this._updateActiveSelection();
    }

        async _performSearch() {
        const resultsPane = this._spotlight.querySelector('#sh-spotlight-results-pane');
        if (!resultsPane) return;

        const currentSeq = ++this._currentSearchSeq;
        const queryClean = (this._query || '').trim();
        const queryLower = queryClean.toLowerCase();

        if (queryClean.length < 2) {
            this._renderInitialView();
            return;
        }

        resultsPane.innerHTML = `
            <div class="sh-spotlight-loading">
                <div class="sh-spotlight-spinner"></div>
                <p>Recherche de "${this._escape(queryClean)}"...</p>
            </div>
        `;

        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);

        // 1. Navigation & Commandes : Uniquement si correspondance directe et précise
        let navMatches = [];
        let commands = [];
        if (this._activeFilter === 'All' || this._activeFilter === 'Navigation') {
            navMatches = this._getNavigationItems().filter(n => {
                const nameLower = n.Name.toLowerCase();
                return queryTerms.every(term => nameLower.includes(term));
            });
        }
        if (this._activeFilter === 'All' || this._activeFilter === 'Command') {
            commands = this._getSystemCommands().filter(c => {
                const nameLower = c.Name.toLowerCase();
                return queryTerms.every(term => nameLower.includes(term));
            });
        }

        // 2. Recherche Jellyfin avec FILTRE DE PERTINENCE STRICT
        let mediaResults = [];
        if (this._activeFilter === 'All' || this._activeFilter === 'Movie' || this._activeFilter === 'Series') {
            try {
                const api = svc.jellyfinApi();
                if (api) {
                    const typeParam = this._activeFilter === 'Movie' ? 'Movie' :
                                      this._activeFilter === 'Series' ? 'Series' : 'Movie,Series,BoxSet';

                    const rawItems = await api.search(queryClean, { limit: 20, includeItemTypes: typeParam });
                    
                    if (this._currentSearchSeq !== currentSeq) return; // Requête obsolète annulée

                    if (rawItems && rawItems.length > 0) {
                        mediaResults = rawItems
                            .filter(item => {
                                const title = (item.Name || item.OriginalTitle || '').toLowerCase();
                                const seriesName = (item.SeriesName || '').toLowerCase();
                                // Le titre ou la série DOIT contenir les termes de recherche
                                return queryTerms.every(t => title.includes(t) || seriesName.includes(t)) ||
                                       (queryTerms.length > 1 && queryTerms.some(t => t.length >= 4 && (title.includes(t) || seriesName.includes(t))));
                            })
                            .map(item => ({
                                ...item,
                                title: item.Name,
                                imageUrl: api.getImageUrl(item.Id, 'Primary', { maxWidth: 200, maxHeight: 300 }),
                                backdropUrl: api.getImageUrl(item.Id, 'Backdrop', { maxWidth: 1200 }),
                                duration: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000000 / 60) + ' min' : '',
                                format: item.MediaStreams?.some(s => s.Width >= 3800) ? '4K UHD' : '1080p HD'
                            }));
                    }
                }
            } catch (err) {
                this._log.warn('Erreur recherche Jellyfin:', err);
            }
        }

        // 3. Recherche complémentaire sur Jellyseerr (Découvertes & Demandes)
        let jellyseerrResults = [];
        if (this._activeFilter === 'All' || this._activeFilter === 'Movie' || this._activeFilter === 'Series') {
            try {
                const jellyseerrApi = svc.integration('jellyseerr')?.api;
                if (jellyseerrApi?.search) {
                    const jsData = await jellyseerrApi.search(queryClean);
                    
                    if (this._currentSearchSeq !== currentSeq) return; // Requête obsolète annulée

                    const rawJsItems = jsData?.results || [];
                    const existingTitles = new Set(mediaResults.map(m => (m.title || m.Name || '').toLowerCase().trim()));

                    jellyseerrResults = rawJsItems
                        .filter(item => {
                            const jsTitle = (item.title || item.name || '').toLowerCase().trim();
                            if (!jsTitle) return false;
                            // Doit correspondre aux termes recherchés
                            const matchesQuery = queryTerms.every(t => jsTitle.includes(t)) || queryTerms.some(t => t.length >= 3 && jsTitle.includes(t));
                            return matchesQuery && !existingTitles.has(jsTitle);
                        })
                        .slice(0, 10)
                        .map(item => ({
                            ...item,
                            isJellyseerr: true,
                            isDemandable: true,
                            source: 'jellyseerr',
                            title: item.title || item.name,
                            Name: item.title || item.name,
                            Type: item.mediaType === 'tv' ? 'Series' : 'Movie',
                            isSeries: item.mediaType === 'tv',
                            isMovie: item.mediaType !== 'tv',
                            imageUrl: item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : '',
                            ProductionYear: (item.releaseDate || item.firstAirDate || '').slice(0, 4),
                            sub: 'Disponible sur Jellyseerr • Cliquer pour demander'
                        }));
                }
            } catch (jsErr) {
                this._log.debug('Erreur recherche Jellyseerr:', jsErr);
            }
        }

        if (this._currentSearchSeq !== currentSeq) return;

        this._visibleItems = [...mediaResults, ...jellyseerrResults, ...navMatches, ...commands];
        this._selectedIndex = 0;

        if (this._visibleItems.length === 0) {
            resultsPane.innerHTML = `
                <div class="sh-spotlight-empty">
                    <p>Aucun résultat pour "<strong>${this._escape(queryClean)}</strong>"</p>
                    <span>Vérifiez l'orthographe ou tentez un autre mot-clé</span>
                </div>
            `;
            return;
        }

        this._saveRecentSearch(queryClean);

        let html = '';

        // Section 1 : Vos médias sur le serveur Jellyfin
        if (mediaResults.length > 0) {
            html += `
                <div class="sh-spotlight-section-header">
                    <span>SUR VOTRE SERVEUR (${mediaResults.length})</span>
                </div>
                <div class="sh-spotlight-items-list">
            `;
            mediaResults.forEach((item) => {
                const globalIndex = this._visibleItems.indexOf(item);
                const isSelected = globalIndex === this._selectedIndex;
                const sub = `${item.ProductionYear || ''} · ${item.Type === 'Movie' ? 'Film' : item.Type === 'Series' ? 'Série' : 'Média'} · ${item.format || 'HD'}`;
                html += `
                    <div class="sh-spotlight-item ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                        <div class="sh-spotlight-thumb-wrap">
                            ${item.imageUrl ? `<img decoding="async" src="${item.imageUrl}" alt="${this._escape(item.title)}" />` : '<div class="sh-spotlight-thumb-fallback">🎬</div>'}
                        </div>
                        <div class="sh-spotlight-item-text">
                            <span class="sh-spotlight-item-title">${this._highlightQuery(item.title, queryClean)}</span>
                            <span class="sh-spotlight-item-sub">${sub}</span>
                        </div>
                        <div class="sh-spotlight-action-hint">
                            <span>Ouvrir la fiche ↵</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        // Section 2 : Découvertes & Demandes Jellyseerr
        if (jellyseerrResults.length > 0) {
            html += `
                <div class="sh-spotlight-section-header" style="margin-top: 16px;">
                    <span>DÉCOUVERTES & DEMANDES (JELLYSEERR) (${jellyseerrResults.length})</span>
                </div>
                <div class="sh-spotlight-items-list">
            `;
            jellyseerrResults.forEach((item) => {
                const globalIndex = this._visibleItems.indexOf(item);
                const isSelected = globalIndex === this._selectedIndex;
                html += `
                    <div class="sh-spotlight-item sh-spotlight-item--jellyseerr ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                        <div class="sh-spotlight-thumb-wrap">
                            ${item.imageUrl ? `<img decoding="async" src="${item.imageUrl}" alt="${this._escape(item.title)}" />` : '<div class="sh-spotlight-thumb-fallback">🎬</div>'}
                        </div>
                        <div class="sh-spotlight-item-text">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="sh-spotlight-item-title">${this._highlightQuery(item.title, queryClean)}</span>
                                <span class="sh-jellyseerr-search-badge">Jellyseerr</span>
                            </div>
                            <span class="sh-spotlight-item-sub">${item.ProductionYear || ''} • Non présent sur le serveur • Demander</span>
                        </div>
                        <div class="sh-spotlight-action-hint">
                            <span style="color:#64d2ff; font-weight:700;">Demander ↵</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        // Section 3 : Navigation & Actions
        const otherItems = [...navMatches, ...commands];
        if (otherItems.length > 0) {
            html += `
                <div class="sh-spotlight-section-header" style="margin-top: 16px;">
                    <span>NAVIGATION & ACTIONS</span>
                </div>
                <div class="sh-spotlight-items-list">
            `;
            otherItems.forEach((item) => {
                const globalIndex = this._visibleItems.indexOf(item);
                const isSelected = globalIndex === this._selectedIndex;
                html += `
                    <div class="sh-spotlight-item ${isSelected ? 'active' : ''}" data-index="${globalIndex}" style="--idx: ${globalIndex}">
                        <div class="sh-spotlight-icon-wrap">${item.icon}</div>
                        <div class="sh-spotlight-item-text">
                            <span class="sh-spotlight-item-title">${this._highlightQuery(item.Name, queryClean)}</span>
                            <span class="sh-spotlight-item-sub">${this._escape(item.sub || '')}</span>
                        </div>
                        <div class="sh-spotlight-action-hint">
                            <span>${item.Type === 'Navigation' ? 'Accéder ↵' : 'Exécuter ↵'}</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        resultsPane.innerHTML = html;
        this._bindItemClicks(resultsPane);
        this._updateActiveSelection();
    }

    _bindItemClicks(container) {
        container.querySelectorAll('.sh-spotlight-recent-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const term = pill.dataset.term;
                const input = this._spotlight.querySelector('.sh-spotlight-input');
                if (input) {
                    input.value = term;
                    input.focus();
                }
                this._query = term;
                this._performSearch();
            });
        });

        container.querySelector('#sh-spotlight-clear-history')?.addEventListener('click', () => {
            this._clearRecentSearches();
            this._renderInitialView();
        });

        container.querySelectorAll('.sh-spotlight-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const index = parseInt(el.dataset.index, 10);
                if (!isNaN(index)) {
                    this._selectedIndex = index;
                    this._updateActiveSelection();
                }
            });

            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index, 10);
                if (!isNaN(index)) {
                    this._selectedIndex = index;
                    this._triggerPrimaryAction();
                }
            });
        });
    }

        _updateActiveSelection() {
        const items = this._spotlight?.querySelectorAll('.sh-spotlight-item');
        if (!items || items.length === 0) return;

        items.forEach((el, i) => {
            if (i === this._selectedIndex) {
                el.classList.add('active');
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                el.classList.remove('active');
            }
        });
    }

    _triggerPrimaryAction() {
        const currentItem = this._visibleItems[this._selectedIndex];
        if (!currentItem) return;

        if (currentItem.Type === 'Command' && currentItem.action) {
            currentItem.action();
            return;
        }

        if (currentItem.Type === 'Navigation' && currentItem.action) {
            currentItem.action();
            return;
        }

        // Pour tout média (Film, Série, Musique, Saga) : Plongée vers l'avant et ouverture immédiate de la fiche !
        this._navigateAndDismiss(() => {
            svc.slideUpSheet()?.open(currentItem);
        });
    }

    _highlightQuery(text, query) {
        if (!query || !text) return this._escape(text || '');
        const escaped = this._escape(text);
        const qEscaped = this._escape(query);
        const regex = new RegExp(`(${qEscaped})`, 'gi');
        return escaped.replace(regex, '<mark class="sh-spotlight-highlight">$1</mark>');
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans UnifiedSearch.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default UnifiedSearch;



