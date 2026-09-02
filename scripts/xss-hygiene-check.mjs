/**
 * SpaceHub — Contrôle d'injection HTML
 * ====================================
 *
 * L'audit relevait 237 `innerHTML`, dont beaucoup reçoivent des données du
 * serveur. Les échapper tous serait du bruit : l'écrasante majorité interpole
 * des valeurs structurelles (une classe CSS choisie par un ternaire, un
 * identifiant interne, un nombre). Le risque réel se limite aux chaînes qui
 * viennent du serveur ou d'une API tierce.
 *
 * Ce contrôle isole exactement ces cas-là et échoue si un NOUVEAU apparaît.
 * Il ne prétend pas prouver l'absence de faille : il empêche la dérive, ce que
 * le comptage brut de 237 ne pouvait pas faire.
 *
 * Deux corrections importantes par rapport à la première version
 * --------------------------------------------------------------
 * 1. Le balayage cherchait la fin d'un gabarit en avançant jusqu'au prochain
 *    accent grave. Dès qu'une interpolation contenait elle-même un gabarit —
 *    une écriture très courante ici — il s'arrêtait au milieu, et TOUT le
 *    reste du gabarit échappait au contrôle. Le balayeur suit désormais une
 *    pile de contextes et va jusqu'au vrai terminateur.
 *
 * 2. Une interpolation contenant un gabarit imbriqué était jugée comme une
 *    seule grosse expression, illisible et souvent signalée à tort. Les
 *    gabarits imbriqués sont maintenant explorés récursivement : seules les
 *    expressions FEUILLES sont jugées.
 *
 * S'y ajoute la couverture des modules `*.template.js`. Sans elle, sortir un
 * gabarit de son composant l'aurait sorti du contrôle par la même occasion.
 *
 * Pour ajouter un cas légitime, inscrivez-le dans REVUS avec sa raison — ce
 * qui oblige à écrire pourquoi c'est sûr. Voir docs/XSS_EXCEPTIONS.md.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

/**
 * Expressions rendues sûres par construction.
 * Le préfixe optionnel `objet.` couvre `this._escape(…)` comme `ctx._escape(…)`
 * dans les modules de gabarit extraits.
 */
const SUR = /^(?:[\w$]+\.)?(?:_escape|escapeHtml|encodeURIComponent|String|Number|JSON\.stringify|render\w+|\w*Svg|get\w*Svg)\s*\(/;

/** Noms de champs qui trahissent une donnée d'origine externe. */
const DONNEE = /\b(?:name|Name|title|Title|label|Label|overview|Overview|description|Description|path|Path|category|Category|indexer|Indexer|tracker|release|Release|filename|fileName|FileName|episode|Episode|series|Series|movie|Movie|user|User|message|Message|error|Error)\b/;

/**
 * Cas relus un par un et jugés sûrs. La clé est `fichier::expression`.
 * Chacun porte sa raison — si elle ne tient pas en une phrase, c'est
 * probablement qu'il faut échapper plutôt qu'inscrire ici.
 * Le détail de chaque cas est dans docs/XSS_EXCEPTIONS.md.
 */
const REVUS = new Map([
    ['ui/widgets/MoviesWidget.js::this.title',            'titre du widget, constante du code'],
    ['ui/widgets/ContinueWatchingWidget.js::this.title',  'titre du widget, constante du code'],
    ['ui/widgets/LatestAdditionsWidget.js::this.title',   'titre du widget, constante du code'],
    ['ui/widgets/TvShowsWidget.js::this.title',           'titre du widget, constante du code'],
    ['ui/widgets/CollectionsWidget.js::this.title',       'titre du widget, constante du code'],
    ['ui/widgets/MusicWidget.js::this.title',             'titre du widget, constante du code'],
    ['ui/widgets/LibrariesWidget.js::this.title',         'titre du widget, constante du code'],
    ['integrations/sonarr/SonarrWidgets.js::this.title',           'titre du widget, constante du code'],
    ['integrations/radarr/RadarrWidgets.js::this.title',           'titre du widget, constante du code'],
    ['integrations/bazarr/BazarrWidgets.js::this.title',           'titre du widget, constante du code'],
    ['integrations/prowlarr/ProwlarrWidgets.js::this.title',       'titre du widget, constante du code'],
    ['integrations/qbittorrent/QBittorrentWidgets.js::this.title', 'titre du widget, constante du code'],
    ['integrations/jellyseerr/JellyseerrWidgets.js::this.title',   'titre du widget, constante du code'],
    // ── Libellés calculés dans le code, jamais reçus du réseau ──────────────
    ['ui/components/CardBuilder.js::label',
     'libellé du bouton d\'action (« Regarder », « Ouvrir », « Reprendre ») calculé sur place'],
]);

// ─── Balayage ────────────────────────────────────────────────────────────────

/** Fin d'un littéral gabarit ouvert à l'index `i`. */
function finDuGabarit(s, i) {
    const pile = [{ type: 'tpl' }];
    while (i < s.length) {
        const ctx = pile[pile.length - 1];
        const c = s[i];
        if (ctx.type === 'tpl') {
            if (c === '\\') { i += 2; continue; }
            if (c === '`') { pile.pop(); if (pile.length === 0) return i; i++; continue; }
            if (c === '$' && s[i + 1] === '{') { pile.push({ type: 'expr', profondeur: 0 }); i += 2; continue; }
            i++; continue;
        }
        if (ctx.type === 'expr') {
            if (c === '\\') { i += 2; continue; }
            if (c === '`') { pile.push({ type: 'tpl' }); i++; continue; }
            if (c === "'") { pile.push({ type: 'str', fin: "'" }); i++; continue; }
            if (c === '"') { pile.push({ type: 'str', fin: '"' }); i++; continue; }
            if (c === '{') { ctx.profondeur++; i++; continue; }
            if (c === '}') { if (ctx.profondeur === 0) pile.pop(); else ctx.profondeur--; i++; continue; }
            i++; continue;
        }
        if (c === '\\') { i += 2; continue; }
        if (c === ctx.fin) { pile.pop(); i++; continue; }
        i++;
    }
    return s.length;
}

/** Fin d'une interpolation ouverte juste après `${`. */
function finDeLInterpolation(s, i) {
    let profondeur = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '`') { i = finDuGabarit(s, i + 1) + 1; continue; }
        if (c === "'" || c === '"') {
            const fin = c; i++;
            while (i < s.length && s[i] !== fin) { if (s[i] === '\\') i++; i++; }
            i++; continue;
        }
        if (c === '{') { profondeur++; i++; continue; }
        if (c === '}') { if (profondeur === 0) return i; profondeur--; i++; continue; }
        i++;
    }
    return s.length;
}

