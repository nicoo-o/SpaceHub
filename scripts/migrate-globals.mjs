/**
 * SpaceHub — Migration des accès globaux vers les accesseurs de services
 * ======================================================================
 *
 * Remplace `window.SpaceHub?.ui?.components?.toaster` et ses 689 semblables par
 * `svc.toaster()`. Le comportement est strictement identique — les accesseurs
 * renvoient `null` quand le service manque, exactement comme le `?.` remplacé —
 * mais un seul module sait désormais où vit chaque service.
 *
 * Ce que ce codemod REFUSE de toucher, et pourquoi :
 *
 *   - `core/SpaceHub.js` : c'est lui qui CONSTRUIT le namespace. Y router les
 *     accès par les accesseurs créerait un cycle d'importation.
 *   - `plugins/` : la variable globale EST le contrat public offert aux
 *     extensions tierces. La masquer derrière un module interne reviendrait à
 *     casser l'API que le SDK promet.
 *   - toute **écriture** (`window.SpaceHub.x = …`, `delete window.SpaceHub.x`) :
 *     un accesseur lit, il n'écrit pas. Ces cas restent explicites.
 *   - `typeof window.SpaceHub` et les tests d'existence de la racine elle-même.
 *
 * Les chemins sont essayés du plus long au plus court : sans cela,
 * `window.SpaceHub?.ui` capturerait la moitié de `window.SpaceHub?.ui?.themes`.
 *
 *   node scripts/migrate-globals.mjs [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOTS = ['core', 'ui', 'jellyfin', 'integrations'];
const EXCLUS = new Set(['core/SpaceHub.js', 'core/services.js', 'core/ServiceRegistry.js']);

/** chemin dans le namespace → nom de l'accesseur. Du plus long au plus court. */
const TABLE = [
    ['ui.components.modalSlideUpSheet', 'slideUpSheet'],
    ['ui.components.toaster',   'toaster'],
    ['ui.components.cardBuilder', 'cardBuilder'],
    ['core.spatialNavigation',  'nav'],
    ['core.audioFeedback',      'audioFeedback'],
    ['core.touchEngine',        'touchEngine'],
    ['core.moduleManager',      'moduleManager'],
    ['core.pluginManager',      'pluginManager'],
    ['core.pluginCatalog',      'pluginCatalog'],
    ['core.notifications',      'notifications'],
    ['core.ratingCache',        'ratingCache'],
    ['core.eventBus',           'eventBus'],
    ['core.settings',           'settings'],
    ['core.features',           'features'],
    ['core.parental',           'parental'],
    ['core.errors',             'errors'],
    ['core.router',             'router'],
    ['core.policy',             'policy'],
    ['core.tvMode',             'tvMode'],
    ['core.cache',              'cache'],
    ['core.gamepad',            'gamepad'],
    ['core.api',                'api'],
    ['ui.modalSlideUpSheet',    'slideUpSheet'],
    ['ui.jellyfinConsole',      'jellyfinConsole'],
    ['ui.adminDashboard',       'adminDashboard'],
    ['ui.gooeyScroller',        'gooeyScroller'],
    ['ui.settingsPanel',        'settingsPanel'],
    ['ui.sidebarDrawer',        'sidebar'],
    ['ui.onboarding',           'onboarding'],
    ['ui.appLayout',            'appLayout'],
    ['ui.dashboard',            'dashboard'],
    ['ui.themes',               'themes'],
    ['ui.trailers',             'trailers'],
    ['jellyfin.collections',    'collections'],
    ['jellyfin.plugins',        'jellyfinPlugins'],
    ['jellyfin.remote',         'remote'],
    ['jellyfin.search',         'search'],
    ['jellyfin.api',            'jellyfinApi'],
    ['player.queue',            'queue'],
    ['spatialNav',              'nav'],
    ['metadata',                'metadata'],
    ['trailers',                'trailers'],
    ['player',                  'player'],
    ['auth',                    'auth'],
    ['sdk',                     'sdk'],
    ['pluginCatalog',           'pluginCatalog'],
    ['plugins',                 'plugins'],
];

