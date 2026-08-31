/**
 * SpaceHub — Gooey Carousel Scroller (Apple & Framer Motion Style)
 * Version: 1.1.0
 *
 * Moteur de défilement horizontal fluide avec :
 * - Défilement par glisser-déplacer (drag) avec inertie physique et friction.
 * - Chevrons de défilement latéraux gauche/droite automatiques au survol de l'étagère.
 */

'use strict';

class GooeyCarouselScroller {
    constructor() {
        this._attachedContainers = new WeakSet();
        this._cleanups = new Set();
        this._inertiaFrames = new Set();
        this._injectStyles();
    }

    /**
     * Attache le comportement de défilement et les chevrons sur tous les conteneurs correspondants.
     * @param {HTMLElement|string} target
     */
    attach(target) {
        const elements = typeof target === 'string' 
            ? document.querySelectorAll(target)
            : (target instanceof HTMLElement ? [target] : []);

        elements.forEach(el => {
            if (this._attachedContainers.has(el)) return;
            this._setupScroller(el);
            this._attachedContainers.add(el);
        });
    }

    _setupScroller(container) {
        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;
        let velocity = 0;
        let lastX = 0;
        let lastTime = 0;
        let animationFrameId = null;

        container.classList.add('sh-gooey-scroll-enabled');

        const onMouseDown = (e) => {
            // Ignorer si on clique sur un bouton interactif ou un lien
            if (e.target.closest('button, a, input, [role="button"], .sh-shelf-nav-btn')) return;

            isDown = true;
            container.classList.add('sh-gooey-grabbing');
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
            lastX = e.pageX;
            lastTime = performance.now();
            velocity = 0;

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        };

        const onMouseLeave = () => {
            if (!isDown) return;
            isDown = false;
            container.classList.remove('sh-gooey-grabbing');
            this._applyInertia(container, velocity);
        };

        const onMouseUp = () => {
            if (!isDown) return;
            isDown = false;
            container.classList.remove('sh-gooey-grabbing');
            this._applyInertia(container, velocity);
        };

        const onMouseMove = (e) => {
            if (!isDown) return;
            e.preventDefault();

            const now = performance.now();
            const dt = Math.max(1, now - lastTime);
            const currentX = e.pageX;
            const deltaX = currentX - lastX;

            velocity = deltaX / dt;
            lastX = currentX;
            lastTime = now;

            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 1.35; // Vitesse de suivi

            container.scrollLeft = scrollLeft - walk;
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mouseleave', onMouseLeave);
        container.addEventListener('mouseup', onMouseUp);
        container.addEventListener('mousemove', onMouseMove);

        this._cleanups.add(() => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            container.classList.remove('sh-gooey-scroll-enabled', 'sh-gooey-grabbing');
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mouseleave', onMouseLeave);
            container.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('mousemove', onMouseMove);
        });

        // ── Chevrons de Navigation Latéraux (Shelf Edge Chevrons) ──
        this._attachEdgeChevrons(container);
    }

