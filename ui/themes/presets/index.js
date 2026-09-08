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

            // ── FONDS : l'échelle est ROUVERTE, et sa direction inversée ──
            //
            // LE PROBLÈME MESURABLE. L'ancienne échelle allait de #f4f4f5 à
            // #ffffff : environ quatre pour cent de l'échelle de luminance —
            // et l'œil est justement le moins discriminant dans les hautes
            // lumières. En sombre, de #000000 à #242424, chaque palier est un
            // écart RELATIF énorme parce qu'on part de zéro. Même nombre de
            // paliers, une fraction de la séparation perçue.
            //
            // On descend donc le fond de page et on garde les cartes en blanc :
            // la convention qui fonctionne en clair est un fond franc et des
            // surfaces qui REMONTENT vers le blanc. On gagne du contraste de
            // surface sans toucher au contraste du texte.
            //
            // LES NEUTRES SONT TEINTÉS. Un gris de saturation zéro sur un grand
            // aplat paraît mort. Le préréglage le faisait déjà pour les ombres
            // (--sh-shadow-rgb légèrement bleuté) sans l'appliquer aux fonds.
            // La teinte est froide, de deux à trois points seulement : assez
            // pour que la surface vive, pas assez pour qu'on la nomme.
            '--sh-bg-base':             '#e9ebf0',
            '--sh-bg-base-rgb':         '233, 235, 240',
            '--sh-bg-surface':          '#ffffff',
            '--sh-bg-surface-2':        '#f3f5f8',
            '--sh-bg-surface-3':        '#e4e7ee',
            '--sh-bg-overlay':          'rgba(233, 235, 240, 0.90)',
            '--sh-bg-glass':            'rgba(20, 24, 35, 0.045)',
            '--sh-bg-glass-heavy':      'rgba(255, 255, 255, 0.96)',
            '--sh-card-bg':             '#ffffff',

            // ── LE VERRE NE PRODUIT RIEN SUR DU BLANC ──
            //
            // Le préréglage ne redéfinissait AUCUN jeton de flou : blur(20px)
            // saturate(160%) restait actif en clair. Or flouter une page
            // blanche derrière un panneau blanc donne… du blanc. Le coût GPU
            // était payé en entier pour un effet nul — six couches de
            // backdrop-filter, sur le thème où elles ne rendent rien.
            //
            // Ce qui délimite réellement une surface sur fond clair, c'est un
            // TRAIT. C'est la règle des systèmes de conception sérieux : en
            // clair, une carte plate se délimite par une bordure, une carte
            // élevée par une ombre, et l'on n'échange pas l'un contre l'autre.
            '--sh-blur-chrome':         'none',
            '--sh-bg-glass-blur':       'none',
            '--sh-border-subtle':       'rgba(20, 24, 35, 0.10)',
            '--sh-border-strong':       'rgba(20, 24, 35, 0.16)',
            // Une carte plate se délimite par un trait ; une carte élevée par
            // une ombre. On ne remplace pas l'un par l'autre — les deux ont
            // chacun leur rôle, et c'est leur combinaison qui construit la
            // hiérarchie sur fond clair.
            '--sh-card-border':         '1px solid rgba(20, 24, 35, 0.09)',
            '--sh-border-color':        'rgba(20, 24, 35, 0.10)',
            '--sh-border-color-hover':  'rgba(20, 24, 35, 0.18)',
            '--sh-input-border':        'rgba(20, 24, 35, 0.16)',

            // Textes et actions : inversion des valeurs opaques
            '--sh-text-primary':        '#111113',
            '--sh-text-on-primary':     '#ffffff',
            '--sh-input-text':          '#111113',
            '--sh-color-primary':       '#111113',
            '--sh-color-primary-hover': '#28282b',
            '--sh-color-primary-active':'#3a3a3d',
            '--sh-color-primary-rgb':   '17, 17, 19',

            // ── ACCENT : la couleur que ce thème n'avait pas ──
            //
            // En sombre l'accent est clair et on l'ÉCLAIRCIT au survol ; en
            // clair il doit être foncé, et on l'ASSOMBRIT. Inverser cette
            // direction est l'erreur classique d'un thème clair dérivé d'un
            // thème sombre : le survol y devient plus pâle, donc moins visible.
            //
            // Contraste vérifié : #0b6f96 sur #ffffff donne ≈ 5,3:1, au-dessus
            // du seuil de texte de 4,5:1 — l'accent peut donc porter du texte,
            // pas seulement décorer. Un contrat automatisé le vérifie.
            '--sh-accent-rgb':          '11, 111, 150',
            '--sh-accent-fort':         '#08536f',
            '--sh-accent-doux':         'rgba(11, 111, 150, 0.12)',
            '--sh-accent-trace':        'rgba(11, 111, 150, 0.28)',
            '--sh-accent-contraste':    '#ffffff',

            // La sélection prend l'accent plutôt que l'encre pleine : un pavé
            // noir au milieu d'une page claire se lit comme une erreur
            // d'affichage, pas comme un état.
            '--sh-selection-bg':        'rgb(11, 111, 150)',
            '--sh-selection-ink':       '#ffffff',

            // Anneau de focus : orange assombri. Le #ff9f0a d'Apple n'atteint
            // pas 3:1 sur blanc — sous ce seuil, un contour cesse d'être lisible
            // pour une bonne partie des gens. La teinte reste franchement orange,
            // et l'accent est BLEU précisément pour ne pas la concurrencer :
            // l'anneau doit rester la seule chose de sa couleur à l'écran.
            '--sh-focus-ring-rgb':      '198, 92, 0',
            '--sh-focus-ring':          'rgb(198, 92, 0)',
            '--sh-focus-glow':          'rgba(198, 92, 0, 0.30)',
            // ── OMBRES : RECONSTRUITES, PAS AFFAIBLIES ──
            //
            // Le diagnostic précédent était juste — le noir pur cerne les
            // cartes d'un halo sale sur fond clair — mais le levier choisi
            // était le mauvais : baisser les opacités à 0,12–0,24. À ces
            // valeurs, sur du blanc, l'ombre n'est plus qu'un souffle. Et
            // c'était le DERNIER indice de profondeur qui restait, une fois le
            // verre devenu invisible et l'échelle des fonds refermée.
            //
            // La forme qui fonctionne en clair est une ombre à DEUX COUCHES :
            //   — un contact serré (1 à 2 px, opacité plus élevée) qui POSE
            //     l'objet sur le fond ;
            //   — une ombre d'ambiance large et très diffuse qui l'ÉLÈVE.
            // Ensemble elles se lisent nettement sans salir ; une seule ombre
            // moyenne fait exactement l'inverse.
            '--sh-shadow-rgb': '38, 48, 72',
            '--sh-shadow-sm':
                '0 1px 1px rgba(var(--sh-shadow-rgb), 0.10), '
                + '0 2px 6px rgba(var(--sh-shadow-rgb), 0.06)',
            '--sh-shadow-md':
                '0 1px 2px rgba(var(--sh-shadow-rgb), 0.12), '
                + '0 8px 20px rgba(var(--sh-shadow-rgb), 0.09)',
            '--sh-shadow-lg':
                '0 2px 4px rgba(var(--sh-shadow-rgb), 0.13), '
                + '0 16px 40px rgba(var(--sh-shadow-rgb), 0.12)',
            '--sh-shadow-xl':
                '0 3px 6px rgba(var(--sh-shadow-rgb), 0.14), '
                + '0 32px 72px rgba(var(--sh-shadow-rgb), 0.16)',

            // Interrupteurs : la piste active était `#ffffff` en dur — blanche
            // sur une surface blanche, donc invisible une fois cochée.
            '--sh-toggle-on':           '#111113',
            '--sh-toggle-thumb':        '#ffffff',
            '--sh-toggle-off':          'rgba(0, 0, 0, 0.22)',

            // Chevron des listes déroulantes, en encre sombre.
            '--sh-select-chevron':      "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(17,17,19,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",

            // Survol d'une carte : même principe à deux couches, plus un
            // liseré d'un pixel. Le liseré fait le travail que le verre faisait
            // en sombre — délimiter — et il coûte zéro composition.
            '--sh-card-shadow-hover':
                '0 2px 4px rgba(var(--sh-shadow-rgb), 0.14), '
                + '0 24px 56px rgba(var(--sh-shadow-rgb), 0.16), '
                + '0 0 0 1px rgba(var(--sh-shadow-rgb), 0.10)',
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
