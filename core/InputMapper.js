/**
 * SpaceHub — Unified Input Mapper (Navigation v10)
 * Version: 2.0.0
 * Standardisation des événements d'entrée pour Clavier, Télécommandes, Manettes et Gestes.
 */

'use strict';

export const NavAction = {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    SELECT: 'select',
    BACK: 'back',
    MENU: 'menu',
    PLAY_PAUSE: 'play_pause',
    PAGE_UP: 'page_up',
    PAGE_DOWN: 'page_down'
};

/**
 * Mappe un événement clavier KeyboardEvent en action de navigation universelle
 * @param {KeyboardEvent} e
 * @returns {string|null} Action NavAction ou null si non reconnue
 */
export function mapKeyboardEvent(e) {
    if (!e || !e.key) return null;

    switch (e.key) {
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

        case 'Enter':
        case 'Accept':
            return NavAction.SELECT;

        case 'Escape':
        case 'BrowserBack':
        case 'Backspace':
            return NavAction.BACK;

        case 'ContextMenu':
        case 'Menu':
        case 'F10':
        case 'Apps':
        case 'Guide':
            return NavAction.MENU;

        case 'MediaPlayPause':
        case 'Play':
        case 'Pause':
            return NavAction.PLAY_PAUSE;

        case 'PageUp':
        case 'ChannelUp':
            return NavAction.PAGE_UP;

        case 'PageDown':
        case 'ChannelDown':
            return NavAction.PAGE_DOWN;

        default:
            return null;
    }
}

/**
 * Vérifie si l'action est une direction spatiale
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
