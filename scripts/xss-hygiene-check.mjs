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
 * Pour ajouter un cas légitime, ajoutez-le à REVUS avec la raison — ce qui
 * oblige à écrire pourquoi c'est sûr.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

/** Fonctions qui rendent une valeur sûre. */
const SUR = /^(?:this\._escape|_escape|escapeHtml|encodeURIComponent|String\(|Number\(|JSON\.stringify|render\w+|\w+Svg|this\.get\w*Svg)/;

/** Noms de champs qui trahissent une donnée d'origine externe. */
const DONNEE = /\b(?:name|Name|title|Title|label|Label|overview|Overview|description|Description|path|Path|category|Category|indexer|Indexer|tracker|release|Release|filename|fileName|FileName|episode|Episode|series|Series|movie|Movie|user|User|message|Message|error|Error)\b/;

/**
 * Cas relus un par un et jugés sûrs. La clé est `fichier::expression`.
 * Chacun doit porter la raison — si elle ne tient pas en une phrase, c'est
 * probablement qu'il faut échapper plutôt qu'inscrire ici.
 */
const REVUS = new Map([
    ['ui/widgets/MoviesWidget.js::this.title',            'titre du widget, constante du code'],
    ['ui/widgets/AnimeWidget.js::this.title',             'titre du widget, constante du code'],
    ['ui/widgets/ContinueWatchingWidget.js::this.title',  'titre du widget, constante du code'],
    ['ui/widgets/LatestAdditionsWidget.js::this.title',   'titre du widget, constante du code'],
    ['ui/widgets/TvShowsWidget.js::this.title',           'titre du widget, constante du code'],
    ['ui/widgets/CollectionsWidget.js::this.title',       'titre du widget, constante du code'],
    ['ui/widgets/MusicWidget.js::this.title',             'titre du widget, constante du code'],
    ['ui/widgets/LibrariesWidget.js::this.title',         'titre du widget, constante du code'],
    ['integrations/sonarr/SonarrWidgets.js::this.title',       'titre du widget, constante du code'],
    ['integrations/radarr/RadarrWidgets.js::this.title',       'titre du widget, constante du code'],
    ['integrations/bazarr/BazarrWidgets.js::this.title',       'titre du widget, constante du code'],
    ['integrations/prowlarr/ProwlarrWidgets.js::this.title',   'titre du widget, constante du code'],
    ['integrations/qbittorrent/QBittorrentWidgets.js::this.title', 'titre du widget, constante du code'],
    ['integrations/jellyseerr/JellyseerrWidgets.js::this.title',   'titre du widget, constante du code'],
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

const nouveaux = [];
let examines = 0;

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/innerHTML\s*\+?=\s*`/g)) {
        let i = m.index + m[0].length;
        while (i < src.length) {
            if (src[i] === '\\') { i += 2; continue; }
            if (src[i] === '`') break;
            i++;
        }
        const tpl = src.slice(m.index + m[0].length, i);
        const ligne = src.slice(0, m.index).split('\n').length;
        for (const e of tpl.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
            const expr = e[1].trim();
            examines++;
            if (SUR.test(expr)) continue;
            if (/^[\w.$?[\]()]+\s*[=!]==?\s*['"]/.test(expr)) continue;  // ternaire de classe
            if (!DONNEE.test(expr)) continue;
            const cle = `${rel}::${expr}`;
            if (REVUS.has(cle)) continue;
            nouveaux.push(`${rel}:${ligne + tpl.slice(0, e.index).split('\n').length - 1} — \`${expr.slice(0, 70)}\``);
        }
    }
}

if (nouveaux.length) {
    console.error(`Injection HTML : ${nouveaux.length} interpolation(s) de données non échappée(s) et non relue(s).\n`);
    for (const n of nouveaux) console.error('  ✖ ' + n);
    console.error('\nSoit vous l\'échappez (escapeHtml / this._escape), soit vous l\'inscrivez dans REVUS de ce fichier avec la raison.');
    process.exit(1);
}
console.log(`Injection HTML : ${examines} interpolation(s) examinée(s) dans des innerHTML.`);
console.log(`Aucune donnée externe non échappée hors des ${REVUS.size} cas relus et documentés.`);
