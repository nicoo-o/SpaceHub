/**
 * CONTRAT — un gabarit ne lit que ce qu'on lui donne.
 *
 * Pourquoi ce contrôle existe
 * ---------------------------
 * Les gros blocs de HTML ont été sortis des composants vers des modules
 * `*.template.js`. L'extraction a été faite « mécaniquement », et une
 * empreinte octet pour octet (tests/gabarits.test.js) garantissait que le HTML
 * produit ne changeait pas.
 *
 * Elle ne garantissait pas que le gabarit soit APPELABLE. Dans le composant
 * d'origine, le HTML était un littéral de gabarit écrit au milieu de la
 * fonction : il voyait toutes les variables locales de celle-ci. Sorti dans
 * son propre module, il ne voit plus que son paramètre `ctx`. Les variables
 * qui n'ont pas été reprises dans la déstructuration sont devenues des
 * identifiants LIBRES — et lire un identifiant libre dans un module lève
 * `ReferenceError`.
 *
 * C'est exactement ce qui est arrivé à `VideoPlayer.template.js` : il lisait
 * `title` et `year`, jamais déstructurés ni transmis. Résultat, `play()`
 * levait `ReferenceError: title is not defined` AVANT même de toucher au
 * réseau — le lecteur vidéo ne s'ouvrait pas. Le test d'empreinte ne le
 * voyait pas parce qu'il appelait le gabarit avec un contexte fabriqué à la
 * main, contenant `title` et `year` : il validait un chemin que l'application
 * n'emprunte jamais.
 *
 * Ce que ce contrôle vérifie : tout identifiant lu dans une interpolation
 * `${…}` d'un module de gabarit est soit déstructuré de `ctx`, soit déclaré
 * localement, soit une globale connue. Sinon, échec.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');

/** Globales admises dans un gabarit. Volontairement courte. */
const GLOBALES = new Set([
    'Array', 'Boolean', 'Date', 'JSON', 'Math', 'Number', 'Object', 'String',
    'Intl', 'Map', 'Set', 'RegExp', 'Infinity', 'NaN', 'undefined', 'null',
    'true', 'false', 'this', 'window', 'document', 'navigator', 'location',
    'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat',
    'isNaN', 'String', 'Symbol', 'Promise', 'console', 'ctx',
]);

/** Mots-clés qui ne sont jamais des lectures de variable. */
const MOTS_CLES = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of',
    'in', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
    'new', 'typeof', 'instanceof', 'delete', 'void', 'await', 'async',
    'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super', 'yield',
]);

const fichiers = globSync('**/*.template.js', {
    cwd: RACINE,
    exclude: (n) => n === 'node_modules' || n === 'dist',
});

let total = 0;
const manquants = [];

for (const rel of fichiers) {
    const source = readFileSync(path.join(RACINE, rel), 'utf8');

    // 1. Ce que le module met à disposition : déstructurations de `ctx`,
    //    déclarations locales, paramètres et imports.
    const connus = new Set(GLOBALES);

    // const { a, b, c } = ctx  /  const { a, b } = ctx.sous
    for (const m of source.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
        for (const brut of m[1].split(',')) {
            // gère « a: b », « a = defaut », « ...reste »
            const nom = brut.split(':').pop().split('=')[0].replace(/[.\s]/g, '');
            if (nom) connus.add(nom);
        }
    }
    // const x = …  /  let x = …
    for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) connus.add(m[1]);
    // function nom(a, b) / export function nom(a, b)
    for (const m of source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
        connus.add(m[1]);
        for (const p of m[2].split(',')) {
            const nom = p.trim().split('=')[0].replace(/[.\s{}]/g, '');
            if (nom) connus.add(nom);
        }
    }
    // (a) => …  et  (a, b) => …
    for (const m of source.matchAll(/\(?\s*([A-Za-z_$][\w$,\s]*)\)?\s*=>/g)) {
        for (const p of m[1].split(',')) { const n = p.trim(); if (n) connus.add(n); }
    }
    // import { a, b } from …  /  import X from …
    for (const m of source.matchAll(/import\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))/g)) {
        if (m[1]) for (const n of m[1].split(',')) connus.add(n.trim().split(' as ').pop().trim());
        if (m[2]) connus.add(m[2]);
    }
    // for (const x of …)
    for (const m of source.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) connus.add(m[1]);

    // 2. Ce que le module LIT dans ses interpolations.
    //    On ne regarde que `${ … }` : le HTML littéral n'exécute rien.
    for (const m of source.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
        const expr = m[1];
        total += 1;
        // Retirer les chaînes, les accès `.prop`, `?.prop` et les clés d'objet.
        const nettoye = expr
            .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ' ')
            .replace(/\??\.\s*[A-Za-z_$][\w$]*/g, ' ')
            .replace(/[A-Za-z_$][\w$]*\s*:/g, ' ');
        for (const id of nettoye.matchAll(/[A-Za-z_$][\w$]*/g)) {
            const nom = id[0];
            if (MOTS_CLES.has(nom) || connus.has(nom)) continue;
            if (/^\d/.test(nom)) continue;
            manquants.push({ fichier: rel, nom, expr: expr.trim().slice(0, 72) });
        }
    }
}

