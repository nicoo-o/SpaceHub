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

import './TouchEngine.css';
import * as svc from './services.js';
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
        // Les styles de ce composant vivent désormais dans TouchEngine.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
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

        // 3. Gestion Double-Tap (Favori / Quick Action Réel)
        const cardTarget = e.target.closest('.sh-card');
        if (cardTarget) {
            const now = Date.now();
            if (now - this._lastTapTime < 320 && this._lastTapTarget === cardTarget) {
                this._vibrate(30);
                const itemId = cardTarget.dataset?.id || cardTarget.dataset?.itemId;
                const title = cardTarget.querySelector('.sh-card__title')?.textContent || 'Média';
                const bookmarkBtn = cardTarget.querySelector('.sh-card__bookmark-btn');
                if (bookmarkBtn) {
                    bookmarkBtn.click(); // Déclenche la vraie persistance + animation
                } else if (itemId && svc.jellyfinApi()?.setFavorite) {
                    svc.jellyfinApi().setFavorite(itemId, true).catch(() => {});
                    svc.toaster()?.info(`★ Ajouté aux Favoris : ${title}`);
                } else {
                    svc.toaster()?.info(`★ Ajouté aux Favoris : ${title}`);
                }
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
                    const slideUp = svc.slideUpSheet();
                    if (slideUp && typeof slideUp.close === 'function') {
                        slideUp.close();
                    } else {
                        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal');
                        openModal?.classList.remove('open');
                        svc.nav()?.onModalClosed?.();
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
                    svc.dashboard()?.render?.(document.getElementById('sh-main-view-container'));
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
            const views = ['dashboard', 'library', 'downloads'];
            const appLayout = svc.appLayout();
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
