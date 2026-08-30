/**
 * SpaceHub — InputMapper (Grand Cinema Edition v8.0)
 * Normalisation et abstraction universelle des entrées matérielles :
 * Clavier, Télécommandes Smart TV / Android TV, et Gamepad.
 */

'use strict';

/**
 * Actions sémantiques normalisées
 * @enum {string}
 */
export const NavAction = Object.freeze({
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    SELECT: 'select',
    BACK: 'back',
    PLAY_PAUSE: 'play_pause',
    PAGE_UP: 'page_up',
    PAGE_DOWN: 'page_down'
});

/**
 * Mappe un KeyboardEvent standard ou Smart TV vers une action sémantique NavAction
 * @param {KeyboardEvent} event
 * @returns {string|null}
 */
export function mapKeyboardEvent(event) {
    if (!event || !event.key) return null;

    // Prise en charge des touches spéciales Smart TV (Tizen, WebOS, Android TV, Fire TV)
    switch (event.key) {
        // Navigation Directionnelle
        case 'ArrowUp':
        case 'Up':
            return NavAction.UP;

        case 'ArrowDown':
        case 'Down':
            return NavAction.DOWN;

        case 'ArrowLeft':
        case 'Left':
            return NavAction.LEFT;

        case 'ArrowRight':
        case 'Right':
            return NavAction.RIGHT;

        // Validation / Clic
        case 'Enter':
        case ' ': // Espace sur les télécommandes / claviers
        case 'Select':
        case 'Ok':
            return NavAction.SELECT;

        // Retour Arrière / Annulation
        case 'ContextMenu':
        case 'Menu':
        case 'Guide':
            return NavAction.MENU;
        case 'Escape':
        case 'Esc':
        case 'Backspace':
        case 'BrowserBack':
        case 'GoBack':
        case 'Back':
        case 'XF86Back':
            return NavAction.BACK;

        // Contrôles Médias
        case 'MediaPlayPause':
        case 'MediaPlay':
        case 'MediaPause':
        case 'PlayPause':
            return NavAction.PLAY_PAUSE;

        // Pagination rapide
        case 'PageUp':
        case 'ChannelUp':
        case 'MediaTrackPrevious':
            return NavAction.PAGE_UP;
        case 'PageDown':
        case 'ChannelDown':
        case 'MediaTrackNext':
            return NavAction.PAGE_DOWN;
        case 'ChannelUp':
            return NavAction.PAGE_UP;

        case 'PageDown':
        case 'ChannelDown':
            return NavAction.PAGE_DOWN;

        default:
            // Fallback sur keyCode pour anciennes télécommandes Android TV / WebOS
            if (event.keyCode === 38) return NavAction.UP;
            if (event.keyCode === 40) return NavAction.DOWN;
            if (event.keyCode === 37) return NavAction.LEFT;
            if (event.keyCode === 39) return NavAction.RIGHT;
            if (event.keyCode === 13) return NavAction.SELECT;
            if (event.keyCode === 27 || event.keyCode === 8 || event.keyCode === 10009 || event.keyCode === 461) return NavAction.BACK;
            return null;
    }
}

/**
 * Vérifie si une action est un mouvement directionnel
 * @param {string} action
 * @returns {boolean}
 */
export function isDirectionAction(action) {
    return (
        action === NavAction.UP ||
        action === NavAction.DOWN ||
        action === NavAction.LEFT ||
        action === NavAction.RIGHT
    );
}

export default {
    NavAction,
    mapKeyboardEvent,
    isDirectionAction
};
