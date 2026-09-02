#!/usr/bin/env node
/**
 * SpaceHub — Vérification des contrats DOM
 *
 * Empêche la récidive du défaut qui a causé la quasi-totalité des blocages de
 * navigation TV : un sélecteur écrit dans le moteur de navigation qui ne
 * correspond à aucune classe réellement émise par un composant.
 *
 * Chaque sélecteur déclaré dans core/DomContracts.js doit apparaître au moins
 * une fois dans le code d'interface. Un sélecteur orphelin = code de navigation
 * qui ne s'exécutera jamais.
 *
 * Usage : node scripts/nav-contract-check.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['ui', 'jellyfin', 'core', 'integrations', 'plugins'];
const CONTRACT_FILE = join(ROOT, 'core', 'DomContracts.js');

/** Sélecteurs volontairement conservés sans DOM associé. */
const ALLOWED_ORPHANS = new Set([
    // Construit dynamiquement par Modal.js : `this._el.id = \`sh-modal-${this.id}\``
    // avec id: 'spacehub-settings' cote SettingsPanel. Introuvable par analyse
    // statique, mais bien present a l'execution.
    '#sh-modal-spacehub-settings',
]);

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(js|css|html)$/.test(entry) && !full.includes('DomContracts.js')) out.push(full);
    }
    return out;
}

function atoms(selector) {
    return selector
        .split(',')
        .map(s => s.trim())
        .flatMap(s => s.match(/[.#][A-Za-z0-9_-]+|\[[^\]]+\]/g) || [])
        .filter(Boolean);
}

/**
 * Une classe/id n'est « présente » que si elle est réellement ÉMISE quelque part :
 * dans un attribut class/id, un classList.add/toggle, un className, ou un
 * getElementById. Une simple mention en commentaire ou dans un autre sélecteur
 * ne compte pas — c'est précisément ce qui masquait les sélecteurs morts.
 */
function isPresent(atom, haystack) {
    if (atom.startsWith('[')) return haystack.includes(atom.slice(1, -1).split('=')[0]);
    const name = atom.slice(1);
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emitters = atom.startsWith('#')
        ? [
            `id="${esc}"`,
            `id='${esc}'`,
            new RegExp(`\\.id\\s*=\\s*['"\`]${esc}['"\`]`),
            new RegExp(`getElementById\\(\\s*['"\`]${esc}['"\`]`),
          ]
        : [
            new RegExp(`class\\s*=\\s*['"\`][^'"\`]*\\b${esc}\\b`),
            new RegExp(`classList\\.(add|toggle|remove)\\([^)]*['"\`]${esc}['"\`]`),
            new RegExp(`className\\s*=\\s*[^;\\n]*\\b${esc}\\b`),
            new RegExp(`^\\s*\\.${esc}\\b`, 'm'),   // règle CSS qui définit la classe
          ];
    return emitters.some(e => (typeof e === 'string' ? haystack.includes(e) : e.test(haystack)));
}

const files = SCAN_DIRS
    .map(d => join(ROOT, d))
    .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } })
    .flatMap(d => walk(d));

const haystack = files.map(f => readFileSync(f, 'utf8')).join('\n');

const contracts = await import(pathToFileURL(CONTRACT_FILE).href);
const groups = {
    LAYERS: contracts.LAYERS,
    FOCUSABLES: contracts.FOCUSABLES,
    CAROUSELS: { carousels: contracts.CAROUSELS },
    SCROLL_CONTAINERS: { scrollContainers: contracts.SCROLL_CONTAINERS },
};

let checked = 0;
const orphans = [];

for (const [groupName, group] of Object.entries(groups)) {
    for (const [key, selector] of Object.entries(group)) {
        for (const atom of atoms(selector)) {
            checked++;
            if (!isPresent(atom, haystack) && !ALLOWED_ORPHANS.has(atom)) {
                orphans.push(`${groupName}.${key} → ${atom}`);
            }
        }
    }
}

for (const layer of contracts.BACK_ORDER) {
    if (!(layer in contracts.LAYERS)) {
        orphans.push(`BACK_ORDER → couche inconnue « ${layer} »`);
    }
}

console.log(`Contrats DOM : ${checked} sélecteurs vérifiés sur ${files.length} fichiers.`);

if (orphans.length) {
    console.error(`\n${orphans.length} sélecteur(s) orphelin(s) — présents dans le contrat, absents du DOM :\n`);
    for (const o of orphans) console.error(`   ${o}`);
    console.error(`\nUn sélecteur orphelin signifie que le code de navigation qui l'utilise`);
    console.error(`ne s'exécutera jamais. Corrigez le contrat ou le composant.\n`);
    process.exit(1);
}

console.log('Aucun sélecteur orphelin : le moteur de navigation et le DOM sont alignés.');
