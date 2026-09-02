/**
 * SpaceHub — Contrôle du pipeline d'entrée
 * ========================================
 *
 * L'audit relevait treize écouteurs `keydown` indépendants. Neuf étaient
 * globaux (`window` ou `document`) et se partageaient le clavier sans que leur
 * ordre soit écrit nulle part : il découlait de la phase de propagation et de
 * l'ordre de construction des modules au démarrage.
 *
 * Ils passent désormais tous par `core/InputRouter.js`, avec une priorité
 * déclarée. Ce contrôle empêche le retour en arrière : tout nouvel écouteur
 * clavier global fait échouer la construction.
 *
 * Deux catégories restent légitimes et sont donc tolérées :
 *   - les écouteurs attachés à un ÉLÉMENT précis (une carte, un champ) : ils
 *     ne concernent que leur élément et ne se disputent rien ;
 *   - les exceptions nommées ci-dessous, chacune avec sa raison.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

/** Écouteurs globaux tolérés, avec la raison. */
const TOLERES = new Map([
    ['core/InputRouter.js', 'c\'est le routeur lui-même — l\'unique écouteur de bas niveau'],
    ['core/AudioFeedback.js', 'déverrouillage du contexte audio : { once: true }, sans rapport avec la navigation'],
]);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const GLOBAL = /\b(?:window|document)\s*\.addEventListener\s*\(\s*['"](keydown|keyup|keypress)['"]/g;

const fautifs = [];
let inscriptions = 0;

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');

    inscriptions += (src.match(/inputRouter\.inscrire\s*\(/g) || []).length;

    if (TOLERES.has(rel)) continue;
    for (const m of src.matchAll(GLOBAL)) {
        const ligne = src.slice(0, m.index).split('\n').length;
        fautifs.push(`${rel}:${ligne} — ${m[0].trim()}`);
    }
}

if (fautifs.length) {
    console.error(`Pipeline d'entrée : ${fautifs.length} écouteur(s) clavier global(aux) hors du routeur.\n`);
    for (const f of fautifs) console.error('  ✖ ' + f);
    console.error('\nPassez par core/InputRouter.js (inputRouter.inscrire) avec une priorité déclarée,');
    console.error('ou attachez l\'écouteur à l\'élément concerné plutôt qu\'à window/document.');
    process.exit(1);
}

console.log(`Pipeline d'entrée : ${inscriptions} gestionnaire(s) inscrit(s) auprès du routeur.`);
console.log(`Aucun écouteur clavier global hors des ${TOLERES.size} exceptions documentées.`);
