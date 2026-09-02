/**
 * SpaceHub — Extraction du CSS embarqué dans les fichiers JS
 * ==========================================================
 *
 * Pourquoi
 * --------
 * 13 000 lignes de CSS vivaient dans des chaînes de gabarit JavaScript,
 * injectées à l'exécution via `document.head.appendChild(style)`. Conséquences :
 *   - aucune coloration, aucun lint, aucune autocomplétion sur ce CSS ;
 *   - le style n'arrive qu'après l'instanciation du composant (flash de contenu
 *     non stylé) et son ordre dépend de l'ordre d'instanciation, donc du hasard ;
 *   - Vite ne peut ni le minifier, ni le dédupliquer, ni le mettre en cache ;
 *   - trois des quatre « monolithes » de l'audit sont surtout du CSS déguisé.
 *
 * Ce script est un codemod à usage unique, mais il est conservé dans le dépôt :
 * il documente exactement la transformation appliquée et permet de la rejouer.
 *
 *   node scripts/extract-css.mjs --check   (n'écrit rien, rapporte)
 *   node scripts/extract-css.mjs --apply
 *
 * Sécurité : chaque fichier est vérifié avant transformation. Si la méthode
 * d'injection contient la moindre logique en plus du triptyque
 * (garde / création / appendChild), le fichier est refusé plutôt que réécrit.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];
const APPLY = process.argv.includes('--apply');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** Trouve la fin d'un littéral de gabarit ouvert à `start`. */
function endOfTemplate(src, start) {
    let i = start;
    while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') return i;
        i++;
    }
    return -1;
}

/** Trouve l'accolade fermante correspondant à celle ouverte à `open`. */
function matchBrace(src, open) {
    let depth = 0, i = open;
    while (i < src.length) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '`') { i = endOfTemplate(src, i + 1) + 1; continue; }
        if (c === "'" || c === '"') {
            const q = c; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; continue;
        }
        if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
        i++;
    }
    return -1;
}

/** Retire l'indentation commune d'un bloc CSS extrait d'un gabarit indenté. */
function dedent(css) {
    const lines = css.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
    let min = Infinity;
    for (const l of lines) {
        if (!l.trim()) continue;
        min = Math.min(min, l.match(/^[ \t]*/)[0].length);
    }
    if (!isFinite(min) || min === 0) return lines.join('\n') + '\n';
    return lines.map(l => l.slice(min)).join('\n').replace(/[ \t]+$/gm, '') + '\n';
}

const results = { ok: [], refuses: [], ignores: [] };

