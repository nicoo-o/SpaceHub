#!/usr/bin/env node
/**
 * Codemod — les courbes déclarées remplacent le `ease` du navigateur
 * =================================================================
 *
 * Le barème déclare cinq courbes et n'en consommait aucune là où ça compte :
 * 753 transitions retombaient sur le `ease` nu — `cubic-bezier(0.25, 0.1,
 * 0.25, 1)`, la courbe par défaut du CSS, celle qui DÉMARRE LENTEMENT. Sur une
 * interface, l'œil regarde le début du mouvement : c'est exactement le moment
 * que cette courbe étire.
 *
 * La règle, et elle vient de la table de mouvement du dépôt :
 *
 *   — une TRANSITION va vers `var(--sh-ease-out)` (cubic-bezier(0.16, 1, 0.3, 1)),
 *     plus franche au départ que celle qu'elle remplace ;
 *   — une ANIMATION SANS FIN est un mouvement constant (chargement, défilé,
 *     rotation) : elle va vers `linear`. Une courbe d'accélération sur une
 *     boucle produit un à-coup à chaque tour.
 *
 * Ce qui n'est pas touché : `ease-in-out` (légitime au déplacement),
 * `linear` (déjà le bon choix), et les cinq `ease-in` nus — il n'y en a aucun.
 *
 * Usage : node scripts/codemod-courbes.mjs [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
const JETONS = 'public/design-system/tokens.css';
const SEC = process.argv.includes('--dry');

const declaration = fs.readFileSync(path.resolve(JETONS), 'utf8');
if (!/--sh-ease-out:\s*cubic-bezier\(/.test(declaration)) {
    console.error('✖ --sh-ease-out a disparu du fichier de jetons : le codemod pointerait dans le vide.');
    process.exit(1);
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

/* `ease` seul — ni `ease-in-out`, ni le `ease` de `var(--sh-ease-*)`.
   Le `\b` de JavaScript ne suffit pas : entre « ease » et « - » il y a une
   frontière de mot, et `\bease\b` matcherait donc `ease-in-out`. */
const EASE_NU = /(?<![-a-z])ease(?![-a-z])/g;

let animations = 0, transitions = 0, fichiers = 0;

const tous = RACINES.flatMap(r => walk(path.resolve(r)));
for (const fichier of tous) {
    const avant = fs.readFileSync(fichier, 'utf8');

    // 1. Les boucles d'abord : le mouvement constant va en `linear`.
    let apres = avant.replace(/animation:([^;}]*)/g, (tout) => {
        if (!/\binfinite\b/.test(tout)) return tout;
        return tout.replace(EASE_NU, () => { animations += 1; return 'linear'; });
    });

    // 2. Puis tout le reste : les transitions, et les animations ponctuelles.
    apres = apres.replace(/transition[a-z-]*:([^;}]*)/g, (tout) =>
        tout.replace(EASE_NU, () => { transitions += 1; return 'var(--sh-ease-out)'; }));

    apres = apres.replace(/animation:([^;}]*)/g, (tout) =>
        tout.replace(EASE_NU, () => { animations += 1; return 'var(--sh-ease-out)'; }));

    if (apres !== avant) {
        fichiers += 1;
        if (!SEC) fs.writeFileSync(fichier, apres, 'utf8');
    }
}

console.log(`${SEC ? '[à blanc] ' : ''}Courbes — ${fichiers} fichier(s) touché(s)`);
console.log(`  transitions → var(--sh-ease-out) : ${transitions}`);
console.log(`  animations  → linear / ease-out  : ${animations}`);
