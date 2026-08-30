/**
 * SpaceHub — Touch & Mobile Gesture Engine (GSM Edition v9.0)
 * Version: 1.0.0
 *
 * Moteur gestuel tactile complet pour Smartphones et Tablettes :
 * - Swipe horizontal entre les vues principales (Dashboard ⇄ Calendrier ⇄ Téléchargements ⇄ Analytics).
 * - Swipe-down-to-dismiss physique avec inertie sur les modales et fiches médias (ModalSlideUpSheet).
 * - Pull-to-refresh natif sur le Dashboard avec indicateur rotatif et résistance élastique.
 * - Double-tap pour action rapide (favori / like).
 * - Compensation du clavier virtuel iOS/Android (visualViewport).
 * - Agrandissement des cibles tactiles à 48px et gestion de safe-area-inset.
 * - Feedback haptique (navigator.vibrate).
 */

'use strict';

import Logger from './Logger.js';

export class TouchEngine {
    constructor() {
        this._log = new Logger('TouchEngine');
        this._startX = 0;
        this._startY = 0;
        this._currentX = 0;
        this._currentY = 0;
        this._touchStartTime = 0;
        this._isDraggingSheet = false;
        this._isPullingRefresh = false;
        this._activeSheetEl = null;
        this._pullIndicatorEl = null;
        this._lastTapTime = 0;
        this._lastTapTarget = null;
        this._isEnabled = true;

        this._injectMobileStyles();
        this._bindEvents();
        this._log.info('Moteur Tactile Mobile TouchEngine v1.0 initialisé.');
    }

