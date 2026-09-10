#!/usr/bin/env node
/**
 * SpaceHub — Contrôle d'hygiène CSS
 * =================================
 *
 * Le fichier est à la fois une CLI (`npm run test:css`) et une petite API
 * importable par les tests. Cette séparation est volontaire : une règle de
 * syntaxe que personne ne peut exercer sur une fixture finit par n'être
 * qu'une sonde manuelle, donc une règle qui dérive.
 *
 * Contrats vérifiés :
 *   1. aucun bloc <style> statique dans un fichier JS (exceptions documentées) ;
 *   2. aucune feuille CSS orpheline ;
 *   3. aucune ombre noire figée ;
 *   4. plafond de backdrop-filter et interdiction de transition: all ;
 *   5. aucun @keyframes orphelin ou dupliqué ;
 *   6. aucune boucle infinie sur un jeton de transition ;
 *   7. `!important` est terminal dans toute déclaration CSS, pas seulement
 *      dans `transition` (les formes terminales légitimes restent autorisées).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOTS = Object.freeze(['core', 'ui', 'jellyfin', 'integrations', 'plugins']);
export const EXCEPTIONS_STYLE_EN_JS = Object.freeze(new Set([
    'core/utils/domUtils.js',
    'ui/themes/ThemeManager.js',
]));
export const MAX_BACKDROP = 10;

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file, out);
        else out.push(file);
    }
    return out;
}

function relative(cwd, file) {
    return path.relative(cwd, file).split(path.sep).join('/');
}

/** Retire les commentaires sans déplacer les lignes utilisées dans les diagnostics. */
export function neutraliserCommentaires(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
}

/**
 * Remplace les chaînes par des espaces. Un `content: "!important"` n'est pas
 * une priorité CSS et ne doit donc pas être confondu avec une déclaration.
 */
function neutraliserChaines(source) {
    let result = '';
    let quote = null;
    let escaped = false;
    for (const character of source) {
        if (quote) {
            if (escaped) {
                result += character === '\n' ? '\n' : ' ';
                escaped = false;
            } else if (character === '\\') {
                result += ' ';
                escaped = true;
            } else if (character === quote) {
                result += ' ';
                quote = null;
            } else {
                result += character === '\n' ? '\n' : ' ';
            }
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            result += ' ';
        } else {
            result += character;
        }
    }
    return result;
}

/**
 * Découpe les déclarations CSS en respectant les chaînes et parenthèses.
 * Les fichiers du dépôt contiennent des data: URLs et des fonctions CSS qui
 * rendent un simple `split(';')` incorrect.
 */
export function* declarationsCss(source) {
    const clean = neutraliserChaines(neutraliserCommentaires(source));
    let start = 0;
    let quote = null;
    let escaped = false;
    let parentheses = 0;

    for (let index = 0; index < clean.length; index += 1) {
        const character = clean[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '(') {
            parentheses += 1;
            continue;
        }
        if (character === ')' && parentheses > 0) {
            parentheses -= 1;
            continue;
        }
        if (parentheses !== 0) continue;

        if (character === '{') {
            start = index + 1;
        } else if (character === ';' || character === '}') {
            const end = index;
            const raw = source.slice(start, end);
            const cleanRaw = clean.slice(start, end);
            yield { raw, clean: cleanRaw, offset: start };
            start = index + 1;
        }
    }

    if (start < source.length) {
        yield { raw: source.slice(start), clean: clean.slice(start), offset: start };
    }
}

function nomPropriete(segment) {
    const match = /^\s*((?:--|-[A-Za-z_]|[A-Za-z_])[A-Za-z0-9_-]*)\s*:\s*/.exec(segment);
    return match ? { nom: match[1], debutValeur: match[0].length } : null;
}

function ligne(source, offset) {
    return source.slice(0, offset).split('\n').length;
}

function importantDansValeur(value) {
    const sansChaines = neutraliserChaines(value);
    return [...sansChaines.matchAll(/!\s*important\b/gi)].map(match => ({
        index: match.index,
        longueur: match[0].length,
    }));
}

