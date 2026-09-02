/**
 * SpaceHub — Contrôle d'hygiène CSS
 * =================================
 *
 * Empêche la régression que l'extraction (scripts/extract-css.mjs) vient de
 * corriger : réintroduire une feuille de style dans une chaîne JavaScript.
 *
 * Ce qui est vérifié :
 *   1. Aucun fichier JS ne contient de bloc <style> statique.
 *      Deux exceptions légitimes et explicites :
 *        - core/utils/domUtils.js  → helper générique, le CSS est un paramètre ;
 *        - ui/themes/ThemeManager.js → variables de thème calculées à l'exécution.
 *   2. Chaque fichier .css est bien importé par au moins un module JS
 *      (sinon il n'est pas empaqueté et ses règles ne s'appliquent jamais).
 *   3. Les ombres portées passent par --sh-shadow-rgb et non par du noir figé,
 *      sans quoi elles cernent les cartes d'un halo sale en thème clair.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];
const EXCEPTIONS_STYLE_EN_JS = new Set([
    'core/utils/domUtils.js',
    'ui/themes/ThemeManager.js',
]);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const files = ROOTS.flatMap(r => walk(r));
const js = files.filter(f => f.endsWith('.js'));
const css = files.filter(f => f.endsWith('.css'));
const problemes = [];

// 1. Pas de CSS embarqué dans du JS.
for (const f of js) {
    const rel = f.split(path.sep).join('/');
    if (EXCEPTIONS_STYLE_EN_JS.has(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const m = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\('style'\)/.exec(src);
    if (!m) continue;
    const varName = m[1];
    const assign = new RegExp(varName + "\\.(?:textContent|innerHTML)\\s*=\\s*`");
    if (assign.test(src)) {
        problemes.push(`${rel} — bloc <style> réintroduit dans le JS. Placez ces règles dans ${path.basename(f, '.js')}.css et importez-le.`);
    }
}

// 2. Chaque .css est importé quelque part.
const tousLesImports = js.map(f => fs.readFileSync(f, 'utf8')).join('\n');
for (const f of css) {
    const base = path.basename(f);
    if (!tousLesImports.includes(`'./${base}'`) && !tousLesImports.includes(`"./${base}"`)) {
        problemes.push(`${f.split(path.sep).join('/')} — jamais importé : Vite ne l'empaquette pas, ses règles ne s'appliquent nulle part.`);
    }
}

// 3. Ombres figées en noir.
const OMBRE_FIGEE = /(?:box-shadow|text-shadow|drop-shadow)[^;{}]*?rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i;
for (const f of css) {
    const src = fs.readFileSync(f, 'utf8');
    const lignes = src.split('\n');
    lignes.forEach((l, i) => {
        if (OMBRE_FIGEE.test(l)) {
            problemes.push(`${f.split(path.sep).join('/')}:${i + 1} — ombre noire figée ; utilisez rgba(var(--sh-shadow-rgb, 0, 0, 0), …).`);
        }
    });
}

// 4. Coût GPU : `backdrop-filter` et `transition: all` sont les deux propriétés
//    qui ont fait le plus de dégâts sur TV (audit §3). On les plafonne.
const MAX_BACKDROP = 10;
let backdrop = 0;
const transitionAll = [];
for (const f of css) {
    const src = fs.readFileSync(f, 'utf8');
    src.split('\n').forEach((l, i) => {
        if (/^\s*-?(?:webkit-)?backdrop-filter\s*:/.test(l)) backdrop++;
        if (/transition\s*:\s*all\b/.test(l)) transitionAll.push(`${f.split(path.sep).join('/')}:${i + 1}`);
    });
}
if (backdrop > MAX_BACKDROP) {
    problemes.push(`${backdrop} déclarations backdrop-filter (plafond : ${MAX_BACKDROP}). C'est la propriété la plus coûteuse du CSS : une passe de compositing par frame. Réservez-la aux surfaces plein écran réellement translucides (opacité < 0,80) ; au-dessus de 0,92 elle est invisible et mesurée à moins de 5 valeurs sur 255.`);
}
for (const t of transitionAll) {
    problemes.push(`${t} — « transition: all » force le navigateur à surveiller toutes les propriétés animables, y compris celles qui déclenchent un recalcul de mise en page. Listez explicitement transform et opacity.`);
}

if (problemes.length) {
    console.error(`Hygiène CSS : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error('  ✖ ' + p);
    process.exit(1);
}
console.log(`Hygiène CSS : ${js.length} fichier(s) JS et ${css.length} feuille(s) vérifiés.`);
console.log(`Aucun CSS embarqué dans du JS, aucune feuille orpheline, aucune ombre figée.`);
console.log(`Coût GPU : ${backdrop} backdrop-filter (plafond ${MAX_BACKDROP}), 0 « transition: all ».`);
