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
console.log('Aucun gabarit ne lit une variable qu\'on ne lui donne pas.');
