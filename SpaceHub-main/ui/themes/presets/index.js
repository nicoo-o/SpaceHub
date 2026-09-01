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

    // ─── SpaceHub OLED (Défaut) ───────────────────────────────────────────────
    {
        id: 'spacehub-dark',
        name: 'SpaceHub OLED',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a7 7 0 1 0 10 10A10 10 0 0 1 12 2z"></path></svg>`,
        variables: {}, // Base tokens in tokens.css
    },

    // ─── Apple Vision Glass ──────────────────────────────────────────────────
    {
        id: 'apple-vision-glass',
        name: 'Apple Vision Glass',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="6"></rect><path d="M12 12h.01"></path></svg>`,
        variables: {
            '--sh-bg-base':             '#05070c',
            '--sh-bg-surface':          'rgba(255, 255, 255, 0.05)',
            '--sh-bg-surface-2':        'rgba(255, 255, 255, 0.09)',
            '--sh-bg-surface-3':        'rgba(255, 255, 255, 0.15)',
            '--sh-border-color':        'rgba(255, 255, 255, 0.14)',
            '--sh-text-primary':        '#ffffff',
            '--sh-text-secondary':      'rgba(255, 255, 255, 0.70)',
            '--sh-color-primary':       '#ffffff',
            '--sh-card-bg':             'rgba(255, 255, 255, 0.06)',
            '--sh-card-shadow-hover':   '0 24px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.28)',
        },
    },

    // ─── Obsidian Monochromic ────────────────────────────────────────────────
    {
        id: 'obsidian-monochromic',
        name: 'Obsidian Matte',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg>`,
        variables: {
            '--sh-bg-base':             '#000000',
            '--sh-bg-surface':          '#0d0d0d',
            '--sh-bg-surface-2':        '#171717',
            '--sh-bg-surface-3':        '#222222',
            '--sh-border-color':        'rgba(255, 255, 255, 0.06)',
            '--sh-text-primary':        '#ffffff',
            '--sh-text-secondary':      '#888888',
            '--sh-color-primary':       '#ffffff',
            '--sh-card-bg':             '#0d0d0d',
        },
    },

    // ─── Tokyo Night Glass ───────────────────────────────────────────────────
    {
        id: 'tokyo-night',
        name: 'Tokyo Night Liquid',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`,
        variables: {
            '--sh-bg-base':             '#090b16',
            '--sh-bg-surface':          'rgba(26, 27, 38, 0.85)',
            '--sh-bg-surface-2':        'rgba(31, 35, 53, 0.90)',
            '--sh-bg-surface-3':        'rgba(36, 40, 59, 0.95)',
            '--sh-text-primary':        '#c0caf5',
            '--sh-text-secondary':      '#a9b1d6',
            '--sh-color-primary':       '#ffffff',
            '--sh-border-color':        'rgba(122, 162, 247, 0.12)',
            '--sh-card-bg':             'rgba(22, 22, 30, 0.90)',
        },
    },

    // ─── Nord Frost OLED ─────────────────────────────────────────────────────
    {
        id: 'nord',
        name: 'Nordic Frost Liquid',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
        variables: {
            '--sh-bg-base':             '#0e1117',
            '--sh-bg-surface':          'rgba(46, 52, 64, 0.85)',
            '--sh-bg-surface-2':        'rgba(59, 66, 82, 0.90)',
            '--sh-bg-surface-3':        'rgba(67, 76, 94, 0.95)',
            '--sh-text-primary':        '#eceff4',
            '--sh-text-secondary':      '#d8dee9',
            '--sh-color-primary':       '#ffffff',
            '--sh-border-color':        'rgba(136, 192, 208, 0.12)',
            '--sh-card-bg':             'rgba(46, 52, 64, 0.85)',
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
