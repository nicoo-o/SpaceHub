/**
 * SpaceHub — Contrôle des conteneurs focalisables
 * ===============================================
 *
 * Un conteneur de défilement n'est pas un contrôle. Ses ENFANTS sont les cibles
 * du focus ; lui ne fait que les contenir et les faire défiler.
 *
 * Le déclarer focalisable produit deux défauts, et l'application en a souffert
 * des deux à la fois :
 *
 *   - `focusFirst()` prend le premier focalisable dans l'ordre du DOM. Un
 *     conteneur précède toujours ses enfants : c'est donc LUI qui recevait le
 *     focus au démarrage. Un anneau blanc s'affichait sur toute la largeur de
 *     la barre de genres, et ne partait qu'à la première touche fléchée ;
 *   - l'utilisateur doit alors « entrer » dans le conteneur avant d'atteindre
 *     une puce, ce qui ajoute un appui sans rien apporter.
 *
 * Ce contrôle échoue si un conteneur déclaré dans CAROUSELS ou
 * SCROLL_CONTAINERS (core/DomContracts.js) porte `data-nav-focusable="true"`
 * ou un `tabindex` positif dans le HTML produit par un composant.
 *
 * Il ne regarde que les gabarits statiques : un `tabindex` posé à l'exécution
 * par le moteur lui-même est légitime et lui échappe — c'est assumé, ce
 * contrôle vise la déclaration, pas l'état.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

/**
 * Classes de conteneurs, extraites de core/DomContracts.js pour qu'il n'y ait
 * qu'un seul endroit où la liste est écrite.
 */
const contrats = fs.readFileSync('core/DomContracts.js', 'utf8');
function classesDe(nom) {
    const bloc = contrats.match(new RegExp(`export const ${nom} = \\[([\\s\\S]*?)\\]`));
    if (!bloc) return [];
    return [...bloc[1].matchAll(/'\.([\w-]+)'/g)].map(m => m[1]);
}
const CONTENEURS = [...new Set([...classesDe('CAROUSELS'), ...classesDe('SCROLL_CONTAINERS')])];

if (CONTENEURS.length === 0) {
    console.error('✖ Aucune classe de conteneur trouvée dans core/DomContracts.js.');
    console.error('  Le contrôle ne peut rien vérifier — la lecture des contrats a échoué.');
    process.exit(1);
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const fautifs = [];
let balises = 0;

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');

    // Toute balise ouvrante portant un attribut class.
    for (const m of src.matchAll(/<(\w+)\s+([^>]*class="[^"]*"[^>]*)>/g)) {
        const attributs = m[2];
        const classes = (attributs.match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/);
        const conteneur = CONTENEURS.find(c => classes.includes(c));
        if (!conteneur) continue;
        balises++;

        const focalisable = /data-nav-focusable\s*=\s*"true"/.test(attributs);
        const tabindex = attributs.match(/tabindex\s*=\s*"(-?\d+)"/);
        const tabindexPositif = tabindex && Number(tabindex[1]) >= 0;

        if (focalisable || tabindexPositif) {
            const ligne = src.slice(0, m.index).split('\n').length;
            const raisons = [];
            if (focalisable) raisons.push('data-nav-focusable="true"');
            if (tabindexPositif) raisons.push(`tabindex="${tabindex[1]}"`);
            fautifs.push({ rel, ligne, conteneur, raisons });
        }
    }
}

if (fautifs.length) {
    console.error(`Conteneurs focalisables : ${fautifs.length} conteneur(s) de défilement déclaré(s) comme cible de focus.\n`);
    for (const f of fautifs) {
        console.error(`  x ${f.rel}:${f.ligne} — .${f.conteneur} porte ${f.raisons.join(' et ')}`);
    }
    console.error('\nUn conteneur de défilement n\'est pas un contrôle : ce sont ses ENFANTS');
    console.error('qui reçoivent le focus. Retirez ces attributs du conteneur — les puces,');
    console.error('cartes ou boutons qu\'il contient les portent déjà.');
    process.exit(1);
}

console.log(`Conteneurs focalisables : ${balises} balise(s) de conteneur vérifiée(s) sur ${CONTENEURS.length} classes déclarées.`);
console.log('Aucun conteneur de défilement ne se déclare cible de focus.');
