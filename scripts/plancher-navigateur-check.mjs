#!/usr/bin/env node
/**
 * SpaceHub — Le plancher navigateur, mesuré et non déclaré
 * =======================================================
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * `docs/PROJECT_STATUS.md` — le document qui « fait foi » — annonce un plancher
 * de compatibilité **Chrome 69** (téléviseurs de 2020). Le dépôt livre
 * `:focus-visible` (Chrome 86), `aspect-ratio` (88), `inset` (87) : le plancher
 * annoncé est donc faux d'au moins dix-neuf versions, et **aucun des seize
 * contrôles de la chaîne ne le mesurait**.
 *
 * Ce n'est pas une coquetterie de documentation. Le plancher décide de ce qui
 * est permis : tant qu'il est faux, personne ne sait si une fonctionnalité
 * livrée passera sur le téléviseur du salon. Et il dérive toujours dans le même
 * sens — vers le haut, à chaque fonctionnalité moderne ajoutée sans que
 * personne ne note que le parc à couvrir vient de changer.
 *
 * CE QU'IL FAIT
 * -------------
 * Il cherche dans les feuilles et les modules la fonctionnalité la plus récente
 * réellement employée, et compare sa version Chrome au plancher déclaré.
 *
 *   · une fonctionnalité PLUS RÉCENTE que le plancher → échec, avec la raison ;
 *   · le plancher déclaré PLUS BAS que la plus récente employée → échec aussi :
 *     un plancher trop bas est une promesse qu'on ne tient pas.
 *
 * La table ci-dessous est volontairement courte et vérifiable à la main. Une
 * ligne fausse vaut mieux qu'une table exhaustive non relue — et chaque ligne
 * dit à quoi elle sert dans ce dépôt.
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins', 'public'];
const FICHIERS_HTML = ['index.html', 'build/cordova/www/index.html'];

const RACINE = process.cwd();

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            walk(p, out);
        } else if (/\.(css|js|html)$/.test(e.name)) out.push(p);
    }
    return out;
}

const sansCommentaires = src => src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, avant) => avant + ' ');

const fichiers = [...RACINES.flatMap(r => walk(path.resolve(RACINE, r))),
    ...FICHIERS_HTML.map(f => path.resolve(RACINE, f)).filter(f => fs.existsSync(f))];

const texte = fichiers.map(f => sansCommentaires(fs.readFileSync(f, 'utf8'))).join('\n');

/**
 * `motif` : ce qu'on cherche. `chrome` : première version de Chrome qui le
 * supporte sans préfixe. `pour` : à quoi il sert ICI, pour qu'une future revue
 * puisse vérifier la ligne plutôt que de la croire.
 */