function verifierImportant(source, file, problems) {
    for (const declaration of declarationsCss(source)) {
        const property = nomPropriete(declaration.clean);
        if (!property) continue;
        const value = declaration.clean.slice(property.debutValeur);
        const markers = importantDansValeur(value);
        if (markers.length === 0) continue;

        for (const marker of markers) {
            const after = value.slice(marker.index + marker.longueur).trim();
            if (!after) continue;
            const transition = /(?:^|-webkit-)transition$/i.test(property.nom);
            const detail = transition
                ? 'Rolldown (vite 8) rejette la déclaration transition entière : aucune des propriétés n\'anime.'
                : 'Une priorité CSS ne peut apparaître qu\'à la fin de sa déclaration.';
            problems.push(
                `${file}:${ligne(source, declaration.offset + property.debutValeur + marker.index)} — « !important » non terminal dans « ${property.nom} ». ${detail} Retirez-le de la liste de valeurs ou placez-le tout à la fin de la déclaration.`,
            );
        }
    }
}

function analyserFichierCss(source, file, problems, transitionAll) {
    verifierImportant(source, file, problems);

    for (const declaration of declarationsCss(source)) {
        const property = nomPropriete(declaration.clean);
        if (!property) continue;
        const value = declaration.clean.slice(property.debutValeur).trim();
        if (property.nom.toLowerCase() === 'transition' && /^all\b/i.test(value)) {
            transitionAll.push(`${file}:${ligne(source, declaration.offset)}`);
        }
    }
}

function analyserStylesJs(js, problems, cwd) {
    for (const file of js) {
        const rel = relative(cwd, file);
        if (EXCEPTIONS_STYLE_EN_JS.has(rel)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const match = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\('style'\)/.exec(source);
        if (!match) continue;
        const assign = new RegExp(`${match[1]}\\.(?:textContent|innerHTML)\\s*=\\s*\``);
        if (assign.test(source)) {
            problems.push(`${rel} — bloc <style> réintroduit dans le JS. Placez ces règles dans ${path.basename(file, '.js')}.css et importez-le.`);
        }
    }
}

function analyserImports(js, css, problems, cwd) {
    const imports = js.map(file => fs.readFileSync(file, 'utf8')).join('\n');
    for (const file of css) {
        const base = path.basename(file);
        if (!imports.includes(`'./${base}'`) && !imports.includes(`"./${base}"`)) {
            problems.push(`${relative(cwd, file)} — jamais importé : Vite ne l'empaquette pas, ses règles ne s'appliquent nulle part.`);
        }
    }
}

function analyserOmbres(css, problems, cwd) {
    const fixedShadow = /(box-shadow|text-shadow|drop-shadow)[^;{}]*?rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i;
    for (const file of css) {
        const source = fs.readFileSync(file, 'utf8');
        source.split('\n').forEach((lineText, index) => {
            const match = fixedShadow.exec(lineText);
            if (match) {
                problems.push(`${relative(cwd, file)}:${index + 1} — ${match[1]} : ombre noire figée ; utilisez rgba(var(--sh-shadow-rgb, 0, 0, 0), …).`);
            }
        });
    }
}

function analyserGpu(css, problems, cwd, transitionAll) {
    let backdrop = 0;
    for (const file of css) {
        const source = fs.readFileSync(file, 'utf8');
        source.split('\n').forEach(lineText => {
            if (/^\s*-?(?:webkit-)?backdrop-filter\s*:/.test(lineText)) backdrop += 1;
        });
    }
    if (backdrop > MAX_BACKDROP) {
        problems.push(`${backdrop} déclarations backdrop-filter (plafond : ${MAX_BACKDROP}). C'est la propriété la plus coûteuse du CSS : une passe de compositing par frame.`);
    }
    for (const location of transitionAll) {
        problems.push(`${location} — « transition: all » force le navigateur à surveiller toutes les propriétés animables, y compris celles qui déclenchent un recalcul de mise en page. Listez explicitement transform et opacity.`);
    }
    return backdrop;
}

function analyserKeyframes(files, problems, cwd) {
    const declarations = new Map();
    let globalText = '';
    for (const file of files) {
        if (!file.endsWith('.css') && !file.endsWith('.js')) continue;
        const source = neutraliserCommentaires(fs.readFileSync(file, 'utf8'));
        globalText += `\n${source}`;
        if (!file.endsWith('.css')) continue;
        const rel = relative(cwd, file);
        for (const match of source.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) {
            if (!declarations.has(match[1])) declarations.set(match[1], []);
            declarations.get(match[1]).push(`${rel}:${ligne(source, match.index)}`);
        }
    }

    const withoutDeclarations = globalText.replace(/@keyframes\s+[A-Za-z0-9_-]+/g, '');
    const orphaned = [];
    const duplicated = [];
    for (const [name, sites] of declarations) {
        if (sites.length > 1) duplicated.push({ name, sites });
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(withoutDeclarations)) {
            orphaned.push({ name, site: sites[0] });
        }
    }
    if (orphaned.length) {
        problems.push(`Images-clés : ${orphaned.length} jeu(x) que plus rien n'utilise.`);
        for (const item of orphaned) problems.push(`  ${item.site} — @keyframes ${item.name}`);
    }
    if (duplicated.length) {
        problems.push(`Images-clés : ${duplicated.length} nom(s) déclaré(s) plusieurs fois.`);
        for (const item of duplicated) problems.push(`  @keyframes ${item.name} — ${item.sites.join(', ')}`);
    }
    return { declarations: declarations.size };
}