    _attachEdgeChevrons(container) {
        const parent = container.parentElement || container;
        if (parent.querySelector(':scope > .sh-shelf-nav-btn--prev')) return;

        const parentPos = window.getComputedStyle(parent).position;
        if (parentPos === 'static') {
            parent.style.position = 'relative';
        }

        const prevBtn = document.createElement('button');
        prevBtn.className = 'sh-shelf-nav-btn sh-shelf-nav-btn--prev sh-shelf-nav-btn--hidden';
        prevBtn.setAttribute('aria-label', 'Défiler vers la gauche');
        prevBtn.title = 'Défiler vers la gauche';
        prevBtn.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        `;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'sh-shelf-nav-btn sh-shelf-nav-btn--next';
        nextBtn.setAttribute('aria-label', 'Défiler vers la droite');
        nextBtn.title = 'Défiler vers la droite';
        nextBtn.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;

        parent.appendChild(prevBtn);
        parent.appendChild(nextBtn);

        const updateButtons = () => {
            const maxScroll = container.scrollWidth - container.clientWidth;
            const hasScroll = maxScroll > 8;
            if (!hasScroll) {
                prevBtn.classList.add('sh-shelf-nav-btn--hidden');
                nextBtn.classList.add('sh-shelf-nav-btn--hidden');
                container.classList.remove('sh-grid-scrolled-middle', 'sh-grid-scrolled-end');
                return;
            }

            const atStart = container.scrollLeft <= 8;
            const atEnd = (maxScroll - container.scrollLeft) <= 8;

            prevBtn.classList.toggle('sh-shelf-nav-btn--hidden', atStart);
            nextBtn.classList.toggle('sh-shelf-nav-btn--hidden', atEnd);

            // Gestion du masque de fondu cinématique sur les bords
            if (atStart) {
                container.classList.remove('sh-grid-scrolled-middle', 'sh-grid-scrolled-end');
            } else if (atEnd) {
                container.classList.remove('sh-grid-scrolled-middle');
                container.classList.add('sh-grid-scrolled-end');
            } else {
                container.classList.remove('sh-grid-scrolled-end');
                container.classList.add('sh-grid-scrolled-middle');
            }
        };

        const getStep = () => {
            const firstCard = container.querySelector('.sh-card');
            if (firstCard) {
                const cardWidth = firstCard.offsetWidth + 24; // Largeur carte + espacement
                const cardsPerPage = Math.max(1, Math.floor((container.clientWidth - 40) / cardWidth));
                return cardsPerPage * cardWidth;
            }
            return Math.max(320, Math.floor(container.clientWidth * 0.75));
        };

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.scrollBy({ left: -getStep(), behavior: 'smooth' });
            setTimeout(updateButtons, 350);
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.scrollBy({ left: getStep(), behavior: 'smooth' });
            setTimeout(updateButtons, 350);
        });

        container.addEventListener('scroll', updateButtons, { passive: true });
        window.addEventListener('resize', updateButtons, { passive: true });

        // ── Détection de zone de fondu : affiche la bonne flèche selon la position X de la souris ──
        const EDGE_ZONE = 80; // px depuis le bord gauche/droit qui déclenche la flèche

        const onParentMouseMove = (e) => {
            const rect = parent.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;

            const inLeftZone  = x <= EDGE_ZONE;
            const inRightZone = x >= w - EDGE_ZONE;

            // Flèche gauche : visible si dans zone gauche ET bouton non caché (scrollLeft > 0)
            if (inLeftZone && !prevBtn.classList.contains('sh-shelf-nav-btn--hidden')) {
                prevBtn.classList.add('sh-shelf-nav-btn--edge-active');
            } else {
                prevBtn.classList.remove('sh-shelf-nav-btn--edge-active');
            }

            // Flèche droite : visible si dans zone droite ET bouton non caché
            if (inRightZone && !nextBtn.classList.contains('sh-shelf-nav-btn--hidden')) {
                nextBtn.classList.add('sh-shelf-nav-btn--edge-active');
            } else {
                nextBtn.classList.remove('sh-shelf-nav-btn--edge-active');
            }

            updateButtons();
        };

        const onParentMouseLeave = () => {
            prevBtn.classList.remove('sh-shelf-nav-btn--edge-active');
            nextBtn.classList.remove('sh-shelf-nav-btn--edge-active');
        };

        parent.addEventListener('mousemove', onParentMouseMove);
        parent.addEventListener('mouseleave', onParentMouseLeave);

        const refreshTimers = [setTimeout(updateButtons, 200), setTimeout(updateButtons, 700)];
        this._cleanups.add(() => {
            refreshTimers.forEach(timer => clearTimeout(timer));
            container.removeEventListener('scroll', updateButtons);
            window.removeEventListener('resize', updateButtons);
            parent.removeEventListener('mousemove', onParentMouseMove);
            parent.removeEventListener('mouseleave', onParentMouseLeave);
            prevBtn.remove();
            nextBtn.remove();
        });

        // Vérification immédiate et après rendu asynchrone des images
        updateButtons();
    }

    _applyInertia(container, initialVelocity) {
        let currentVelocity = initialVelocity * 14; // Multiplicateur d'inertie
        const friction = 0.93; // Taux d'amorti naturel
        let frameId = null;

        const step = () => {
            if (frameId !== null) this._inertiaFrames.delete(frameId);
            if (Math.abs(currentVelocity) < 0.25 || !container.isConnected) return;

            container.scrollLeft -= currentVelocity;
            currentVelocity *= friction;
            frameId = requestAnimationFrame(step);
            this._inertiaFrames.add(frameId);
        };

        frameId = requestAnimationFrame(step);
        this._inertiaFrames.add(frameId);
    }

    destroy() {
        this._cleanups.forEach(cleanup => cleanup());
        this._cleanups.clear();
        this._inertiaFrames.forEach(frameId => cancelAnimationFrame(frameId));
        this._inertiaFrames.clear();
        this._attachedContainers = new WeakSet();
    }

    _injectStyles() {
        if (document.getElementById('sh-gooey-scroller-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-gooey-scroller-styles';
        style.textContent = `
.sh-gooey-scroll-enabled {
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    scroll-behavior: smooth;
}
.sh-gooey-scroll-enabled.sh-gooey-grabbing {
    cursor: grabbing !important;
    scroll-behavior: auto !important;
}

/* ── Chevrons de Navigation sur les Étagères (Apple TV Style) ── */
.sh-shelf-nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%) scale(0.92);
    z-index: 120;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(12, 12, 18, 0.92);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #ffffff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.92), 0 0 1px rgba(255, 255, 255, 0.45);
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 180ms ease,
                border-color 180ms ease,
                box-shadow 180ms ease;
}

.sh-shelf-nav-btn--prev {
    left: 4px;
}

.sh-shelf-nav-btn--next {
    right: 4px;
}

/* Révélation douce au survol de la rangée ou des boutons */
.sh-widget:hover .sh-shelf-nav-btn:not(.sh-shelf-nav-btn--hidden),
.sh-widget__content:hover .sh-shelf-nav-btn:not(.sh-shelf-nav-btn--hidden),
.sh-dashboard__item:hover .sh-shelf-nav-btn:not(.sh-shelf-nav-btn--hidden),
.sh-shelf-nav-btn:hover {
    opacity: 0.95;
    pointer-events: auto;
    transform: translateY(-50%) scale(1);
}

/* Flèche active quand la souris est dans la zone de fondu (détection JS) */
.sh-shelf-nav-btn--edge-active:not(.sh-shelf-nav-btn--hidden) {
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: translateY(-50%) scale(1.05) !important;
}

.sh-shelf-nav-btn:hover {
    opacity: 1 !important;
    background: rgba(32, 32, 48, 0.98) !important;
    border-color: rgba(255, 255, 255, 0.55) !important;
    transform: translateY(-50%) scale(1.10) !important;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.95), 0 0 18px rgba(255, 255, 255, 0.30) !important;
}

.sh-shelf-nav-btn:active {
    transform: translateY(-50%) scale(0.92) !important;
}

.sh-shelf-nav-btn--hidden {
    opacity: 0 !important;
    pointer-events: none !important;
    visibility: hidden;
}
        `;
        document.head.appendChild(style);
    }
}

export default GooeyCarouselScroller;
