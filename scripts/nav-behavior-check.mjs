#!/usr/bin/env node
/**
 * SpaceHub — Test de comportement de la navigation (statique, sans dépendance)
 *
 * Complète nav-contract-check.mjs. Celui-ci vérifiait que les sélecteurs du
 * contrat existent quelque part dans l'application. Celui-là vérifie une
 * propriété plus forte, au niveau de chaque composant :
 *
 *   « Tout sélecteur qu'un composant déclare au moteur de navigation via
 *     registerFocusables() doit être émis par un composant de l'application. »
 *
 *  C'est exactement la propriété qui était violée partout :
 *   - UnifiedSearch déclarait .sh-spotlight-filter-chip / .sh-spotlight-card
 *     alors qu'il émettait .sh-spotlight-tab-btn / .sh-spotlight-item ;
 *   - AppSidebarDrawer cherchait .sh-sidebar-drawer.open, jamais posé ;
 *   - Dashboard déclarait #sh-hero-play-btn, inexistant.
 *
 * Vérifie aussi qu'aucun scope n'est déclaré sans provider, et qu'aucun
 * provider ne cible un conteneur de la taille de la page.
 *
 * Usage : node scripts/nav-behavior-check.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['ui', 'jellyfin', 'core', 'integrations', 'plugins'];

/** Conteneurs : légitimes comme racine de recherche, jamais comme cible de focus. */
const CONTAINERS = new Set([
    '.sh-dashboard', '.sh-library-explorer', '#app', '.sh-app-layout', 'body',
]);

function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith('.js')) out.push(full);
    }
    return out;
}

const files = SCAN
    .map(d => join(ROOT, d))
    .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } })
    .flatMap(d => walk(d));

const sources = new Map(files.map(f => [f, readFileSync(f, 'utf8')]));
const all = [...sources.values()].join('\n');

/** Une classe/id est-elle réellement émise quelque part ? */
function emitted(atom) {
    const name = atom.slice(1);
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (atom.startsWith('#')) {
        return new RegExp(`id\\s*=\\s*['"\`]${esc}['"\`]|\\.id\\s*=\\s*['"\`]${esc}['"\`]|getElementById\\(\\s*['"\`]${esc}['"\`]`).test(all);
    }
    return new RegExp(`class\\s*=\\s*['"\`][^'"\`]*\\b${esc}\\b|classList\\.(add|toggle|remove)\\([^)]*['"\`]${esc}['"\`]|className\\s*=\\s*[^;\\n]*\\b${esc}\\b|^\\s*\\.${esc}\\b`, 'm').test(all);
}

const problemes = [];
let scopes = 0, verifies = 0;

for (const [file, src] of sources) {
    const rel = relative(ROOT, file);

    // registerFocusables('<scope>', ...) puis les sélecteurs du bloc qui suit
    const re = /registerFocusables\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(src))) {
        scopes++;
        const scope = m[1];
        const bloc = src.slice(m.index, m.index + 1600);
        const selecteurs = [...bloc.matchAll(/querySelectorAll?\(\s*[`'"]([^`'"]+)[`'"]/g)].map(x => x[1]);

        for (const sel of selecteurs) {
            const atomes = (sel.match(/[.#][A-Za-z0-9_-]+/g) || []);
            for (const atome of atomes) {
                verifies++;
                if (!emitted(atome)) {
                    problemes.push({
                        gravite: 'MORT',
                        msg: `${rel} — scope « ${scope} » déclare ${atome}, qui n'est émis nulle part.`,
                    });
                }
                if (CONTAINERS.has(atome) && /querySelectorAll/.test(bloc.slice(bloc.indexOf(sel) - 30, bloc.indexOf(sel) + 5))) {
                    problemes.push({
                        gravite: 'PIÈGE',
                        msg: `${rel} — scope « ${scope} » liste ${atome} comme cible focalisable : un conteneur de la taille de la page capte le focus dans toutes les directions.`,
                    });
                }
            }
        }
        // Un provider qui passe par les constantes de DomContracts (FOCUSABLES.x)
        // n'expose pas de littéral : c'est le cas recommandé, déjà couvert par
        // nav-contract-check.mjs. On ne le signale donc pas comme vide.
        const viaContrat = /FOCUSABLES\.[A-Za-z]+|LAYERS\.[A-Za-z]+|CAROUSELS|SCROLL_CONTAINERS/.test(bloc);
        if (selecteurs.length === 0 && !viaContrat) {
            problemes.push({ gravite: 'VIDE', msg: `${rel} — scope « ${scope} » : aucun sélecteur détecté dans le provider.` });
        }
    }
}

console.log(`Comportement navigation : ${scopes} scope(s), ${verifies} sélecteur(s) de provider vérifié(s).`);

if (problemes.length) {
    console.error(`\n${problemes.length} problème(s) :\n`);
    for (const p of problemes) console.error(`  [${p.gravite}] ${p.msg}`);
    console.error('');
    process.exit(1);
}
console.log('Chaque scope déclare uniquement des éléments réellement émis par l\'application.');
