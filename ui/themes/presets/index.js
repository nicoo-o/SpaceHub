/**
 * SpaceHub — Theme Presets
 * Version: 0.3.0
 *
 * Tous les thèmes SpaceHub sont définis ici comme des surcharges
 * des tokens CSS de base (ui/design-system/tokens.css).
 * Chaque preset est un objet { id, name, variables: Record<string,string> }.
 */

'use strict';

/** @type {Array<{ id: string, name: string, emoji: string, variables: Record<string,string> }>} */
const PRESETS = [

    // ─── SpaceHub Dark (défaut) ──────────────────────────────────────────────
    {
        id: 'spacehub-dark',
        name: 'SpaceHub Dark',
        emoji: '🌌',
        variables: {}, // Tokens de base — rien à surcharger
    },

    // ─── SpaceHub Light ───────────────────────────────────────────────────────
    {
        id: 'spacehub-light',
        name: 'SpaceHub Light',
        emoji: '☀️',
        variables: {
            '--sh-bg-base':       '#f4f4f8',
            '--sh-bg-surface':    '#ffffff',
            '--sh-bg-surface-2':  '#f0f0f6',
            '--sh-bg-surface-3':  '#e4e4ee',
            '--sh-bg-overlay':    'rgba(0,0,0,0.5)',
            '--sh-text-primary':  '#1a1a2e',
            '--sh-text-secondary':'#4a4a6a',
            '--sh-text-muted':    '#9898b8',
            '--sh-border-color':  'rgba(0,0,0,0.1)',
            '--sh-border-color-hover': 'rgba(0,0,0,0.2)',
            '--sh-shadow-sm':     '0 1px 3px rgba(0,0,0,0.1)',
            '--sh-shadow-md':     '0 4px 16px rgba(0,0,0,0.12)',
            '--sh-shadow-lg':     '0 12px 40px rgba(0,0,0,0.15)',
        },
    },

    // ─── Nothing OS ───────────────────────────────────────────────────────────
    {
        id: 'nothing-os',
        name: 'Nothing OS',
        emoji: '⚫',
        variables: {
            '--sh-color-primary':       '#ff3c00',
            '--sh-color-primary-hover': '#ff6033',
            '--sh-color-primary-rgb':   '255, 60, 0',
            '--sh-bg-base':             '#0a0a0a',
            '--sh-bg-surface':          '#111111',
            '--sh-bg-surface-2':        '#1a1a1a',
            '--sh-bg-surface-3':        '#242424',
            '--sh-text-primary':        '#ffffff',
            '--sh-text-secondary':      '#888888',
            '--sh-text-muted':          '#444444',
            '--sh-border-color':        'rgba(255,255,255,0.06)',
            '--sh-font-family':         '"Ndot", "Nothing Sans", monospace',
            '--sh-radius-sm':           '0px',
            '--sh-radius-md':           '2px',
            '--sh-radius-lg':           '4px',
            '--sh-radius-xl':           '4px',
        },
    },

    // ─── Cyberpunk ────────────────────────────────────────────────────────────
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        emoji: '🟡',
        variables: {
            '--sh-color-primary':       '#f7e000',
            '--sh-color-primary-hover': '#ffe84d',
            '--sh-color-primary-rgb':   '247, 224, 0',
            '--sh-color-secondary':     '#00f5ff',
            '--sh-bg-base':             '#0d0017',
            '--sh-bg-surface':          '#13001f',
            '--sh-bg-surface-2':        '#1c0030',
            '--sh-bg-surface-3':        '#260040',
            '--sh-text-primary':        '#f7e000',
            '--sh-text-secondary':      '#c084fc',
            '--sh-text-muted':          '#7c3aed',
            '--sh-border-color':        'rgba(247,224,0,0.15)',
            '--sh-border-color-focus':  '#f7e000',
            '--sh-shadow-primary':      '0 4px 20px rgba(247,224,0,0.3)',
            '--sh-shadow-glow':         '0 0 30px rgba(247,224,0,0.4)',
            '--sh-radius-sm':           '2px',
            '--sh-radius-md':           '4px',
        },
    },

    // ─── Nord ─────────────────────────────────────────────────────────────────
    {
        id: 'nord',
        name: 'Nord',
        emoji: '🧊',
        variables: {
            '--sh-color-primary':       '#88c0d0',
            '--sh-color-primary-hover': '#a3d0e0',
            '--sh-color-primary-rgb':   '136, 192, 208',
            '--sh-color-secondary':     '#a3be8c',
            '--sh-bg-base':             '#2e3440',
            '--sh-bg-surface':          '#3b4252',
            '--sh-bg-surface-2':        '#434c5e',
            '--sh-bg-surface-3':        '#4c566a',
            '--sh-text-primary':        '#eceff4',
            '--sh-text-secondary':      '#d8dee9',
            '--sh-text-muted':          '#81a1c1',
            '--sh-border-color':        'rgba(236,239,244,0.08)',
            '--sh-color-success':       '#a3be8c',
            '--sh-color-warning':       '#ebcb8b',
            '--sh-color-danger':        '#bf616a',
            '--sh-color-info':          '#5e81ac',
        },
    },

    // ─── Catppuccin Mocha ─────────────────────────────────────────────────────
    {
        id: 'catppuccin-mocha',
        name: 'Catppuccin Mocha',
        emoji: '🐱',
        variables: {
            '--sh-color-primary':       '#cba6f7',
            '--sh-color-primary-hover': '#d8bbff',
            '--sh-color-primary-rgb':   '203, 166, 247',
            '--sh-color-secondary':     '#94e2d5',
            '--sh-bg-base':             '#1e1e2e',
            '--sh-bg-surface':          '#181825',
            '--sh-bg-surface-2':        '#313244',
            '--sh-bg-surface-3':        '#45475a',
            '--sh-text-primary':        '#cdd6f4',
            '--sh-text-secondary':      '#bac2de',
            '--sh-text-muted':          '#7f849c',
            '--sh-border-color':        'rgba(205,214,244,0.07)',
            '--sh-color-success':       '#a6e3a1',
            '--sh-color-warning':       '#f9e2af',
            '--sh-color-danger':        '#f38ba8',
            '--sh-color-info':          '#89dceb',
        },
    },

    // ─── Tokyo Night ──────────────────────────────────────────────────────────
    {
        id: 'tokyo-night',
        name: 'Tokyo Night',
        emoji: '🌃',
        variables: {
            '--sh-color-primary':       '#7aa2f7',
            '--sh-color-primary-hover': '#9ab4f9',
            '--sh-color-primary-rgb':   '122, 162, 247',
            '--sh-color-secondary':     '#bb9af7',
            '--sh-bg-base':             '#1a1b26',
            '--sh-bg-surface':          '#16161e',
            '--sh-bg-surface-2':        '#1f2335',
            '--sh-bg-surface-3':        '#24283b',
            '--sh-text-primary':        '#c0caf5',
            '--sh-text-secondary':      '#9aa5ce',
            '--sh-text-muted':          '#565f89',
            '--sh-border-color':        'rgba(192,202,245,0.07)',
            '--sh-color-success':       '#9ece6a',
            '--sh-color-warning':       '#e0af68',
            '--sh-color-danger':        '#f7768e',
            '--sh-color-info':          '#73daca',
        },
    },

    // ─── Material You ─────────────────────────────────────────────────────────
    {
        id: 'material-you',
        name: 'Material You',
        emoji: '🎨',
        variables: {
            '--sh-color-primary':       '#d0bcff',
            '--sh-color-primary-hover': '#e0d3ff',
            '--sh-color-primary-rgb':   '208, 188, 255',
            '--sh-color-secondary':     '#ccc2dc',
            '--sh-bg-base':             '#1c1b1f',
            '--sh-bg-surface':          '#201f23',
            '--sh-bg-surface-2':        '#2b2930',
            '--sh-bg-surface-3':        '#36343b',
            '--sh-text-primary':        '#e6e1e5',
            '--sh-text-secondary':      '#cac4d0',
            '--sh-text-muted':          '#938f99',
            '--sh-border-color':        'rgba(230,225,229,0.08)',
            '--sh-radius-sm':           '12px',
            '--sh-radius-md':           '16px',
            '--sh-radius-lg':           '24px',
            '--sh-radius-xl':           '28px',
        },
    },

    // ─── Minimal ─────────────────────────────────────────────────────────────
    {
        id: 'minimal',
        name: 'Minimal',
        emoji: '⬜',
        variables: {
            '--sh-color-primary':       '#ffffff',
            '--sh-color-primary-hover': '#cccccc',
            '--sh-color-primary-rgb':   '255,255,255',
            '--sh-color-secondary':     '#888888',
            '--sh-bg-base':             '#000000',
            '--sh-bg-surface':          '#0a0a0a',
            '--sh-bg-surface-2':        '#111111',
            '--sh-bg-surface-3':        '#1a1a1a',
            '--sh-text-primary':        '#ffffff',
            '--sh-text-secondary':      '#888888',
            '--sh-text-muted':          '#444444',
            '--sh-border-color':        'rgba(255,255,255,0.1)',
            '--sh-radius-sm':           '0px',
            '--sh-radius-md':           '0px',
            '--sh-radius-lg':           '0px',
            '--sh-shadow-sm':           'none',
            '--sh-shadow-md':           'none',
            '--sh-shadow-lg':           'none',
        },
    },
];

export default PRESETS;

/**
 * Retourne un preset par son ID.
 * @param {string} id
 * @returns {{ id, name, emoji, variables }|undefined}
 */
export function getPreset(id) {
    return PRESETS.find(p => p.id === id);
}