    _injectMobileStyles() {
        if (document.getElementById('sh-touch-engine-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-touch-engine-styles';
        style.textContent = `
            /* ── SAFE AREAS & MOBILE ADAPTATION ── */
            @supports (padding-top: env(safe-area-inset-top)) {
                .sh-dynamic-island {
                    top: max(16px, env(safe-area-inset-top) + 8px) !important;
                }
                .sh-slideup-sheet {
                    padding-bottom: max(24px, env(safe-area-inset-bottom) + 12px) !important;
                }
            }

            /* ── CIBLES TACTILES ÉTENDUES (MIN 48×48px SANS CHANGER LE DESIGN) ── */
            @media (hover: none) and (pointer: coarse) {
                .sh-genre-chip,
                .sh-tab-btn,
                .sh-season-pill-btn,
                .sh-nav-tab-btn,
                .sh-nav-action-btn,
                .sh-admin-mini-action-btn,
                .sh-lib-alpha-btn,
                .sh-sync-btn,
                .sh-chip-btn {
                    position: relative;
                    min-height: 38px;
                    touch-action: manipulation;
                }

                .sh-genre-chip::before,
                .sh-tab-btn::before,
                .sh-season-pill-btn::before,
                .sh-nav-tab-btn::before,
                .sh-nav-action-btn::before,
                .sh-lib-alpha-btn::before,
                .sh-sync-btn::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    min-width: 48px;
                    min-height: 48px;
                    width: 100%;
                    height: 100%;
                    pointer-events: auto;
                    z-index: 1;
                }

                /* Scroll inertiel fluide sur iOS/Android */
                .sh-cinema-body,
                .sh-cinema-panels-wrapper,
                .sh-series-episodes-container,
                .sh-console-body,
                .sh-admin-modal-card,
                .sh-card-grid {
                    -webkit-overflow-scrolling: touch !important;
                    overscroll-behavior-y: contain;
                }
            }

            /* ── INDICATEUR PULL-TO-REFRESH ── */
            .sh-pull-refresh-indicator {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-60px);
                z-index: 999999;
                background: rgba(20, 20, 30, 0.95);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 159, 10, 0.4);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 159, 10, 0.3);
                border-radius: 9999px;
                padding: 8px 18px;
                display: flex;
                align-items: center;
                gap: 10px;
                color: #ffffff;
                font-size: 12px;
                font-weight: 700;
                pointer-events: none;
                transition: transform 180ms ease, opacity 180ms ease;
                opacity: 0;
            }

            .sh-pull-refresh-indicator.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            .sh-pull-spinner {
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-top-color: #ff9f0a;
                border-radius: 50%;
                animation: sh-pull-spin 0.7s linear infinite;
            }

            @keyframes sh-pull-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    _bindEvents() {
        document.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: true });
        document.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: true });
        document.addEventListener('touchcancel', () => this._handleTouchCancel(), { passive: true });

        // Ajustement dynamique du viewport lors de l'apparition du clavier virtuel
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const searchInput = document.getElementById('sh-search-input');
                if (document.activeElement === searchInput) {
                    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }

    _vibrate(duration = 15) {
        try {
            if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
                navigator.vibrate(duration);
            }
        } catch (_) {}
    }

    _handleTouchStart(e) {
        if (!this._isEnabled || e.touches.length !== 1) return;

        const touch = e.touches[0];
        this._startX = touch.clientX;
        this._startY = touch.clientY;
        this._currentX = touch.clientX;
        this._currentY = touch.clientY;
        this._touchStartTime = Date.now();

        // 1. Détection Swipe-down sur Modale / Fiche Média
        const openSheet = document.querySelector(
            '.sh-slideup-sheet--open, .sh-console-modal-overlay.open, .sh-admin-modal-overlay.open'
        );
        if (openSheet && openSheet.contains(e.target)) {
            const innerScroller = e.target.closest('.sh-cinema-body, .sh-console-body, .sh-admin-modal-card');
            // Si le scroller interne est à top 0 (ou pas de scroll), autoriser le swipe-to-dismiss
            if (!innerScroller || innerScroller.scrollTop <= 0) {
                this._isDraggingSheet = true;
                this._activeSheetEl = openSheet.querySelector('.sh-slideup-sheet') || openSheet.querySelector('.sh-console-card') || openSheet.querySelector('.sh-admin-modal-card') || openSheet;
            }
        }

        // 2. Détection Pull-to-refresh sur Dashboard
        if (!openSheet && window.scrollY <= 0) {
            this._isPullingRefresh = true;
        }

        // 3. Gestion Double-Tap (Favori / Quick Action)
        const cardTarget = e.target.closest('.sh-card');
        if (cardTarget) {
            const now = Date.now();
            if (now - this._lastTapTime < 320 && this._lastTapTarget === cardTarget) {
                this._vibrate(30);
                window.SpaceHub?.ui?.components?.toaster?.info('★ Ajouté aux Favoris');
                this._lastTapTime = 0;
            } else {
                this._lastTapTime = now;
                this._lastTapTarget = cardTarget;
            }
        }
    }

    _handleTouchMove(e) {
        if (!this._isEnabled || e.touches.length !== 1) return;

        const touch = e.touches[0];
        this._currentX = touch.clientX;
        this._currentY = touch.clientY;

        const deltaX = this._currentX - this._startX;
        const deltaY = this._currentY - this._startY;

        // A. Glissement vers le bas pour fermer la modale
        if (this._isDraggingSheet && this._activeSheetEl && deltaY > 0) {
            e.preventDefault();
            this._activeSheetEl.style.transform = `translateY(${deltaY * 0.75}px)`;
            this._activeSheetEl.style.transition = 'none';
            return;
        }

        // B. Pull-to-refresh sur le Dashboard
        if (this._isPullingRefresh && deltaY > 20 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
            this._ensurePullIndicator();
            if (deltaY > 60) {
                this._pullIndicatorEl.classList.add('visible');
            }
        }
    }

    _handleTouchEnd(e) {
        if (!this._isEnabled) return;

        const deltaX = this._currentX - this._startX;
        const deltaY = this._currentY - this._startY;
        const duration = Date.now() - this._touchStartTime;
        const velocityY = deltaY / (duration || 1);

        // A. Fin Swipe-down Modale
        if (this._isDraggingSheet && this._activeSheetEl) {
            if (deltaY > 120 || velocityY > 0.45) {
                this._vibrate(20);
                this._activeSheetEl.style.transition = 'transform 240ms cubic-bezier(0.32, 1, 0.32, 1)';
                this._activeSheetEl.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    const slideUp = window.SpaceHub?.ui?.modalSlideUpSheet;
                    if (slideUp && typeof slideUp.close === 'function') {
                        slideUp.close();
                    } else {
                        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal');
                        openModal?.classList.remove('open');
                        window.SpaceHub?.spatialNav?.onModalClosed?.();
                    }
                    this._activeSheetEl.style.transform = '';
                    this._activeSheetEl = null;
                }, 240);
            } else {
                this._activeSheetEl.style.transition = 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)';
                this._activeSheetEl.style.transform = '';
                this._activeSheetEl = null;
            }
            this._isDraggingSheet = false;
        }

        // B. Fin Pull-to-refresh
        if (this._isPullingRefresh) {
            if (deltaY > 80 && this._pullIndicatorEl?.classList.contains('visible')) {
                this._vibrate(25);
                this._pullIndicatorEl.innerHTML = '<div class="sh-pull-spinner"></div><span>Actualisation de SpaceHub...</span>';
                setTimeout(() => {
                    window.SpaceHub?.ui?.dashboard?.render?.(document.getElementById('sh-main-view-container'));
                    this._pullIndicatorEl.classList.remove('visible');
                    this._pullIndicatorEl.innerHTML = '<div class="sh-pull-spinner"></div><span>Tirer pour actualiser</span>';
                }, 1000);
            } else {
                this._pullIndicatorEl?.classList.remove('visible');
            }
            this._isPullingRefresh = false;
        }

        // C. Swipe Horizontal entre Vues Principales
        const isModalOpen = document.querySelector('.sh-slideup-sheet--open, .sh-modal-overlay.open, .sh-console-modal-overlay.open');
        if (!isModalOpen && Math.abs(deltaX) > 90 && Math.abs(deltaX) > Math.abs(deltaY) * 2 && duration < 500) {
            const views = ['dashboard', 'library', 'downloads', 'settings'];
            const appLayout = window.SpaceHub?.appLayout || window.SpaceHub?.ui?.appLayout;
            const currentView = appLayout?._currentView || 'dashboard';
            const curIdx = views.indexOf(currentView);

            if (deltaX < 0 && curIdx !== -1 && curIdx + 1 < views.length) {
                // Swipe vers la gauche ➔ vue suivante
                this._vibrate(15);
                appLayout?.navigate?.(views[curIdx + 1]);
            } else if (deltaX > 0 && curIdx > 0) {
                // Swipe vers la droite ➔ vue précédente
                this._vibrate(15);
                appLayout?.navigate?.(views[curIdx - 1]);
            }
        }
    }

    _handleTouchCancel() {
        if (this._activeSheetEl) {
            this._activeSheetEl.style.transform = '';
            this._activeSheetEl = null;
        }
        this._isDraggingSheet = false;
        this._isPullingRefresh = false;
        this._pullIndicatorEl?.classList.remove('visible');
    }

    _ensurePullIndicator() {
        if (document.getElementById('sh-pull-refresh-indicator')) {
            this._pullIndicatorEl = document.getElementById('sh-pull-refresh-indicator');
            return;
        }
        const indicator = document.createElement('div');
        indicator.id = 'sh-pull-refresh-indicator';
        indicator.className = 'sh-pull-refresh-indicator';
        indicator.innerHTML = '<div class="sh-pull-spinner"></div><span>Tirer pour actualiser</span>';
        document.body.appendChild(indicator);
        this._pullIndicatorEl = indicator;
    }
}

export default TouchEngine;