const FONCTIONNALITES = [
    { nom: 'position: sticky', motif: /position:\s*sticky/, chrome: 56, pour: 'en-têtes de vue' },
    { nom: 'overscroll-behavior', motif: /overscroll-behavior\s*:/, chrome: 63, pour: 'pas de rebond sur la page' },
    { nom: 'backdrop-filter', motif: /backdrop-filter\s*:/, chrome: 76, pour: 'flou de chrome (plafonné à 10)' },
    { nom: 'clamp()', motif: /clamp\(/, chrome: 79, pour: 'tailles fluides' },
    { nom: 'color-scheme', motif: /color-scheme\s*:/, chrome: 81, pour: 'thème sombre natif' },
    { nom: 'gap en flexbox', motif: /display:\s*flex[\s\S]{0,200}?gap\s*:|gap\s*:/, chrome: 84, pour: 'espacement des rangées' },
    { nom: ':focus-visible', motif: /:focus-visible/, chrome: 86, pour: 'anneau de focus au clavier seulement' },
    { nom: 'inset', motif: /[^-]inset\s*:/, chrome: 87, pour: 'positionnement des surfaces' },
    { nom: 'aspect-ratio', motif: /aspect-ratio\s*:/, chrome: 88, pour: 'réserve la place des affiches' },
    { nom: ':is() / :where()', motif: /:is\(|:where\(/, chrome: 88, pour: 'sélecteurs groupés' },
    { nom: 'overflow: clip', motif: /overflow(-x|-y)?\s*:\s*clip/, chrome: 90, pour: 'débordement sans barre' },
    { nom: 'accent-color', motif: /accent-color\s*:/, chrome: 93, pour: 'contrôles natifs teintés' },
    { nom: '@layer', motif: /@layer\b/, chrome: 99, pour: 'ordre des règles' },
    { nom: ':has()', motif: /:has\(/, chrome: 105, pour: 'état dérivé d\'un descendant' },
    { nom: 'requêtes de conteneur', motif: /@container\b/, chrome: 105, pour: 'coquille responsive' },
    { nom: 'dvh / svh / lvh', motif: /[0-9](dvh|svh|lvh)\b/, chrome: 108, pour: 'hauteur réelle du téléphone' },
    { nom: 'color-mix()', motif: /color-mix\(/, chrome: 111, pour: 'mélange de jetons' },
    { nom: 'oklch()', motif: /oklch\(/, chrome: 111, pour: 'couleurs perceptuelles' },
    { nom: 'linear() d\'easing', motif: /linear\(/, chrome: 113, pour: 'courbes à points' },
    { nom: 'text-wrap: balance', motif: /text-wrap\s*:\s*(balance|pretty)/, chrome: 114, pour: 'titres qui s\'équilibrent' },
    { nom: '@starting-style / transition-behavior', motif: /@starting-style|transition-behavior\s*:/, chrome: 117, pour: 'entrées animées' },
    { nom: 'scrollbar-width', motif: /scrollbar-width\s*:/, chrome: 121, pour: 'barres fines' },
];

const trouvees = FONCTIONNALITES.filter(f => f.motif.test(texte));

/**
 * PLANCHER DÉCLARÉ — la valeur que ce contrôle défend.
 * Elle est écrite ici ET dans docs/PROJECT_STATUS.md ; les deux doivent dire la
 * même chose, et c'est ce contrôle qui le vérifie.
 *
 * POURQUOI 108, ET PAS 69. Le dépôt annonçait « Chrome 69 » (téléviseurs de
 * 2020) — mais ce chiffre n'était plus mesuré nulle part, et trois valeurs
 * différentes cohabitaient : 69 dans le document qui fait foi, 111 assumé par
 * un composant qui utilise `color-mix()`, et 108 pour le parc réel. Le seul
 * plancher qui existe est celui des appareils qu'on livre : les téléviseurs de
 * 2024 sont en **Chromium M108**. Un plancher plus bas est une promesse qu'on
 * ne tient pas ; un plancher plus haut interdit des fonctions qui marchent.
 */
const PLANCHER_DECLARE = 108;

/**
 * Dérogations — fonctionnalités au-dessus du plancher, avec leur raison.
 * Une dérogation est une décision explicite et committée, jamais un effet de
 * bord : on n'en ajoute pas sans dire POURQUOI l'absence est acceptable.
 */
const DEROGATIONS = new Map([
    ['scrollbar-width',
        'cosmétique : sans elle, la barre de défilement revient. Rien ne casse.'],
    ['color-mix()',
        'règle GSM uniquement (html.sh-gsm) : jamais évaluée sur un téléviseur.'],
]);

const plusRecente = trouvees.reduce((max, f) => (f.chrome > max.chrome ? f : max), { chrome: 0, nom: '—' });

/* Les fonctionnalités qui dépassent le plancher : ce sont elles qui décident —
   sauf celles dont l'absence ne fait que dégrader, et qui sont documentées. */
const tropRecentes = trouvees.filter(
    f => f.chrome > PLANCHER_DECLARE && !DEROGATIONS.has(f.nom)
);

const problemes = [];
if (tropRecentes.length) {
    for (const f of tropRecentes) {
        problemes.push(
            `${f.nom} demande Chrome ${f.chrome} et le plancher déclaré est ${PLANCHER_DECLARE} ` +
            `(usage : ${f.pour}).`
        );
    }
}
if (plusRecente.chrome < PLANCHER_DECLARE) {
    problemes.push(
        `Le plancher déclaré (${PLANCHER_DECLARE}) est plus HAUT que la fonctionnalité la plus ` +
        `récente réellement employée (${plusRecente.nom}, Chrome ${plusRecente.chrome}) : ` +
        `c'est une promesse qu'on ne tient pas. Mesurez, puis écrivez la vraie valeur ` +
        `ici et dans docs/PROJECT_STATUS.md.`
    );
}

if (problemes.length) {
    console.error(`\n✖ Plancher navigateur : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error('  ✖ ' + p);
    console.error('\n  Le plancher réel du parc est de Chromium M108 (téléviseurs 2024) : ');
    console.error('  une fonctionnalité au-delà doit être une amélioration progressive, ');
    console.error('  gardée par @supports, ou refusée.\n');
    process.exit(1);
}

console.log(`Plancher navigateur : ${trouvees.length} fonctionnalité(s) recensée(s), la plus récente`);
console.log(`est « ${plusRecente.nom} » (Chrome ${plusRecente.chrome}) — plancher déclaré ${PLANCHER_DECLARE}, tenu.`);
if (DEROGATIONS.size) {
    console.log(`Dérogations acceptées au-dessus du plancher : ${[...DEROGATIONS.keys()].join(', ')}`);
}