function analyserBoucles(css, problems, cwd) {
    let count = 0;
    for (const file of css) {
        const source = fs.readFileSync(file, 'utf8');
        const rel = relative(cwd, file);
        for (const declaration of declarationsCss(source)) {
            const property = nomPropriete(declaration.clean);
            if (!property || property.nom.toLowerCase() !== 'animation') continue;
            const value = declaration.clean.slice(property.debutValeur);
            if (/\binfinite\b/i.test(value) && /--sh-dur-\d/.test(value)) {
                count += 1;
                problems.push(`${rel}:${ligne(source, declaration.offset)} — animation « infinite » sur une durée de transition. Utilisez un jeton --sh-loop-* (tokens.css).`);
            }
        }
    }
    return count;
}

/**
 * Analyse un arbre CSS/JS. `roots` peut contenir des chemins absolus vers des
 * fixtures, ce qui permet à Vitest d'exercer chaque règle sans modifier le
 * code applicatif.
 */
export function analyserCss({ roots = ROOTS, cwd = process.cwd() } = {}) {
    const files = roots.flatMap(root => walk(path.resolve(cwd, root)));
    const js = files.filter(file => file.endsWith('.js'));
    const css = files.filter(file => file.endsWith('.css'));
    const problems = [];
    const transitionAll = [];

    analyserStylesJs(js, problems, cwd);
    analyserImports(js, css, problems, cwd);
    for (const file of css) {
        analyserFichierCss(fs.readFileSync(file, 'utf8'), relative(cwd, file), problems, transitionAll);
    }
    analyserOmbres(css, problems, cwd);
    const backdrop = analyserGpu(css, problems, cwd, transitionAll);
    const keyframes = analyserKeyframes(files, problems, cwd);
    const loopCount = analyserBoucles(css, problems, cwd);

    return {
        problems,
        files: { js, css },
        stats: {
            js: js.length,
            css: css.length,
            backdrop,
            transitionAll: transitionAll.length,
            keyframes: keyframes.declarations,
            loops: loopCount,
        },
    };
}

export function afficherRapport(result) {
    if (result.problems.length) {
        console.error(`Hygiène CSS : ${result.problems.length} problème(s).\n`);
        for (const problem of result.problems) console.error(`  ✖ ${problem}`);
        return false;
    }
    console.log(`Images-clés : ${result.stats.keyframes} jeu(x), aucun orphelin, aucun doublon.`);
    console.log(`Hygiène CSS : ${result.stats.js} fichier(s) JS et ${result.stats.css} feuille(s) vérifiés.`);
    console.log('Aucun CSS embarqué dans du JS, aucune feuille orpheline, aucune ombre figée.');
    console.log(`Coût GPU : ${result.stats.backdrop} backdrop-filter (plafond ${MAX_BACKDROP}), ${result.stats.transitionAll} « transition: all ».`);
    console.log('!important : toutes les priorités CSS sont terminales.');
    return true;
}

const estCli = process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (estCli) {
    const result = analyserCss();
    if (!afficherRapport(result)) process.exitCode = 1;
}
