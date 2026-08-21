/**
 * SpaceHub — TV Mode (10-foot UI)
 * Version: 1.0.0
 *
 * Mode d'interface optimisé pour les téléviseurs et grandes distances.
 * Navigation au clavier/telecommande, éléments agrandis, contraste amélioré.
 */

'use strict';

import Logger from '../../core/Logger.js';

class TVMode {
    constructor(eventBus, settings) {
        this._log = new Logger('TVMode');
        this._eventBus = eventBus;
        this._settings = settings;
        this._enabled = false;
        this._focusedElement = null;
        this._focusableElements = [];
        this._currentIndex = 0;

        this._registerDefaults();
        this._initListeners();
        this._log.info('TV Mode initialisé.');
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'tv.enabled': false,
            'tv.autoActivate': false,
            'tv.animationSpeed': 'slow',
            'tv.showCursor': false
        });
    }

    _initListeners() {
        // Écouter les raccourcis clavier pour activer/désactiver
        document.addEventListener('keydown', (e) => {
            // F11 ou Ctrl+T pour toggle
            if (e.key === 'F11' || (e.ctrlKey && e.key === 't')) {
                e.preventDefault();
                this.toggle();
            }
        });

        // Navigation clavier en mode TV
        document.addEventListener('keydown', (e) => this._handleKeyNavigation(e));
    }

    /**
     * Active le mode TV.
     */
    enable() {
        if (this._enabled) return;
        
        this._enabled = true;
        this._settings.set('tv.enabled', true);
        document.body.classList.add('sh-tv-mode');
        this._injectTVStyles();
        this._updateFocusableElements();
        this._focusFirstElement();
        
        this._log.info('Mode TV activé');
        this._eventBus.emit('tv:enabled');
    }

    /**
     * Désactive le mode TV.
     */
    disable() {
        if (!this._enabled) return;
        
        this._enabled = false;
        this._settings.set('tv.enabled', false);
        document.body.classList.remove('sh-tv-mode');
        
        this._log.info('Mode TV désactivé');
        this._eventBus.emit('tv:disabled');
    }

    /**
     * Bascule le mode TV.
     */
    toggle() {
        if (this._enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    /**
     * Gère la navigation au clavier.
     * @private
     */
    _handleKeyNavigation(e) {
        if (!this._enabled) return;

        const key = e.key;
        
        switch (key) {
            case 'ArrowUp':
                e.preventDefault();
                this._navigate(-1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this._navigate(1);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this._navigateHorizontal(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this._navigateHorizontal(1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this._activateFocused();
                break;
            case 'Escape':
                e.preventDefault();
                this._goBack();
                break;
        }
    }

    /**
     * Navigation verticale.
     * @private
     */
    _navigate(direction) {
        if (this._focusableElements.length === 0) return;
        
        this._currentIndex = Math.max(0, Math.min(this._focusableElements.length - 1, this._currentIndex + direction));
        this._focusElement(this._focusableElements[this._currentIndex]);
    }

    /**
     * Navigation horizontale.
     * @private
     */
    _navigateHorizontal(direction) {
        const current = this._focusableElements[this._currentIndex];
        if (!current) return;

        const rect = current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Trouver l'élément le plus proche dans la direction horizontale
        let closest = null;
        let closestDist = Infinity;

        for (let i = 0; i < this._focusableElements.length; i++) {
            if (i === this._currentIndex) continue;
            
            const elem = this._focusableElements[i];
            const elemRect = elem.getBoundingClientRect();
            const elemCenterX = elemRect.left + elemRect.width / 2;
            const elemCenterY = elemRect.top + elemRect.height / 2;

            // Vérifier que c'est dans la bonne direction
            if (direction > 0 && elemCenterX <= centerX) continue;
            if (direction < 0 && elemCenterX >= centerX) continue;

            // Vérifier que c'est approximativement sur la même ligne
            if (Math.abs(elemCenterY - centerY) > rect.height * 1.5) continue;

            const dist = Math.abs(elemCenterX - centerX);
            if (dist < closestDist) {
                closestDist = dist;
                closest = i;
            }
        }

        if (closest !== null) {
            this._currentIndex = closest;
            this._focusElement(this._focusableElements[closest]);
        }
    }

    /**
     * Active l'élément focusé.
     * @private
     */
    _activateFocused() {
        const elem = this._focusableElements[this._currentIndex];
        if (elem) {
            elem.click();
            this._triggerHapticFeedback();
        }
    }

    /**
     * Retour en arrière.
     * @private
     */
    _goBack() {
        // Utiliser le routeur SpaceHub si disponible
        if (window.SpaceHub?.core?.router) {
            window.SpaceHub.core.router.back();
        } else {
            history.back();
        }
    }

    /**
     * Met le focus sur un élément.
     * @private
     */
    _focusElement(elem) {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
        }

        this._focusedElement = elem;
        elem.classList.add('sh-tv-focused');
        
        // Scroll vers l'élément si nécessaire
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Met le focus sur le premier élément.
     * @private
     */
    _focusFirstElement() {
        if (this._focusableElements.length > 0) {
            this._currentIndex = 0;
            this._focusElement(this._focusableElements[0]);
        }
    }

    /**
     * Met à jour la liste des éléments focusables.
     * @private
     */
    _updateFocusableElements() {
        const selectors = [
            'button:not([disabled])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
            '.sh-card',
            '.sh-media-item'
        ];

        this._focusableElements = Array.from(document.querySelectorAll(selectors.join(', ')));
    }

    /**
     * Feedback haptique (vibration sur télécommandes compatibles).
     * @private
     */
    _triggerHapticFeedback() {
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    }

    /**
     * Injecte les styles spécifiques au mode TV.
     * @private
     */
    _injectTVStyles() {
        if (document.getElementById('sh-tv-styles')) return;

        const style = document.createElement('style');
        style.id = 'sh-tv-styles';
        style.textContent = `
/* Mode TV - 10-foot UI */
body.sh-tv-mode {
    cursor: none;
    font-size: 18px;
}

body.sh-tv-mode * {
    cursor: none !important;
}

/* Éléments focusables agrandis */
body.sh-tv-mode button,
body.sh-tv-mode a,
body.sh-tv-mode .sh-card,
body.sh-tv-mode .sh-media-item {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* Focus visible */
body.sh-tv-mode .sh-tv-focused {
    outline: 4px solid var(--sh-color-primary);
    outline-offset: 4px;
    transform: scale(1.05);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 100;
}

/* Navigation */
body.sh-tv-mode .sh-nav-item {
    padding: 16px 24px;
    font-size: 20px;
}

/* Cards agrandies */
body.sh-tv-mode .sh-card {
    padding: 24px;
    min-height: 200px;
}

body.sh-tv-mode .sh-media-item {
    min-width: 200px;
    min-height: 300px;
}

/* Inputs agrandis */
body.sh-tv-mode input,
body.sh-tv-mode select {
    padding: 16px;
    font-size: 18px;
    min-height: 48px;
}

/* Scrollbar visible et agrandie */
body.sh-tv-mode ::-webkit-scrollbar {
    width: 16px;
}

body.sh-tv-mode ::-webkit-scrollbar-track {
    background: var(--sh-bg-surface-2);
}

body.sh-tv-mode ::-webkit-scrollbar-thumb {
    background: var(--sh-color-primary);
    border-radius: 8px;
}

/* Modal agrandie */
body.sh-tv-mode .sh-modal {
    min-width: 80vw;
    min-height: 80vh;
}

/* Animation plus lente */
body.sh-tv-mode .sh-tv-animation-slow * {
    transition-duration: 0.4s !important;
}

/* Contraste amélioré */
body.sh-tv-mode {
    --sh-text-primary: #ffffff;
    --sh-text-secondary: #e0e0e0;
    --sh-bg-surface-1: #1a1a1a;
    --sh-bg-surface-2: #252525;
    --sh-bg-surface-3: #303030;
}

/* Grid spacing augmenté */
body.sh-tv-mode .sh-photos-grid,
body.sh-tv-mode .sh-livetv-grid {
    gap: 32px;
    padding: 32px;
}

/* Boutons de navigation TV */
body.sh-tv-mode .sh-tv-nav-hint {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 1000;
}

body.sh-tv-mode .sh-tv-nav-hint kbd {
    background: rgba(255, 255, 255, 0.2);
    padding: 4px 8px;
    border-radius: 4px;
    margin: 0 4px;
}
        `;
        document.head.appendChild(style);
    }

    /**
     * Affiche les indices de navigation.
     */
    showNavHints() {
        if (!this._enabled) return;

        let hints = document.getElementById('sh-tv-nav-hints');
        if (!hints) {
            hints = document.createElement('div');
            hints.id = 'sh-tv-nav-hints';
            hints.className = 'sh-tv-nav-hint';
            document.body.appendChild(hints);
        }

        hints.innerHTML = `
            <kbd>↑↓</kbd> Navigation
            <kbd>←→</kbd> Horizontal
            <kbd>Enter</kbd> Sélectionner
            <kbd>Esc</kbd> Retour
            <kbd>F11</kbd> Quitter mode TV
        `;
    }

    /**
     * Cache les indices de navigation.
     */
    hideNavHints() {
        const hints = document.getElementById('sh-tv-nav-hints');
        if (hints) {
            hints.remove();
        }
    }

    /**
     * Vérifie si le mode TV est activé.
     */
    isEnabled() {
        return this._enabled;
    }
}

export default TVMode;
