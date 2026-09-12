#!/usr/bin/env node
/**
 * Codemod — les quatre teintes système écrites en clair deviennent des jetons
 * ========================================================================
 *
 * `systeme-design-check.mjs` comptait 613 hexadécimaux contre 11 usages des
 * jetons sémantiques. Le sous-ensemble que ce codemod traite est le seul qui
 * soit PROUVABLEMENT sans effet visible, parce que ces quatre couleurs ne
 * changent pas d'un thème à l'autre :
 *
 *     #ff453a  →  var(--sh-color-danger)      (rouge Apple système)
 *     #32d74b  →  var(--sh-color-success)     (vert Apple système)
 *     #64d2ff  →  var(--sh-color-info)        (bleu ciel Apple système)
 *     #ff9f0a  →  var(--sh-focus-ring)        (orange : LA couleur de
 *                                             sélection et de focus, seule de
 *                                             sa teinte à l'écran — sauf dans
 *                                             Toaster, où c'est un
 *                                             avertissement : l'unique cas
 *                                             où le nom dit autre chose)
 *
 * `--sh-focus-ring` est le seul des quatre à être redéfini dans le thème clair
 * (`rgb(198, 92, 0)`) : c'est délibéré — sur fond clair, l'orange vif ne tient
 * pas le contraste. Les trente-six copies en dur gardaient donc l'orange vif
 * en clair, contre la décision du thème. Les suivre est un CORRECTIF, pas un
 * changement d'humeur.
 *
 * Les formes `rgba(…)` suivent par les triplet -rgb (déclarés ici pour
 * l'occasion : le composant qui a besoin d'alpha sur une couleur système n'a
 * pas d'autre chemin), et `rgba(var(--sh-focus-ring-rgb), 0.38)` — la valeur
 * exacte du jeton `--sh-focus-glow` — devient ce jeton.
 *
 * CE QUI N'EST PAS TOUCHÉ, et c'est la règle la plus importante : tout ce qui
 * se trouve DANS un `var(…)`. Un repli `var(--sh-x, #ff9f0a)` n'est pas une
 * écriture en clair, c'est la valeur de secours documentée du dépôt ; la
 * remplacer par un autre `var()` la rendrait dépendante de ce qu'elle est
 * censée remplacer.
 *
 * Usage : node scripts/codemod-couleurs.mjs [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
const JETONS = 'public/design-system/tokens.css';
const SEC = process.argv.includes('--dry');

const REMPLACEMENTS = [
    // Les triplets d'abord : sans ça, `rgba(255, 159, 10, …)` serait vu comme
    // trois nombres, pas comme une couleur, et resterait en place.
    { re: /rgba\(\s*255,\s*159,\s*10,\s*0\.38\s*\)/g, par: 'var(--sh-focus-glow)', nom: 'halo de focus' },
    { re: /rgba\(\s*255,\s*159,\s*10,\s*([0-9.]+)\s*\)/g, par: 'rgba(var(--sh-focus-ring-rgb), $1)', nom: 'orange avec alpha' },
    { re: /rgba\(\s*255,\s*69,\s*58,\s*([0-9.]+)\s*\)/g, par: 'rgba(var(--sh-color-danger-rgb), $1)', nom: 'rouge avec alpha' },
    { re: /rgba\(\s*50,\s*215,\s*75,\s*([0-9.]+)\s*\)/g, par: 'rgba(var(--sh-color-success-rgb), $1)', nom: 'vert avec alpha' },
    { re: /rgba\(\s*100,\s*210,\s*255,\s*([0-9.]+)\s*\)/g, par: 'rgba(var(--sh-color-info-rgb), $1)', nom: 'bleu avec alpha' },
    // Puis les teintes pleines.
    { re: /#ff453a\b/gi, par: 'var(--sh-color-danger)', nom: 'rouge' },
    { re: /#32d74b\b/gi, par: 'var(--sh-color-success)', nom: 'vert' },
    { re: /#64d2ff\b/gi, par: 'var(--sh-color-info)', nom: 'bleu' },
    { re: /#ff9f0a\b/gi, par: 'var(--sh-focus-ring)', nom: 'orange', saufFichiers: ['Toaster.css'], parSauf: 'var(--sh-color-warning)' },
];

/* Un `var(…)` peut contenir des parenthèses (repli imbriqué) : on compte. */
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

const comptes = new Map();
let fichiers = 0;

for (const fichier of RACINES.flatMap(r => walk(path.resolve(r)))) {
    if (path.resolve(fichier) === path.resolve(JETONS)) continue;
    const avant = fs.readFileSync(fichier, 'utf8');

    const apres = horsVar(avant, (bout) => {
        let t = bout;
        for (const r of REMPLACEMENTS) {
            const sauf = r.saufFichiers?.some(s => fichier.endsWith(s));
            const remplacement = sauf ? r.parSauf : r.par;
            const avant2 = t;
            t = t.replace(r.re, remplacement);
            if (t !== avant2) {
                const n = (avant2.match(r.re) || []).length;
                comptes.set(r.nom, (comptes.get(r.nom) || 0) + n);
            }
        }
        return t;
    });

    if (apres !== avant) {
        fichiers += 1;
        if (!SEC) fs.writeFileSync(fichier, apres, 'utf8');
    }
}

console.log(`${SEC ? '[à blanc] ' : ''}Couleurs — ${fichiers} fichier(s) touché(s)`);
for (const [nom, n] of [...comptes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nom.padEnd(20)} ${n}`);
}
