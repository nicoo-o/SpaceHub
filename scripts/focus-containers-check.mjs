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

// ─── Second contrat : le contexte passé aux gabarits ────────────────────────
//
// `{ ...this }` ne copie que les propriétés PROPRES : les MÉTHODES du
// composant, portées par son prototype, disparaissent. Les gabarits extraits
// appellent `ctx._escape(…)` — une méthode. Trois sites d'appel décomposaient
// ainsi, et ouvrir une fiche média plantait sur « _escape is not a function ».
//
// `contexteGabarit(this, {…})` (core/utils/domUtils.js) fabrique un objet dont
// le prototype EST l'instance : les méthodes restent résolubles.
const decompositions = [];
for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    if (rel.endsWith('.template.js')) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(gabarit\w*)\s*\(\s*\{\s*\.\.\.this\b/g)) {
        decompositions.push({ rel, ligne: src.slice(0, m.index).split('\n').length, fn: m[1] });
    }
}

if (decompositions.length) {
    console.error(`Contexte des gabarits : ${decompositions.length} appel(s) qui décomposent \`this\`.\n`);
    for (const d of decompositions) {
        console.error(`  x ${d.rel}:${d.ligne} — ${d.fn}({ ...this, … })`);
    }
    console.error('\n`{ ...this }` ne copie pas les méthodes du prototype : le gabarit perdra');
    console.error('`_escape` et plantera au premier appel. Utilisez contexteGabarit(this, { … }).');
    process.exit(1);
}

// ─── Troisième contrat : qui a le droit de réécrire un scope de vue ─────────
//
// Le dock supérieur est un FRÈRE de la vue dans l'arbre, jamais un descendant.
// Sept composants réenregistraient « leur » scope avec `{ force: true }` en
// enracinant la requête sur leur propre sous-arbre — `.sh-dashboard`,
// `.sh-library-view`, `.sh-downloads-view`. La racine excluait donc le dock :
// ses sélecteurs étaient listés et ne correspondaient à rien, et le menu du
// haut est resté inatteignable au clavier.
//
// Les scopes de VUE appartiennent au moteur, qui leur ajoute la barre
// permanente. Un composant qui veut ajouter ses propres contrôles utilise
// `extendFocusables`, qui compose. Les couches CONFINÉES (modale, réglages,
// panneau latéral, lecteur, recherche) gardent le droit de réécrire : piéger
// le focus est précisément leur rôle.
const SCOPES_DE_VUE = ['dashboard', 'library', 'downloads', 'jellyseerr', 'dynamic-island'];
const reecritures = [];
for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    if (rel === 'core/SpatialNavigation.js') continue; // le moteur les déclare
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/registerFocusables\s*\(\s*['"]([\w-]+)['"]/g)) {
        if (!SCOPES_DE_VUE.includes(m[1])) continue;
        reecritures.push({ rel, ligne: src.slice(0, m.index).split('\n').length, scope: m[1] });
    }
}

if (reecritures.length) {
    console.error(`Scopes de vue : ${reecritures.length} réécriture(s) hors du moteur.\n`);
    for (const r of reecritures) {
        console.error(`  x ${r.rel}:${r.ligne} — registerFocusables('${r.scope}', …)`);
    }
    console.error('\nRéécrire un scope de vue depuis un composant enracine la requête sur le');
    console.error('sous-arbre de ce composant, ce qui fait disparaître le dock supérieur — il');
    console.error('est un FRÈRE de la vue, pas un descendant. Utilisez extendFocusables().');
    process.exit(1);
}

// ─── Quatrième contrat : la garde `container || …` qui ne garde rien ────────
//
// `getFocusables` appelle un fournisseur avec `this._root`, c'est-à-dire
// `document`. Or `document` est TRUTHY. Écrire
//
//     const root = container || document.querySelector('#ma-couche') || document;
//
// s'arrête donc au premier terme, et la racine confinée n'est jamais évaluée :
// le scope « confiné » renvoie tous les contrôles de la page. Réglages ouverts,
// une flèche Bas faisait sortir le focus de la modale pour se poser sur une
// carte du tableau de bord, invisible sous l'overlay.
//
// Même famille : le repli `|| root` en fin d'expression. Quand la couche est
// absente, le scope retombe sur le document entier au lieu de dire « rien ».
const gardesMortes = [];
for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/const\s+\w+\s*=\s*container\s*\|\|/g)) {
        gardesMortes.push({ rel, ligne: src.slice(0, m.index).split('\n').length,
            motif: 'container || … (container vaut document, donc truthy)' });
    }
    for (const m of src.matchAll(/root\.querySelector\([^)]*\)\s*\|\|\s*root\b/g)) {
        gardesMortes.push({ rel, ligne: src.slice(0, m.index).split('\n').length,
            motif: 'querySelector(…) || root (retombe sur le document entier)' });
    }
}

if (gardesMortes.length) {
    console.error(`Gardes de scope : ${gardesMortes.length} racine(s) confinée(s) qui ne confinent rien.\n`);
    for (const g of gardesMortes) console.error(`  x ${g.rel}:${g.ligne} — ${g.motif}`);
    console.error('\nUn scope confiné qui ne trouve pas sa couche doit renvoyer une liste VIDE.');
    console.error('Cherchez la racine directement : `document.querySelector(...)`, puis `return []`.');
    process.exit(1);
}

console.log(`Conteneurs focalisables : ${balises} balise(s) de conteneur vérifiée(s) sur ${CONTENEURS.length} classes déclarées.`);
console.log('Aucun conteneur de défilement ne se déclare cible de focus.');
console.log('Contexte des gabarits : aucun appel ne décompose `this`.');
console.log('Scopes de vue : aucun composant ne réécrit un scope du moteur.');
console.log('Gardes de scope : aucune racine confinée ne retombe sur le document.');
