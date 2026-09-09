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
 *   6. Les déclarations `transition` portent au plus un `!important`, terminal
 *      — le motif du milieu de liste que vite 8 a révélé est refusé ici.
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

/* ── 0. !important terminal dans les déclarations `transition` ─────────────
 *
 * L'incident « vite 8 » : une quinzaine de déclarations portaient
 * `!important` AU MILIEU de la liste de valeurs —
 *   transition: transform .26s !important, opacity .2s !important, …
 * Ce n'est pas du CSS : une déclaration n'admet qu'UN `!important`, terminal.
 * Rolldown parse strictement et rejette le tout (donc TOUTES les propriétés
 * de la déclaration, même les parties valides) — et comme le CSS du dépôt
 * n'embarque jamais de `!important` légitime (règle 6 plus bas), le rejet
 * silencieux signifiait : zéro animation, sur des dizaines de widgets, sans
 * aucun test rouge. L'e2e « Les transitions réparées des widgets s'animent
 * réellement au survol » ferme désormais la boucle côté rendu.
 *
 * Détection PAR DÉCLARATION (et non par ligne) : une transition répartie
 * sur plusieurs lignes échapperait à une inspection ligne à ligne.
 */
const MULTIPLE_IMPORTANT = /transition\s*:[^;{}]*![^;{}]*![^;{}]*;/g;
for (const f of css) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.split(path.sep).join('/');
    for (const m of src.matchAll(MULTIPLE_IMPORTANT)) {
        problemes.push(
            `${rel}:${src.slice(0, m.index).split('\n').length} — déclaration « transition » avec plus d'un « !important » : un seul, terminal, est valide. Rolldown (vite 8) rejette la déclaration entière : aucune des propriétés n'anime. Retirez tous les « !important » de la liste — le dépôt n'en embarque jamais légitimement (voir la règle 6 ci-dessous).`
        );
    }
}

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
// ─── Jeux d'images-clés orphelins, et jeux définis deux fois ────────────────
//
// Deux défauts distincts, tous deux invisibles à l'exécution :
//
//   - un `@keyframes` que plus rien ne référence est un piège de maintenance :
//     on croit modifier une animation en l'éditant, et rien ne bouge à l'écran.
//     Six traînaient, dont `sh-login-card-in`, orphelinée quand la carte de
//     connexion est passée à `sh-springIn` ;
//   - un nom DÉFINI DEUX FOIS l'est dans un espace de noms global : le dernier
//     analysé gagne pour tous les consommateurs, et l'ordre dépend de la
//     concaténation des feuilles par Vite. Le résultat n'était pas
//     reproductible d'un build à l'autre.
const declarations = new Map();
let texteGlobal = '';
for (const f of files) {
    if (!f.endsWith('.css') && !f.endsWith('.js')) continue;
    // Les commentaires citent volontiers un nom d'images-clés — c'est même le
    // cas de ceux qui expliquent son déplacement. On les neutralise en gardant
    // les sauts de ligne, pour que les numéros restent justes.
    const src = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    texteGlobal += '\n' + src;
    if (!f.endsWith('.css')) continue;
    const rel = f.split(path.sep).join('/');
    for (const m of src.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) {
        if (!declarations.has(m[1])) declarations.set(m[1], []);
        declarations.get(m[1]).push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
    }
}
const sansDeclaration = texteGlobal.replace(/@keyframes\s+[A-Za-z0-9_-]+/g, '');
const orphelines = [];
const doublons = [];
for (const [nom, sites] of declarations) {
    if (sites.length > 1) doublons.push({ nom, sites });
    const utilise = new RegExp(`(?<![\\w-])${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(sansDeclaration);
    if (!utilise) orphelines.push({ nom, site: sites[0] });
}
if (orphelines.length || doublons.length) {
    if (orphelines.length) {
        console.error(`Images-clés : ${orphelines.length} jeu(x) que plus rien n'utilise.\n`);
        for (const o of orphelines) console.error(`  x ${o.site} — @keyframes ${o.nom}`);
    }
    if (doublons.length) {
        console.error(`\nImages-clés : ${doublons.length} nom(s) déclaré(s) plusieurs fois.\n`);
        for (const d of doublons) console.error(`  x @keyframes ${d.nom} — ${d.sites.join(', ')}`);
        console.error('\nLes @keyframes sont un espace de noms GLOBAL : le dernier analysé gagne,');
        console.error('et l\'ordre dépend de la concaténation des feuilles, pas du code.');
    }
    process.exit(1);
}

// ─── Durée de boucle contre durée de transition ────────────────────────────
//
// L'échelle `--sh-dur-*` décrit des TRANSITIONS : un départ, une arrivée, fini.
// Une boucle, elle, se mesure en secondes. Une migration automatisée a un jour
// remplacé les dix-neuf périodes de boucle de l'application par `--sh-dur-5`
// (550 ms) : indicateurs de chargement à 1,8 tour/seconde, squelettes en
// stroboscope, vinyle de la fiche média à 109 tr/min. Rien ne l'a vu.
//
// Une animation `infinite` doit donc utiliser un jeton `--sh-loop-*`.
const bouclesFautives = [];
for (const f of css) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.split(path.sep).join('/');
    for (const m of src.matchAll(/animation:[^;]*infinite[^;]*;/g)) {
        if (!/--sh-dur-\d/.test(m[0])) continue;
        bouclesFautives.push({ rel, ligne: src.slice(0, m.index).split('\n').length,
            extrait: m[0].trim().slice(0, 90) });
    }
}
if (bouclesFautives.length) {
    console.error(`Durées de boucle : ${bouclesFautives.length} animation(s) « infinite » sur une durée de transition.\n`);
    for (const b of bouclesFautives) console.error(`  x ${b.rel}:${b.ligne} — ${b.extrait}`);
    console.error('\n`--sh-dur-*` décrit une transition (jusqu\'à 550 ms). Une boucle se mesure');
    console.error('en secondes : utilisez un jeton --sh-loop-* (tokens.css).');
    process.exit(1);
}


console.log(`Images-clés : ${declarations.size} jeu(x), aucun orphelin, aucun doublon.`);
console.log(`Hygiène CSS : ${js.length} fichier(s) JS et ${css.length} feuille(s) vérifiés.`);
console.log(`Aucun CSS embarqué dans du JS, aucune feuille orpheline, aucune ombre figée.`);
console.log(`Coût GPU : ${backdrop} backdrop-filter (plafond ${MAX_BACKDROP}), 0 « transition: all ».`);
