/**
 * SpaceHub — Méthodes appelées mais jamais définies
 * ================================================
 *
 * Deux défauts de la même famille, trouvés à deux endroits sans rapport :
 *
 *   - `SpatialNavigation.popFocus` appelait `this._isElementVisible?.(…)`.
 *     La méthode n'existait nulle part. L'optionnel `?.` renvoyait `undefined`,
 *     et `undefined !== false` vaut `true` : le test de visibilité était donc
 *     TOUJOURS satisfait, silencieusement, depuis toujours ;
 *   - la commande « Surprenez-moi ! » appelait `this._getDefaultCatalog()`.
 *     La méthode n'existait pas davantage — mais sans `?.`, celle-là levait
 *     une TypeError. La commande figurait dans la palette et n'avait jamais
 *     rien lancé.
 *
 * Les deux sont invisibles à l'exécution normale : l'un ne lève pas, l'autre
 * n'est déclenché que par une action rare. Aucun test ne les couvrait, et
 * aucun n'aurait naturellement pensé à les couvrir.
 *
 * Ce contrôle lit chaque classe, relève les `this._xxx(` qu'elle appelle, et
 * vérifie que le nom est défini quelque part dans le fichier — méthode,
 * champ, ou affectation. Il ne remonte pas les chaînes d'héritage : les
 * classes de ce dépôt n'en ont pas.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const fantomes = [];
let appelsVerifies = 0;
let fichiers = 0;

for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const brut = fs.readFileSync(f, 'utf8');
    // Les commentaires citent volontiers le nom d'une méthode disparue — c'est
    // même le cas de ceux qui EXPLIQUENT sa disparition. On les neutralise en
    // conservant les sauts de ligne, pour que les numéros restent justes.
    const src = brut
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
    if (!/\bclass\s+\w/.test(src)) continue;
    if (/\bextends\s+\w/.test(src)) continue;   // héritage : hors périmètre
    fichiers++;

    // Tout ce que le fichier DÉFINIT sur l'instance, sous n'importe quelle forme.
    const definis = new Set();
    for (const m of src.matchAll(/^\s{0,8}(?:async\s+|static\s+|\*\s*)*(_\w+)\s*\(/gm)) definis.add(m[1]);
    for (const m of src.matchAll(/this\.(_\w+)\s*=/g)) definis.add(m[1]);
    for (const m of src.matchAll(/^\s{0,8}(_\w+)\s*=/gm)) definis.add(m[1]);
    // Objets littéraux : `{ _machin() {} }` ou `{ _machin: () => {} }`
    for (const m of src.matchAll(/(_\w+)\s*:\s*(?:async\s*)?(?:function|\()/g)) definis.add(m[1]);

    for (const m of src.matchAll(/this\.(_\w+)\s*\??\.?\s*\(/g)) {
        appelsVerifies++;
        const nom = m[1];
        if (definis.has(nom)) continue;
        fantomes.push({ rel, ligne: src.slice(0, m.index).split('\n').length, nom });
    }
}

if (fantomes.length) {
    console.error(`Méthodes fantômes : ${fantomes.length} appel(s) vers une méthode jamais définie.\n`);
    for (const g of fantomes) console.error(`  x ${g.rel}:${g.ligne} — this.${g.nom}(…)`);
    console.error('\nUn appel `this._xxx?.(…)` ne lève pas : il renvoie undefined, et le');
    console.error('code continue avec une valeur fausse. Sans ce contrôle, le défaut est');
    console.error('invisible. Définissez la méthode, ou retirez l\'appel.');
    process.exit(1);
}

// ─── Second volet : les FONCTIONS libres appelées et jamais définies ────────
//
// Le premier volet ne regarde que `this._xxx(`. Or `core/ApiClient.js` appelait
// `signalerProxyAbsent(this._log)` et `proxyBase()` — deux fonctions libres,
// définies nulle part, sur le chemin de panne le plus probable en production
// (un serveur statique qui renvoie `index.html` pour `/api-proxy`). La branche
// levait une `ReferenceError` au lieu du message prévu, et cette erreur
// échappait aux deux gardes de reprise. Le contrôle passait au vert.
//
// On ne peut pas résoudre les portées sans analyser l'arbre syntaxique ; on
// s'en tient donc à une heuristique sûre : un identifiant en position d'appel,
// écrit en minuscule camel, qui n'est ni importé, ni déclaré, ni une globale
// connue, ni une propriété (`x.foo()`), ni un mot-clé.
const GLOBALES = new Set([
    'fetch','setTimeout','clearTimeout','setInterval','clearInterval','require',
    'requestAnimationFrame','cancelAnimationFrame','queueMicrotask','structuredClone',
    'encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','parseInt',
    'parseFloat','isNaN','isFinite','alert','confirm','prompt','btoa','atob',
    'import','super','this','typeof','void','await','return','new','delete',
    'if','for','while','switch','catch','function','yield','do','else','case',
    'async','getComputedStyle','requestIdleCallback','cancelIdleCallback','matchMedia',
    // Fonctions CSS écrites dans des gabarits, pas du JavaScript.
    'url','rgba','rgb','calc','var','translate','scale','blur','linear',
]);
const libresFantomes = [];
for (const f of ROOTS.flatMap(r => walk(r))) {
    const rel = f.split(path.sep).join('/');
    const brut = fs.readFileSync(f, 'utf8');
    const src = brut
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
        .replace(/`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/'(?:\\.|[^'\\\n])*'/g, '\'\'')
        .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

    const connus = new Set();
    for (const m of src.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/gm)) connus.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) connus.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
        for (const n of m[1].split(',')) connus.add(n.split(':').pop().trim().split('=')[0].trim());
    for (const m of src.matchAll(/import\s+([^;]+?)\s+from/g))
        for (const n of m[1].replace(/[{}]/g, ',').split(','))
            connus.add(n.replace(/\*\s*as\s*/, '').trim().split(/\s+as\s+/).pop().trim());
    // Un nom de paramètre, quelle que soit la forme d'écriture. Le `replace`
    // final compte : `new Promise((resolve) => …)` fait capturer « (resolve »
    // avec sa parenthèse, et sans nettoyage `resolve` passait pour inconnu.
    const ajouterParams = (liste) => {
        for (const n of String(liste).split(',')) {
            const nom = n.trim().split(/[=:\s]/)[0].replace(/[^\w$]/g, '');
            if (nom) connus.add(nom);
        }
    };
    for (const m of src.matchAll(/function[^(]*\(([^)]*)\)/g)) ajouterParams(m[1]);
    for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) ajouterParams(m[1]);
    // Méthodes de classe et raccourcis d'objet : `async mount(a, b) {`.
    for (const m of src.matchAll(/^\s*(?:static\s+|async\s+|\*\s*)*\w+\s*\(([^)]*)\)\s*\{/gm)) ajouterParams(m[1]);
    for (const m of src.matchAll(/(?:^|[^\w.])(\w+)\s*=>/g)) connus.add(m[1]);
    for (const m of src.matchAll(/catch\s*\(\s*(\w+)/g)) connus.add(m[1]);
    // Liaisons de boucle : `for (const extra of …)`, `for (const [k, v] of …)`.
    for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s+([\w$,\[\]{}\s]+?)\s+(?:of|in)\s/g))
        ajouterParams(m[1].replace(/[[\]{}]/g, ','));
    for (const m of src.matchAll(/(?:^|[^\w.])(?:class)\s+(\w+)/g)) connus.add(m[1]);

    for (const m of src.matchAll(/(?<![\w.$'"`])([a-z][a-zA-Z0-9]*)\s*\(/g)) {
        const nom = m[1];
        if (GLOBALES.has(nom) || connus.has(nom)) continue;
        if (/^(get|set)$/.test(nom)) continue;

        // À l'intérieur d'un littéral de gabarit ? Le blanchiment plus haut ne
        // gère pas les backticks imbriqués dans un `${…}`, et des mots français
        // suivis d'une parenthèse (« url(… », « en cours(… ») y passaient pour
        // des appels. Un nombre IMPAIR de backticks avant la position signifie
        // qu'on est dans du texte, pas dans du code.
        const backticks = (src.slice(0, m.index).match(/(?<!\\)`/g) || []).length;
        if (backticks % 2 === 1) continue;

        // Le comptage ci-dessus échoue sur les gabarits IMBRIQUÉS (un backtick
        // dans un `${…}`). Second filet, purement textuel : en JavaScript, un
        // appel n'est jamais précédé d'un MOT suivi d'une espace. « les saisons
        // futures (Sonarr) » et « En cours (3) » sont de la prose française,
        // pas du code.
        const avant = src.slice(0, m.index).replace(/\s+$/, '');
        if (/[\p{L}]$/u.test(avant) && /\s/.test(src.slice(0, m.index).slice(-1))) continue;

        // DÉFINITION ou APPEL ? Une définition de méthode voit sa liste de
        // paramètres suivie d'une accolade : `request(url, options) {`. Un
        // appel, lui, est suivi d'un `;`, d'une virgule, d'un opérateur…
        // Sans cette distinction, le contrôle signalait chaque méthode de
        // classe du dépôt comme « jamais définie ».
        let i = m.index + m[0].length - 1, prof = 0;
        for (; i < src.length; i++) {
            if (src[i] === '(') prof++;
            else if (src[i] === ')') { prof--; if (prof === 0) break; }
        }
        const suite = src.slice(i + 1).match(/^\s*(.)/);
        if (suite && suite[1] === '{') continue;   // définition

        libresFantomes.push({ rel, ligne: src.slice(0, m.index).split('\n').length, nom });
    }
}

if (libresFantomes.length) {
    console.error(`Fonctions fantômes : ${libresFantomes.length} appel(s) vers une fonction jamais définie.\n`);
    for (const g of libresFantomes) console.error(`  x ${g.rel}:${g.ligne} — ${g.nom}(…)`);
    console.error('\nUn identifiant inconnu en position d\'appel lève une ReferenceError,');
    console.error('qui n\'est ni un TypeError ni une erreur applicative : elle traverse les');
    console.error('gardes de reprise et remonte telle quelle jusqu\'à l\'utilisateur.');
    process.exit(1);
}

console.log(`Méthodes fantômes : ${appelsVerifies} appel(s) vérifié(s) dans ${fichiers} classe(s).`);
console.log('Toute méthode appelée sur `this` est définie dans son fichier.');
console.log('Fonctions fantômes : aucun appel vers une fonction libre inconnue.');
