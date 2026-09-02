/**
 * SpaceHub — Contrôle des accès à la variable globale
 * ===================================================
 *
 * L'application accédait à ses services par 690 chaînes
 * `window.SpaceHub?.…?.…`. Chacune masquait une dépendance non déclarée qui
 * échouait en silence — la migration en a d'ailleurs révélé trois qui ne
 * faisaient rien depuis le début (`ui.toaster`, un chemin qui n'existe pas).
 *
 * Ces accès passent désormais par `core/services.js`. Ce contrôle empêche la
 * dérive : il plafonne les accès directs restants, et échoue si le nombre
 * remonte. Le plafond ne peut que descendre.
 *
 * Les accès restants sont d'une nature différente et resteront :
 *   - des ÉCRITURES sur le namespace (un accesseur lit, il n'écrit pas) ;
 *   - `core/SpaceHub.js`, qui construit ce namespace ;
 *   - `plugins/`, où la variable globale EST le contrat public du SDK.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations'];
const EXCLUS = new Set(['core/SpaceHub.js', 'core/services.js', 'core/ServiceRegistry.js']);

/** Plafond d'accès directs. Baissez-le à chaque migration ; ne le remontez jamais. */
const PLAFOND = 20;

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

let total = 0;
const lectures = [];
const ecritures = [];

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    if (EXCLUS.has(rel)) continue;
    const lignes = fs.readFileSync(f, 'utf8').split('\n');
    lignes.forEach((l, i) => {
        if (!l.includes('window.SpaceHub')) return;
        total++;
        const estEcriture = /window\.SpaceHub[^;]*=\s*[^=]/.test(l) || /delete\s+window\.SpaceHub/.test(l);
        (estEcriture ? ecritures : lectures).push(`${rel}:${i + 1}`);
    });
}

console.log(`Accès globaux : ${total} ligne(s) touchant window.SpaceHub (plafond ${PLAFOND}).`);
console.log(`  ${ecritures.length} écriture(s) — attendues : un accesseur lit, il n'écrit pas.`);
console.log(`  ${lectures.length} lecture(s) restante(s).`);

if (total > PLAFOND) {
    console.error(`\n✖ Le nombre d'accès directs a augmenté (${total} > ${PLAFOND}).`);
    console.error(`  Utilisez les accesseurs de core/services.js plutôt que window.SpaceHub.`);
    console.error(`  Nouvelles lectures à examiner :`);
    for (const l of lectures.slice(0, 20)) console.error('    · ' + l);
    process.exit(1);
}
if (total < PLAFOND) {
    console.log(`\nLe plafond peut être abaissé à ${total} dans scripts/globals-check.mjs.`);
}
