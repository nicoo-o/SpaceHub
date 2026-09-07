/**
 * SpaceHub — Theme Presets
 * Version: 0.3.0
 *
 * Tous les thèmes SpaceHub sont définis ici comme des surcharges
 * des tokens CSS de base (public/design-system/tokens.css).
 * Chaque preset est un objet { id, name, variables: Record<string,string> }.
 */

'use strict';

/** @type {Array<{ id: string, name: string, emoji: string, variables: Record<string,string> }>} */
const PRESETS = [

    // ─── Sombre (Défaut) ──────────────────────────────────────────────────────
    {
        id: 'spacehub-dark',
        name: 'Sombre',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a7 7 0 1 0 10 10A10 10 0 0 1 12 2z"></path></svg>`,
        variables: {}, // Base tokens dans public/design-system/tokens.css
    },

    // ─── Clair ────────────────────────────────────────────────────────────────
    // Valeurs de départ — à valider visuellement en recette (contraste, lisibilité
    // des affiches sur fond clair) avant de les considérer définitives. Certaines
    // règles ailleurs dans l'app peuvent coder une couleur sombre en dur plutôt que
    // via une variable --sh-* ; un passage de recherche ciblé reste à faire (cf.
    // PLAN_CHANTIERS_BCD_2026-09-01.md §2.2).
    {
        id: 'spacehub-light',
        name: 'Clair',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
        variables: {
            // Pivot principal : toute l'encre de l'interface passe du blanc au noir.
            // À elle seule cette ligne bascule ~1050 couleurs réparties dans toute l'app
            // (surfaces translucides, bordures, textes secondaires, séparateurs...).
            '--sh-ink':                 '0, 0, 0',
            '--sh-ink-solid':           '#111113',
            '--sh-ink-solid-inv':       '#ffffff',
            '--sh-ink-inv':             '255, 255, 255',

            // Fonds opaques : seuls ceux-ci sont écrits en dur dans tokens.css
            '--sh-bg-base':             '#f4f4f5',
            '--sh-bg-base-rgb':         '244, 244, 245',
            '--sh-bg-surface':          '#ffffff',
            '--sh-bg-surface-2':        '#ececee',
            '--sh-bg-surface-3':        '#e0e0e3',
            '--sh-bg-overlay':          'rgba(255, 255, 255, 0.88)',
            '--sh-bg-glass-heavy':      'rgba(255, 255, 255, 0.92)',
            '--sh-card-bg':             '#ffffff',

            // Textes et actions : inversion des valeurs opaques
            '--sh-text-primary':        '#111113',
            '--sh-text-on-primary':     '#ffffff',
            '--sh-input-text':          '#111113',
            '--sh-color-primary':       '#111113',
            '--sh-color-primary-hover': '#28282b',
            '--sh-color-primary-active':'#3a3a3d',
            '--sh-color-primary-rgb':   '17, 17, 19',

            // Anneau de focus : orange assombri. Le #ff9f0a d'Apple n'atteint
            // pas 3:1 sur blanc — sous ce seuil, un contour cesse d'être lisible
            // pour une bonne partie des gens. La teinte reste franchement orange.
            '--sh-focus-ring-rgb':      '198, 92, 0',
            '--sh-focus-ring':          'rgb(198, 92, 0)',
            '--sh-focus-glow':          'rgba(198, 92, 0, 0.30)',
            // Ombres adoucies : le noir pur cerne les cartes d'un halo sale sur fond clair.
            '--sh-shadow-rgb': '116, 116, 132',
            // …et l'OPACITÉ doit baisser aussi. Les quatre paliers de l'échelle
            // sont calibrés pour du blanc sur noir (0,5 à 0,95) ; appliqués tels
            // quels sur un fond #f4f4f5, ils dessinent exactement le halo sale
            // que la ligne précédente cherche à éviter.
            '--sh-shadow-sm':           '0 2px 8px rgba(var(--sh-shadow-rgb), 0.12)',
            '--sh-shadow-md':           '0 8px 24px rgba(var(--sh-shadow-rgb), 0.16)',
            '--sh-shadow-lg':           '0 16px 48px rgba(var(--sh-shadow-rgb), 0.20)',
            '--sh-shadow-xl':           '0 32px 80px rgba(var(--sh-shadow-rgb), 0.24)',

            // Interrupteurs : la piste active était `#ffffff` en dur — blanche
            // sur une surface blanche, donc invisible une fois cochée.
            '--sh-toggle-on':           '#111113',
            '--sh-toggle-thumb':        '#ffffff',
            '--sh-toggle-off':          'rgba(0, 0, 0, 0.22)',

            // Chevron des listes déroulantes, en encre sombre.
            '--sh-select-chevron':      "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(17,17,19,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",

            // Ombres : restent noires (une ombre blanche ferait un halo cassé)
            '--sh-card-shadow-hover':   '0 24px 60px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.10)',
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
