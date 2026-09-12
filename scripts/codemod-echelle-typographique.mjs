#!/usr/bin/env node
/**
 * Codemod — l'échelle typographique déclarée remplace les littéraux
 * ==================================================================
 *
 * Le cliquet `systeme-design-check.mjs` comptait 448 `font-size` et 316
 * `font-weight` écrits à la main pour un barème de neuf échelons et sept
 * graisses consommés ZÉRO fois. Ce codemod fait la seule partie de cette dette
 * qui ne demande AUCUN arbitrage visuel :
 *
 *   1. un littéral qui vaut EXACTEMENT un échelon déclaré devient ce jeton —
 *      même valeur, donc aucun pixel ne bouge, et la mesure le prouve ;
 *   2. un littéral SOUS LE PLANCHER (12 px) devient `--sh-text-xs` : le texte
 *      grandit d'un à cinq pixels selon le point de départ, jamais l'inverse.
 *      C'est une application du plancher, pas une mise en page revue.
 *
 * Ce qu'il ne fait PAS, et pourquoi c'est écrit ici : les valeurs
 * intermédiaires (12,5 · 13,5 · 14 · 14,5 · 16 · 18 · 19 · 20 · 24 · 26 ·
 * 32 · 34 · 38 · 42) demanderaient de choisir entre deux échelons pour chaque
 * cas, sur des mises en page denses qu'on ne peut pas regarder toutes. Elles
 * restent comptées comme dette, sous un plafond nommé.
 *
 * Les graisses suivent la même règle exacte : 400/500/600/700/800/900
 * deviennent des jetons ; 750, 650, 550, 450, 850 — des marches qui n'existent
 * dans aucune des polices de plateforme — restent comptées.
 *
 * Usage : node scripts/codemod-echelle-typographique.mjs [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
const CHEMIN_JETONS = 'public/design-system/tokens.css';
const SEC = process.argv.includes('--dry');

/** Échelons déclarés — la liste est relue DANS le fichier de jetons. */
function lireJetons(nom) {
    const css = fs.readFileSync(path.resolve(CHEMIN_JETONS), 'utf8');
    const m = css.match(new RegExp(`--sh-${nom}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
}

const ECHELONS = {
    12: 'text-xs', 13: 'text-sm', 15: 'text-base', 17: 'text-md',
    22: 'text-lg', 28: 'text-xl', 36: 'text-2xl', 48: 'text-3xl', 64: 'text-4xl',
};
const GRAISSES = {
    300: 'font-light', 400: 'font-normal', 500: 'font-medium',
    600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black',
};
const PLANCHER = 12;

/* Le barème est-il celui qu'on croit ? Un codemod qui mappe vers un jeton
   modifié ailleurs produirait exactement le défaut qu'il prétend corriger. */
const verifier = { 'text-xs': '12px', 'text-sm': '13px', 'text-base': '15px', 'text-md': '17px',
    'text-lg': '22px', 'text-xl': '28px', 'font-extrabold': '800' };
for (const [nom, attendu] of Object.entries(verifier)) {
    const reel = lireJetons(nom);
    if (reel !== attendu) {
        console.error(`✖ --sh-${nom} vaut « ${reel} », attendu « ${attendu} » : le barème a bougé, relevez ce codemod.`);
        process.exit(1);
    }
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

const fichiers = RACINES.flatMap(r => walk(path.resolve(r)));
const stats = { tailleExacte: 0, taillePlancher: 0, graisse: 0, fichiers: 0 };
const restants = { taille: new Map(), graisse: new Map() };

for (const fichier of fichiers) {
    // Aucun traitement de fin de ligne : on ne touche qu'aux motifs ciblés.
    // (Le codemod des capitales avait réécrit CRLF en LF sur tout un fichier
    // pour quatre suppressions — mille lignes de diff pour rien.)
    const avant = fs.readFileSync(fichier, 'utf8');
    let apres = avant;

    apres = apres.replace(/font-size:(\s*)(\d+(?:\.\d+)?)px/g, (tout, esp, valeur) => {
        const v = Number(valeur);
        if (Number.isFinite(v) && v < PLANCHER) {
            stats.taillePlancher += 1;
            return `font-size:${esp}var(--sh-text-xs)`;   // le plancher, jamais l'inverse
        }
        const jeton = ECHELONS[v];
        if (jeton) {
            stats.tailleExacte += 1;
            return `font-size:${esp}var(--sh-${jeton})`;
        }
        restants.taille.set(valeur, (restants.taille.get(valeur) || 0) + 1);
        return tout;
    });

    apres = apres.replace(/font-weight:(\s*)(\d{3})/g, (tout, esp, valeur) => {
        const jeton = GRAISSES[Number(valeur)];
        if (jeton) {
            stats.graisse += 1;
            return `font-weight:${esp}var(--sh-${jeton})`;
        }
        restants.graisse.set(valeur, (restants.graisse.get(valeur) || 0) + 1);
        return tout;
    });

    if (apres !== avant) {
        stats.fichiers += 1;
        if (!SEC) fs.writeFileSync(fichier, apres, 'utf8');
    }
}

const tri = m => [...m.entries()].sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${v}×${n}`).join(' ');

console.log(`${SEC ? '[à blanc] ' : ''}Échelle typographique — ${stats.fichiers} fichier(s) touché(s)`);
console.log(`  tailles → jeton (valeur identique) : ${stats.tailleExacte}`);
console.log(`  tailles → plancher 12px            : ${stats.taillePlancher}`);
console.log(`  graisses → jeton (valeur identique): ${stats.graisse}`);
console.log(`  tailles hors barème, laissées      : ${tri(restants.taille)}`);
console.log(`  graisses hors barème, laissées     : ${tri(restants.graisse)}`);