// Dédoublonner par (fichier, nom).
const vus = new Set();
const uniques = manquants.filter(({ fichier, nom }) => {
    const cle = `${fichier}::${nom}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
});

if (uniques.length) {
    console.error(`\n✖ ${uniques.length} identifiant(s) libre(s) dans les gabarits.\n`);
    console.error('  Un gabarit ne voit QUE son paramètre `ctx` : ces lectures lèveront');
    console.error('  ReferenceError à l\'exécution, quel que soit ce que dit le test');
    console.error('  d\'empreinte (il fabrique son propre contexte).\n');
    for (const { fichier, nom, expr } of uniques) {
        console.error(`   · ${fichier}\n       « ${nom} » lu dans : \${${expr}}`);
    }
    console.error('\n  Correctif : ajouter le nom à la déstructuration du gabarit ET');
    console.error('  le transmettre depuis l\'appelant.\n');
    process.exit(1);
}

console.log(`Identifiants des gabarits : ${total} interpolation(s) vérifiée(s) dans ${fichiers.length} module(s).`);
console.log('Aucun gabarit ne lit une variable qu\'on lui donne pas.');

/* ══════════════════════════════════════════════════════════════════════
   DEUXIÈME CONTRAT — un attribut posé dans le DOM doit avoir un lecteur
   ══════════════════════════════════════════════════════════════════════

   POURQUOI. Le contrat ci-dessus garde le sens « ce que le gabarit peut LIRE ».
   Celui-ci garde le sens inverse, et c'est celui qui pourrit en silence : un
   `data-*` écrit dans le HTML que PERSONNE ne lit. Il ne casse rien, il ne
   lève rien, il ne se voit pas en recette — il fait juste croire que quelque
   chose est branché. Quatre l'avaient été : `data-library-id`,
   `data-onboarding-role`, `data-request-id`, `data-task-id`.

   C'est la forme DOM du motif que ce dépôt a déjà nommé deux fois : les 47
   transitions mortes (du CSS valide, jamais lu) et les méthodes fantômes.
   Le symétrique compte aussi : un sélecteur `[data-x]` qui vise un attribut
   qu'AUCUN gabarit n'écrit est une règle morte au même titre — sauf s'il
   s'agit d'un point d'extension public volontaire, listé ci-dessous.
*/

/** Points d'extension documentés : personne dans l'application ne les écrit, et c'est le contrat. */
const EXTENSIONS_DOM = new Set([
    // core/SpatialNavigation.js documente ce sélecteur comme la façon dont un
    // carrousel déclare sa mémoire de focus. L'application n'en écrit aucun.
    'data-nav-remember',
]);

const RACINES_APP = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
const OPTIONS_GLOB = { cwd: RACINE, exclude: n => n === 'node_modules' || n === 'dist' };

const jsApp = RACINES_APP.flatMap(r => globSync(`${r}/**/*.js`, OPTIONS_GLOB));
const jsHarnais = ['scripts', 'tests'].flatMap(r => globSync(`${r}/**/*.js`, OPTIONS_GLOB));
const cssApp = RACINES_APP.flatMap(r => globSync(`${r}/**/*.css`, OPTIONS_GLOB));

/**
 * Les commentaires parlent des sélecteurs ; ils n'en sont pas.
 * Sans ce nettoyage, un commentaire qui EXPLIQUE la suppression de
 * `[data-modal-close]` passait pour un sélecteur vivant — le contrôle
 * mesurait le texte qui décrit la chose au lieu de la chose.
 * Les numéros de ligne sont préservés (les blocs sont remplacés par des blancs).
 */
const sansCommentaires = src => src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, avant) => avant + ' ');

const lire = liste => liste.map(f => sansCommentaires(readFileSync(path.join(RACINE, f), 'utf8')));

/* Le texte où l'on cherche un LECTEUR : les modules, mais aussi les harnais
   (l'e2e de ce dépôt lit le DOM : il compte comme consommateur légitime). */
const texteLecteurs = [...lire(jsApp), ...lire(jsHarnais), ...lire(cssApp)].join('\n');

const camel = nom => nom.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Déclarations : `data-x=` dans un gabarit, ou `dataset.x =` sur un élément. */
const declarations = new Map();
for (const rel of jsApp) {
    const src = sansCommentaires(readFileSync(path.join(RACINE, rel), 'utf8'));
    const noter = nom => {
        if (!declarations.has(nom)) declarations.set(nom, new Set());
        declarations.get(nom).add(rel);
    };
    for (const m of src.matchAll(/\bdata-([a-z][a-z0-9-]*)\s*=/g)) noter('data-' + m[1]);
    for (const m of src.matchAll(/dataset\.([A-Za-z][\w]*)\s*=(?!=)/g)) {
        noter('data-' + m[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
    }
}

/** Un LECTEUR est une lecture, pas l'écriture : `dataset.x = …` ne compte pas. */
function aUnLecteur(nom) {
    const d = nom.slice(5);
    const c = camel(nom);
    const motifs = [
        new RegExp(`dataset\\.${c}\\b(?!\\s*=(?!=))`),
        new RegExp(`dataset\\s*\\[\\s*['\"]${c}['\"]\\s*\\]`),
        new RegExp(`(?:get|has|remove)Attribute\\(\\s*['\"]${d}['\"]`),
        new RegExp(`\\[data-${d}[\\]\\s=~^|$*]`),
    ];
    return motifs.some(re => re.test(texteLecteurs));
}

const sansLecteur = [...declarations].filter(([nom]) => !aUnLecteur(nom) && !EXTENSIONS_DOM.has(nom));

/* Le sens inverse : un sélecteur qui vise un attribut que nul n'écrit. */
const vises = new Set();
for (const m of texteLecteurs.matchAll(/\[data-([a-z][a-z0-9-]*)/g)) vises.add('data-' + m[1]);
const sansEcrivain = [...vises].filter(nom => !declarations.has(nom) && !EXTENSIONS_DOM.has(nom));

const problemesDom = [
    ...sansLecteur.map(([nom, fichiers]) =>
        `${nom} — écrit dans ${[...fichiers].join(', ')} mais lu par personne.`),
    ...sansEcrivain.map(nom =>
        `${nom} — visé par un sélecteur, écrit par aucun gabarit `+
        `(si c'est un point d'extension, ajoutez-le à EXTENSIONS_DOM avec sa raison).`),
];

if (problemesDom.length) {
    console.error(`\n✖ ${problemesDom.length} attribut(s) du DOM désaccordé(s).\n`);
    for (const p of problemesDom) console.error('   · ' + p);
    console.error('');
    process.exit(1);
}

console.log(
    `Attributs du DOM : ${declarations.size} attribut(s) data-* écrit(s), ` +
    `${declarations.size - sansLecteur.length} avec un lecteur, ${sansEcrivain.length} sans écrivain.`
);
