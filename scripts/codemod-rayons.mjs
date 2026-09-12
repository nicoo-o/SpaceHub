#!/usr/bin/env node
/**
 * Codemod — les paliers de rayon déclarés remplacent les littéraux
 * ===============================================================
 *
 * Le barème déclare six rayons et trois étaient consommés, pendant que 447
 * `border-radius` étaient écrits à la main. Comme pour l'échelle typographique,
 * ce codemod ne fait que la part SANS arbitrage :
 *
 *     4px    → var(--sh-radius-xs)      (valeur identique)
 *     8px    → var(--sh-radius-sm)      (valeur identique)
 *     12px   → var(--sh-radius-md)      (valeur identique)
 *     16px   → var(--sh-radius-lg)      (valeur identique)
 *     9999px → var(--sh-radius-full)    (valeur identique)
 *     999px  → var(--sh-radius-full)    (équivalent pour tout élément de moins
 *                                        de 999 px — c'est-à-dire tous)
 *
 * Ce qui reste : `50%` (un cercle, ce n'est pas un rayon de boîte), `100px`
 * (une pilule sur un petit élément, un ovale sur un grand — les deux existent
 * ici) et les pas intermédiaires 6, 10, 14, 20 px, qui demandent de choisir
 * entre deux paliers SUR une mise en page. Ils sont comptés, pas devinés.
 *
 * Comme les autres codemods : rien à l'intérieur d'un `var(…)` — un repli
 * `var(--sh-radius-md, 12px)` n'est pas une écriture en clair, c'est la valeur
 * de secours documentée du dépôt.
 *
 * Usage : node scripts/codemod-rayons.mjs [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
const JETONS = 'public/design-system/tokens.css';
const SEC = process.argv.includes('--dry');

const css = fs.readFileSync(path.resolve(JETONS), 'utf8');
const palier = (nom, attendu) => {
    const m = css.match(new RegExp(`--sh-radius-${nom}:\\s*([^;]+);`));
    if (!m || m[1].trim() !== attendu) {
        console.error(`✖ --sh-radius-${nom} vaut « ${m?.[1]?.trim()} », attendu « ${attendu} » : le barème a bougé.`);
        process.exit(1);
    }
};
palier('xs', '4px'); palier('sm', '8px'); palier('md', '12px');
palier('lg', '16px'); palier('full', '9999px');

const MAPPING = {
    '4px': 'var(--sh-radius-xs)',
    '8px': 'var(--sh-radius-sm)',
    '12px': 'var(--sh-radius-md)',
    '16px': 'var(--sh-radius-lg)',
    '9999px': 'var(--sh-radius-full)',
    '999px': 'var(--sh-radius-full)',
};

function horsVar(texte, transformer) {
    let sortie = '';
    let i = 0;
    while (i < texte.length) {
        if (texte.startsWith('var(', i)) {
            let profondeur = 0;
            let j = i;
            for (; j < texte.length; j++) {
                if (texte[j] === '(') profondeur++;
                else if (texte[j] === ')') { profondeur--; if (profondeur === 0) { j++; break; } }
            }
            sortie += texte.slice(i, j);
            i = j;
        } else {
            const prochain = texte.indexOf('var(', i);
            const fin = prochain === -1 ? texte.length : prochain;
            sortie += transformer(texte.slice(i, fin));
            i = fin;
        }
    }
    return sortie;
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            walk(p, out);
        } else if (e.name.endsWith('.css')) out.push(p);
    }
    return out;
}

let fichiers = 0, remplaces = 0;

for (const fichier of RACINES.flatMap(r => walk(path.resolve(r)))) {
    if (path.resolve(fichier) === path.resolve(JETONS)) continue;
    const avant = fs.readFileSync(fichier, 'utf8');

    // Le motif garde le `!important` éventuel : il porte sur la déclaration,
    // pas sur la valeur — et le contrôle des `!important` non terminaux exige
    // justement qu'il reste terminal.
    const apres = horsVar(avant, (bout) => bout.replace(
        /border-radius:(\s*)(\d+px|9999px|999px)/g,
        (tout, esp, valeur) => {
            const jeton = MAPPING[valeur];
            if (!jeton) return tout;
            remplaces += 1;
            return `border-radius:${esp}${jeton}`;
        }
    ));

    if (apres !== avant) {
        fichiers += 1;
        if (!SEC) fs.writeFileSync(fichier, apres, 'utf8');
    }
}

console.log(`${SEC ? '[à blanc] ' : ''}Rayons — ${remplaces} déclaration(s) dans ${fichiers} fichier(s)`);