for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
        let src = fs.readFileSync(file, 'utf8');
        const create = src.indexOf("document.createElement('style')");
        if (create === -1) continue;

        // Une seule injection par fichier est supportée : au-delà, on refuse.
        if (src.indexOf("document.createElement('style')", create + 1) !== -1) {
            results.refuses.push([file, 'plusieurs blocs <style> dans le même fichier']);
            continue;
        }

        // Remonter au début de la méthode englobante.
        const before = src.slice(0, create);
        const methodStart = before.lastIndexOf('\n', before.lastIndexOf('{'));
        // Méthode de classe OU fonction de module (`function nom() {`).
        const headerMatch = /\n([ \t]*)(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
        let mStart = -1, indent = '', name = '';
        let m;
        headerMatch.lastIndex = 0;
        while ((m = headerMatch.exec(before)) !== null) { mStart = m.index; indent = m[1]; name = m[2]; }
        if (mStart === -1) { results.refuses.push([file, 'méthode englobante introuvable']); continue; }

        const braceOpen = src.indexOf('{', mStart + before.slice(mStart).indexOf(name) + name.length);
        const braceClose = matchBrace(src, braceOpen);
        if (braceClose === -1) { results.refuses.push([file, 'accolades non équilibrées']); continue; }

        const body = src.slice(braceOpen + 1, braceClose);

        // Extraire le CSS.
        const tpl = /\.(?:textContent|innerHTML)\s*=\s*`/.exec(body);
        if (!tpl) { results.refuses.push([file, 'aucune chaîne de style trouvée']); continue; }
        const cssStart = tpl.index + tpl[0].length;
        const cssEnd = endOfTemplate(body, cssStart);
        if (cssEnd === -1) { results.refuses.push([file, 'gabarit non terminé']); continue; }
        const css = body.slice(cssStart, cssEnd);

        if (css.includes('${')) { results.refuses.push([file, 'CSS interpolé — extraction impossible']); continue; }
        if (!css.trim()) { results.ignores.push([file, 'bloc vide']); continue; }

        // Vérifier qu'il ne reste rien d'autre que le triptyque attendu.
        // On retire le CSS lui-même ET l'affectation qui le porte
        // (`style.textContent = ` + le littéral + son backtick fermant).
        const reste = (body.slice(0, tpl.index).replace(/[\w$]+\s*$/, '') + body.slice(cssEnd + 1))
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/if\s*\(\s*document\.getElementById\([^)]*\)\s*\)\s*return\s*;?/g, '')
            // Variante : `const existing = document.getElementById(...); if (existing) existing.remove();`
            .replace(/(?:const|let|var)\s+\w+\s*=\s*document\.getElementById\([^)]*\)\s*;?/g, '')
            .replace(/if\s*\(\s*\w+\s*\)\s*\w+\.remove\(\)\s*;?/g, '')
            .replace(/(?:const|let|var)\s+\w+\s*=\s*document\.createElement\('style'\)\s*;?/g, '')
            .replace(/\w+\.id\s*=\s*['"][^'"]*['"]\s*;?/g, '')
            .replace(/\w+\.(?:type|setAttribute)\s*=?\s*\(?[^;]*\)?\s*;?/g, '')
            .replace(/document\.head\.appendChild\(\s*\w+\s*\)\s*;?/g, '')
            .replace(/[\s;]/g, '');
        if (reste) { results.refuses.push([file, `logique supplémentaire dans ${name}() : « ${reste.slice(0, 60)} »`]); continue; }

        const cssPath = file.replace(/\.js$/, '.css');
        const importSpec = './' + path.basename(cssPath);

        if (APPLY) {
            fs.writeFileSync(cssPath, dedent(css), 'utf8');

            // 1. Neutraliser la méthode (les appelants continuent de l'appeler).
            const noop =
`{
${indent}    // Les styles de ce composant vivent désormais dans ${path.basename(cssPath)},
${indent}    // importé en haut du fichier et empaqueté par Vite. Cette méthode est
${indent}    // conservée en no-op pour ne casser aucun appelant existant.
${indent}}`;
            src = src.slice(0, braceOpen) + noop + src.slice(braceClose + 1);

            // 2. Ajouter l'import après le dernier import existant, sinon après 'use strict'.
            const imports = [...src.matchAll(/^import\s[^\n]*;\s*$/gm)];
            if (imports.length) {
                const last = imports[imports.length - 1];
                const at = last.index + last[0].length;
                src = src.slice(0, at) + `\nimport '${importSpec}';` + src.slice(at);
            } else {
                const us = /^['"]use strict['"];\s*$/m.exec(src);
                const at = us ? us.index + us[0].length : 0;
                src = src.slice(0, at) + `\n\nimport '${importSpec}';` + src.slice(at);
            }
            fs.writeFileSync(file, src, 'utf8');
        }

        results.ok.push([file, cssPath, css.split('\n').length]);
    }
}

const total = results.ok.reduce((n, r) => n + r[2], 0);
console.log(`${APPLY ? 'Extraction appliquée' : 'Simulation'} : ${results.ok.length} fichier(s), ${total} lignes de CSS.`);
for (const [f, c, n] of results.ok) console.log(`  ✔ ${f} → ${c} (${n} lignes)`);
if (results.ignores.length) {
    console.log(`\nIgnorés (${results.ignores.length}) :`);
    for (const [f, why] of results.ignores) console.log(`  · ${f} — ${why}`);
}
if (results.refuses.length) {
    console.log(`\nRefusés (${results.refuses.length}) — à traiter à la main :`);
    for (const [f, why] of results.refuses) console.log(`  ✖ ${f} — ${why}`);
}