/** `a.b.c` → `window\.SpaceHub\??\.a\??\.b\??\.c` (les `?.` sont optionnels). */
function motif(chemin) {
    const segments = chemin.split('.');
    return new RegExp(
        'window\\.SpaceHub\\??\\.' + segments.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\??\\.'),
        'g'
    );
}

const MOTIF_INTEGRATION = /window\.SpaceHub\??\.integrations\??\.(\w+)/g;

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** Chemin d'importation relatif vers core/services.js. */
function importRelatif(fichier) {
    const rel = path.relative(path.dirname(fichier), path.join('core', 'services.js')).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : './' + rel;
}

let totalRemplace = 0;
const parFichier = [];
const ignores = [];

for (const fichier of ROOTS.flatMap(r => walk(r))) {
    const rel = fichier.split(path.sep).join('/');
    if (EXCLUS.has(rel)) { ignores.push([rel, 'construit ou définit le namespace']); continue; }

    let src = fs.readFileSync(fichier, 'utf8');
    if (!src.includes('window.SpaceHub')) continue;

    const utilises = new Set();
    let n = 0;

    // 1. Intégrations — un accesseur paramétré.
    src = src.replace(MOTIF_INTEGRATION, (tout, nom, offset, chaine) => {
        if (/^\s*=[^=]/.test(chaine.slice(offset + tout.length))) return tout; // écriture
        n++; utilises.add('integration');
        return `svc.integration('${nom}')`;
    });

    // 2. Chemins fixes, du plus long au plus court.
    for (const [chemin, accesseur] of TABLE) {
        src = src.replace(motif(chemin), (tout, offset, chaine) => {
            const apres = chaine.slice(offset + tout.length);
            // Une écriture (`= …` mais pas `==`) reste explicite : un accesseur lit.
            if (/^\s*=[^=]/.test(apres)) return tout;
            // `delete window.SpaceHub.x` de même.
            const avant = chaine.slice(Math.max(0, offset - 8), offset);
            if (/delete\s+$/.test(avant)) return tout;
            n++; utilises.add(accesseur);
            return `svc.${accesseur}()`;
        });
    }

    if (n === 0) continue;

    // 3. Importation, ajoutée une seule fois.
    if (APPLY && !src.includes("from '" + importRelatif(fichier) + "'")) {
        const imports = [...src.matchAll(/^import\s[^\n]*;\s*$/gm)];
        const ligne = `import * as svc from '${importRelatif(fichier)}';`;
        if (imports.length) {
            const dernier = imports[imports.length - 1];
            src = src.slice(0, dernier.index + dernier[0].length) + '\n' + ligne + src.slice(dernier.index + dernier[0].length);
        } else {
            const us = /^['"]use strict['"];\s*$/m.exec(src);
            const at = us ? us.index + us[0].length : 0;
            src = src.slice(0, at) + '\n\n' + ligne + src.slice(at);
        }
    }

    if (APPLY) fs.writeFileSync(fichier, src, 'utf8');
    totalRemplace += n;
    parFichier.push([rel, n, [...utilises].sort().join(', ')]);
}

parFichier.sort((a, b) => b[1] - a[1]);
console.log(`${APPLY ? 'Appliqué' : 'Simulation'} : ${totalRemplace} accès migrés dans ${parFichier.length} fichier(s).\n`);
for (const [f, n, acc] of parFichier.slice(0, 20)) console.log(`  ${String(n).padStart(3)}  ${f}\n        ${acc}`);
if (parFichier.length > 20) console.log(`  … et ${parFichier.length - 20} autre(s) fichier(s).`);
if (ignores.length) {
    console.log(`\nVolontairement ignorés :`);
    for (const [f, why] of ignores) console.log(`  · ${f} — ${why}`);
}
