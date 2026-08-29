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

class UnifiedSearch {
    constructor() {
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
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
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
                        window.SpaceHub?.ui?.appLayout?.navigate('home');
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
                        window.SpaceHub?.ui?.appLayout?.navigate('library');
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
                        window.SpaceHub?.ui?.appLayout?.navigate('movies');
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
                        window.SpaceHub?.ui?.appLayout?.navigate('series');
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
                        window.SpaceHub?.ui?.appLayout?.navigate('music');
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
                        window.SpaceHub?.ui?.settingsPanel?.open();
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
                        const current = window.SpaceHub?.core?.settings?.get('ui.theme', 'space-dark') || 'space-dark';
                        const next = themes[(themes.indexOf(current) + 1) % themes.length];
                        window.SpaceHub?.ui?.themes?.applyTheme(next);
                        window.SpaceHub?.ui?.components?.toaster?.success(`Thème : ${next}`);
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
                        window.SpaceHub?.ui?.components?.toaster?.info('Sélection d\'un média aléatoire...');
                        const sampleItems = this._getDefaultCatalog();
                        const pick = sampleItems[Math.floor(Math.random() * sampleItems.length)];
                        setTimeout(() => {
                            window.SpaceHub?.ui?.modalSlideUpSheet?.open(pick);
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
                            window.SpaceHub?.ui?.dashboard?.render(mainContainer);
                        }
                        window.SpaceHub?.ui?.components?.toaster?.success('Dashboard actualisé');
                    });
                }
            }
        ];
    }

    async _getRecentMediaHighlights() {
        try {
            const api = window.SpaceHub?.jellyfin?.api;
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
        if (window._sh_search_shortcut_bound) return;
        window._sh_search_shortcut_bound = true;

        window.addEventListener('keydown', (e) => {
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
            
            // Ouvrir avec Ctrl+K ou Cmd+K ou "/" (si hors input)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                e.stopPropagation();
                if (window.SpaceHub?.jellyfin?.search) {
                    window.SpaceHub.jellyfin.search.toggle();
                } else {
                    this.toggle();
                }
            } else if (e.key === '/' && !isTyping && !this._isOpen) {
                e.preventDefault();
                e.stopPropagation();
                if (window.SpaceHub?.jellyfin?.search) {
                    window.SpaceHub.jellyfin.search.open();
                } else {
                    this.open();
                }
            }
        }, true);
    }

    toggle() {
        if (this._isOpen) this.close();
        else this.open();
    }

    open() {
        if (this._isOpen) return;

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

        this._bindEvents();
        this._renderInitialView();
    }

    close() {
        if (!this._isOpen) return;

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
            const val = e.target.value;
            this._query = val.trim();
            if (clearBtn) clearBtn.style.display = this._query ? 'flex' : 'none';

            clearTimeout(this._debounceTimer);
            if (!this._query) {
                this._renderInitialView();
                return;
            }

            this._debounceTimer = setTimeout(() => {
                this._performSearch();
            }, 140);
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
                                    ${media.imageUrl ? `<img src="${media.imageUrl}" alt="${this._escape(media.title)}" />` : `<div class="sh-spotlight-thumb-fallback"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>`}
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
                const api = window.SpaceHub?.jellyfin?.api;
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
                const jellyseerrApi = window.SpaceHub?.integrations?.jellyseerr?.api;
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
                            title: item.title || item.name,
                            Type: item.mediaType === 'tv' ? 'Series' : 'Movie',
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
                            ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${this._escape(item.title)}" />` : '<div class="sh-spotlight-thumb-fallback">🎬</div>'}
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
                            ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${this._escape(item.title)}" />` : '<div class="sh-spotlight-thumb-fallback">🎬</div>'}
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
            window.SpaceHub?.ui?.modalSlideUpSheet?.open(currentItem);
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
        const existing = document.getElementById('sh-spotlight-palette-styles');
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = 'sh-spotlight-palette-styles';
        style.textContent = `

.sh-jellyseerr-search-badge {
    font-size: 10px !important;
    font-weight: 750 !important;
    text-transform: uppercase !important;
    padding: 2px 6px !important;
    border-radius: 6px !important;
    background: rgba(99, 102, 241, 0.2) !important;
    border: 1px solid rgba(99, 102, 241, 0.4) !important;
    color: #a5b4fc !important;
}


/* ═══════════════════════════════════════════════════════════════════════
   🍏 MACOS QUICKLOOK / WINDOW ZOOM ANIMATION DEPUIS LA LOUPE DU DOCK
   ═══════════════════════════════════════════════════════════════════════ */

.sh-spotlight-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    z-index: 10001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 380ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-spotlight-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

/* 🍏 Centre exact de l'écran avec verre dépoli VisionOS / macOS */
.sh-spotlight-macos-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(680px, 92vw);
    height: 510px;
    max-height: 80vh;
    background: rgba(13, 13, 18, 0.94);
    backdrop-filter: blur(60px) saturate(220%);
    -webkit-backdrop-filter: blur(60px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 24px;
    box-shadow: 
        0 40px 100px rgba(0, 0, 0, 0.96),
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.08);
    z-index: 10002;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: auto;
}

/* ── En-tête Translucide avec Input Épuré ────────────────────────────── */
.sh-spotlight-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    width: 100%;
}

.sh-spotlight-search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 18px;
    width: 100%;
}

.sh-spotlight-search-icon {
    color: rgba(255, 255, 255, 0.50);
    flex-shrink: 0;
}

.sh-spotlight-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 15px;
    font-weight: 500;
    font-family: inherit;
}
.sh-spotlight-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
}

.sh-spotlight-clear-btn {
    background: rgba(255, 255, 255, 0.06);
    border: none;
    color: rgba(255, 255, 255, 0.6);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    cursor: pointer;
    transition: background 140ms ease;
}
.sh-spotlight-clear-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
}

/* ── Filtres Pastilles ───────────────────────────────────────────────── */
.sh-spotlight-tabs-row {
    display: flex;
    align-items: center;
    gap: 3px;
}

.sh-spotlight-tab-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    padding: 4px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 140ms ease;
}
.sh-spotlight-tab-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.06);
}
.sh-spotlight-tab-btn.active {
    color: #000000;
    background: #ffffff;
    font-weight: 700;
}

.sh-spotlight-esc-pill {
    font-size: 9.5px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
}

/* ── Corps Mono-Colonne (Single-Pane) ────────────────────────────────── */
.sh-spotlight-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

.sh-spotlight-results-pane {
    position: relative;
    padding: 10px 14px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 420px;
}

.sh-spotlight-active-indicator {
    position: absolute;
    left: 14px;
    right: 14px;
    top: 0;
    height: 48px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    pointer-events: none;
    transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), height 140ms ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15);
    display: none;
    z-index: 1;
}

.sh-spotlight-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.6px;
    color: rgba(255, 255, 255, 0.35);
    padding: 4px 6px 2px;
    z-index: 2;
}

.sh-spotlight-clear-history-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.40);
    font-size: 10px;
    cursor: pointer;
    transition: color 140ms ease;
}
.sh-spotlight-clear-history-btn:hover {
    color: #ffffff;
}

.sh-spotlight-recent-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 4px 6px;
    z-index: 2;
}

.sh-spotlight-recent-pill {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.75);
    font-size: 11.5px;
    font-weight: 550;
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 140ms ease;
}
.sh-spotlight-recent-pill:hover {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.16);
    color: #ffffff;
}
.sh-spotlight-clock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.55);
    flex-shrink: 0;
}
.sh-spotlight-clock-icon svg {
    display: block;
    stroke: currentColor;
}

.sh-spotlight-items-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    z-index: 2;
}

.sh-spotlight-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 10px;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
    z-index: 2;
    transition: all 120ms ease;
    animation: sh-spotlight-stagger-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--idx, 0) * 16ms);
}

@keyframes sh-spotlight-stagger-in {
    0% {
        opacity: 0;
        transform: translateY(6px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
}
.sh-spotlight-item:hover,
.sh-spotlight-item.active {
    background: rgba(255, 255, 255, 0.08);
}

.sh-spotlight-thumb-wrap {
    width: 32px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
}
.sh-spotlight-thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-spotlight-thumb-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.45);
}
.sh-spotlight-thumb-fallback svg {
    display: block;
    stroke: currentColor;
}

.sh-spotlight-icon-wrap {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.10);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
    transition: all 140ms ease;
}

.sh-spotlight-icon-wrap svg {
    display: block;
    stroke: currentColor;
    stroke-width: 2;
}

.sh-spotlight-item:hover .sh-spotlight-icon-wrap,
.sh-spotlight-item.active .sh-spotlight-icon-wrap {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
    transform: scale(1.06);
}

.sh-spotlight-item-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.sh-spotlight-item-title {
    font-size: 13.5px;
    font-weight: 650;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-spotlight-item-sub {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-spotlight-action-hint {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.40);
    opacity: 0;
    transition: all 140ms ease;
    flex-shrink: 0;
}
.sh-spotlight-item:hover .sh-spotlight-action-hint,
.sh-spotlight-item.active .sh-spotlight-action-hint {
    opacity: 1;
    color: #38bdf8;
    transform: translateX(-2px);
}

.sh-spotlight-highlight {
    background: rgba(56, 189, 248, 0.25);
    color: #38bdf8;
    font-weight: 700;
    padding: 0 2px;
    border-radius: 3px;
}

.sh-spotlight-loading,
.sh-spotlight-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 20px;
    color: rgba(255, 255, 255, 0.40);
    font-size: 13px;
    gap: 6px;
}
.sh-spotlight-empty strong {
    color: #ffffff;
}
.sh-spotlight-empty span {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.30);
}

.sh-spotlight-spinner {
    width: 22px;
    height: 22px;
    border: 2px solid rgba(255, 255, 255, 0.10);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: sh-spotlight-spin 0.7s linear infinite;
    margin-bottom: 8px;
}
@keyframes sh-spotlight-spin {
    to { transform: rotate(360deg); }
}

/* ── Barre de pied épurée ────────────────────────────────────────────── */
.sh-spotlight-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.015);
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.35);
}

.sh-spotlight-shortcut-hints {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sh-spotlight-shortcut-hints kbd {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.70);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 9.5px;
    margin-right: 3px;
}

.sh-spotlight-brand-badge {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
    font-weight: 600;
}
        `;
        document.head.appendChild(style);
    }
}

export default UnifiedSearch;