/**
 * Expressions FEUILLES d'un gabarit : ses interpolations, en descendant
 * récursivement dans les gabarits imbriqués plutôt qu'en jugeant l'expression
 * entière qui les contient.
 */
function feuilles(tpl, ligneBase, sortie = []) {
    let i = 0;
    while (i < tpl.length) {
        if (tpl[i] === '\\') { i += 2; continue; }
        if (tpl[i] === '$' && tpl[i + 1] === '{') {
            const debut = i + 2;
            const fin = finDeLInterpolation(tpl, debut);
            const expr = tpl.slice(debut, fin);
            const ligne = ligneBase + tpl.slice(0, debut).split('\n').length - 1;

            // Gabarits imbriqués : on descend dedans. Une expression qui en
            // contient un est un EMBALLAGE (un ternaire, un `.map()`) : ce qui
            // atteint le HTML, ce sont les feuilles à l'intérieur, déjà jugées
            // une par une. Juger en plus le reste de l'emballage ne signalerait
            // que du bruit — le corps d'un `.map()` amputé de ses chaînes.
            let reste = '';
            let contientGabarit = false;
            let j = 0;
            while (j < expr.length) {
                if (expr[j] === '\\') { j += 2; continue; }
                if (expr[j] === '`') {
                    contientGabarit = true;
                    const f = finDuGabarit(expr, j + 1);
                    feuilles(expr.slice(j + 1, f), ligne + expr.slice(0, j).split('\n').length - 1, sortie);
                    j = f + 1;
                    continue;
                }
                if (expr[j] === "'" || expr[j] === '"') {
                    const fin2 = expr[j]; j++;
                    while (j < expr.length && expr[j] !== fin2) { if (expr[j] === '\\') j++; j++; }
                    j++; continue;
                }
                reste += expr[j];
                j++;
            }
            const propre = reste.trim();
            if (propre && !contientGabarit) sortie.push({ expr: propre, ligne });
            i = fin + 1;
            continue;
        }
        i++;
    }
    return sortie;
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

/**
 * Où trouver du HTML construit par gabarit : les `innerHTML = ` partout, et,
 * dans les modules `*.template.js`, le `return` du gabarit lui-même.
 */
function pointsDEntree(rel) {
    return rel.endsWith('.template.js')
        ? [/innerHTML\s*\+?=\s*`/g, /\breturn\s*`/g]
        : [/innerHTML\s*\+?=\s*`/g];
}

// ─── Contrôle ────────────────────────────────────────────────────────────────

const nouveaux = [];
let examines = 0;
let gabarits = 0;
let modulesGabarit = 0;

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    if (rel.endsWith('.template.js')) modulesGabarit++;

    const vus = new Set();
    for (const motif of pointsDEntree(rel)) {
        for (const m of src.matchAll(motif)) {
            const debut = m.index + m[0].length;
            if (vus.has(debut)) continue;
            vus.add(debut);
            const fin = finDuGabarit(src, debut);
            const tpl = src.slice(debut, fin);
            const ligneBase = src.slice(0, debut).split('\n').length;
            gabarits++;

            for (const { expr, ligne } of feuilles(tpl, ligneBase)) {
                examines++;
                if (SUR.test(expr)) continue;
                // Comparaisons structurelles : le résultat est une classe CSS
                // ou un style, jamais la donnée comparée.
                if (/^[\w.$?[\]()]+\s*[=!]==?\s*(?:['"]|true\b|false\b|null\b|undefined\b|\d)/.test(expr)) continue;
                if (!DONNEE.test(expr)) continue;
                if (REVUS.has(`${rel}::${expr}`)) continue;
                nouveaux.push({ rel, ligne, expr });
            }
        }
    }
}

if (nouveaux.length) {
    console.error(`Injection HTML : ${nouveaux.length} interpolation(s) de données non échappée(s) et non relue(s).\n`);
    for (const n of nouveaux) {
        console.error(`  x ${n.rel}:${n.ligne} — \`${n.expr.replace(/\s+/g, ' ').slice(0, 90)}\``);
    }
    console.error('\nSoit vous l\'échappez (escapeHtml / this._escape / ctx._escape),');
    console.error('soit vous l\'inscrivez dans REVUS de ce fichier avec la raison, et dans docs/XSS_EXCEPTIONS.md.');
    process.exit(1);
}

console.log(`Injection HTML : ${gabarits} gabarit(s) balayé(s), ${examines} interpolation(s) feuilles examinées`);
console.log(`  (dont ${modulesGabarit} module(s) *.template.js — les gabarits extraits restent sous contrôle).`);
console.log(`Aucune donnée externe non échappée hors des ${REVUS.size} cas relus et documentés.`);
