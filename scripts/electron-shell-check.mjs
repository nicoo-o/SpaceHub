/**
 * SpaceHub — le shell Electron s'évalue-t-il, ET tient-il ses promesses ?
 * =======================================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * `apps/electron/main.js` n'est jamais exécuté par la chaîne de tests. Le
 * lint ne lance que `node --check`, qui valide la FORME du code (activité
 * d'un analyseur syntaxique) : un identifiant libre non importé y passe
 * sans broncher, parce que `dirname` est un nom parfaitement légal. Le
 * module est donc déclaré syntaxiquement correct et plante pourtant au
 * démarrage, dans le processus principal, sur la première ligne qui
 * l'utilise.
 *
 * C'est exactement ce qui est arrivé : `const RACINE = dirname(...)` vivait
 * dans le shell depuis que le paquet Windows existe (PR #14), sans que
 * `dirname` figure à l'import de `node:path`. Aucun `.exe` n'a jamais
 * démarré — trois releases (v1.3.0, v1.4.0, v1.5.0) sont parties avec une
 * coquille morte, et l'utilisateur a découvert le défaut en double-cliquant.
 *
 * CE QUE CE CONTRÔLE PROUVAIT, ET L'ILLUSION QUI VA AVEC
 * -----------------------------------------------------
 * La première version se contentait d'importer le vrai `main.js` avec
 * `electron` et `electron-updater` doublés, et concluait « le shell
 * s'évalue ». C'est vrai, utile, et beaucoup plus faible que ce que le
 * fichier laissait croire, pour deux raisons précises.
 *
 * PREMIÈRE : la doublure de `BrowserWindow` IGNORAIT SON ARGUMENT.
 *
 *     export class BrowserWindow {
 *         constructor() { return fausseFenetre(); }
 *     }
 *
 * Le shell passe pourtant `webPreferences` — `contextIsolation`,
 * `nodeIntegration`, `sandbox` — c'est-à-dire la totalité de ses choix de
 * sécurité, et l'en-tête de `main.js` les énumère comme des garanties. La
 * doublure jetait cet objet. Vérifié : en forçant `nodeIntegration: true`
 * dans le shell, le contrôle restait VERT. Il aurait donc regardé sans
 * broncher une fenêtre Chromium donnant à la page un accès complet à Node.
 *
 * SECONDE : `creerFenetre()` sort par le haut en développement.
 *
 *     if (!existsSync(INDEX)) { fenetre.loadURL('data:…'); return; }
 *
 * `apps/electron/www/index.html` n'existe pas dans les sources — il est
 * assemblé au moment de l'empaquetage. Dans l'arbre de travail la garde est
 * donc toujours vraie, la fonction retourne à cette ligne, et TOUT ce qui
 * suit — `loadFile`, `setWindowOpenHandler`, `will-navigate` — n'était
 * jamais traversé. Les deux gardes de navigation, celles qui empêchent
 * l'application d'ouvrir un site dans sa propre fenêtre, n'ont jamais été
 * exécutées par ce contrôle une seule fois.
 *
 * CE QUE CE CONTRÔLE VÉRIFIE MAINTENANT
 * -------------------------------------
 *   1. le shell s'évalue de bout en bout (le contrat d'origine) ;
 *   2. `webPreferences` est INSPECTÉ : la doublure capture les options
 *      reçues et on exige les quatre valeurs sûres ;
 *   3. `www/index.html` est FABRIQUÉ dans un dossier temporaire, pour que
 *      `creerFenetre()` aille jusqu'au bout et pose réellement ses deux
 *      gardes de navigation. On les déclenche ensuite : un `https://` doit
 *      partir au navigateur du système et être refusé dans la fenêtre ;
 *   4. l'auto-update ne se branche QUE si le paquet est signé — les deux
 *      branches sont exercées, pas seulement celle qui passe.
 *
 * CE QUE CE CONTRÔLE NE PROUVE TOUJOURS PAS
 * -----------------------------------------
 * Aucune vraie fenêtre, aucun vrai Chromium : les doublures répondent à la
 * place d'Electron. Le contrat est « le shell demande les bonnes choses »,
 * pas « Electron les accorde ». La fumée de démarrage du vrai binaire reste
 * à faire à la main, ou sur un runner Windows.
 *
 *   node scripts/electron-shell-check.mjs
 */

import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = join(RACINE, 'apps', 'electron', 'main.js');
const WWW = join(RACINE, 'apps', 'electron', 'www');
const INDEX = join(WWW, 'index.html');

if (!existsSync(SHELL)) {
    console.error(`Shell Electron introuvable : ${SHELL}`);
    process.exit(1);
}

const problemes = [];
const faits = [];

// ─── Le mouchard ──────────────────────────────────────────────────────────
//
// Les doublures écrivent ici ce que le shell leur a demandé. C'est tout le
// changement de nature de ce contrôle : on ne regarde plus seulement si le
// module survit à son évaluation, on regarde CE QU'IL DEMANDE.
globalThis.__shellEspion = {
    optionsFenetre: null,
    gestionnaireOuverture: null,
    ecouteurs: new Map(),
    chargements: [],
    externes: [],
    updaterBranche: false,
};

const DOUBLURE_ELECTRON = `
const espion = globalThis.__shellEspion;

function fausseFenetre() {
    return {
        loadFile(chemin) { espion.chargements.push(['file', chemin]); },
        loadURL(url) { espion.chargements.push(['url', url]); },
        isMinimized: () => false,
        restore() {},
        focus() {},
        webContents: {
            setWindowOpenHandler(fn) { espion.gestionnaireOuverture = fn; },
            on(nom, fn) { espion.ecouteurs.set(nom, fn); },
        },
    };
}

export const app = {
    commandLine: { appendSwitch() {} },
    requestSingleInstanceLock: () => true,
    on() {},
    whenReady: () => Promise.resolve(),
    getPath: () => process.env.TEMP || process.env.TMPDIR || '/tmp',
    quit() {},
};

export class BrowserWindow {
    // L'ARGUMENT EST GARDÉ. C'était tout le défaut de la version précédente.
    constructor(options) { espion.optionsFenetre = options; return fausseFenetre(); }
    static getAllWindows() { return []; }
}

export const Menu = { setApplicationMenu() {} };
export const shell = { openExternal(url) { espion.externes.push(url); } };
export const ipcMain = { on() {} };
`;

const DOUBLURE_UPDATER = `
const espion = globalThis.__shellEspion;
export const autoUpdater = {
    on() {},
    checkForUpdates: () => { espion.updaterBranche = true; return Promise.resolve(null); },
};
Object.defineProperty(autoUpdater, 'autoDownload', {
    set() { espion.updaterBranche = true; }, get() { return true; }, configurable: true,
});
`;

const enDataUrl = (source) => 'data:text/javascript,' + encodeURIComponent(source);

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'electron') {
            return { url: enDataUrl(DOUBLURE_ELECTRON), shortCircuit: true };
        }
        if (specifier === 'electron-updater') {
            return { url: enDataUrl(DOUBLURE_UPDATER), shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});

// ─── Faire exister www/index.html ─────────────────────────────────────────
//
// Sans ce fichier, `creerFenetre()` retourne avant de poser ses gardes de
// navigation et le contrôle passerait à côté de la moitié de la fonction.
// On le crée, on le retire, et on ne touche à rien s'il existait déjà (un
// paquet assemblé à la main ne doit pas être abîmé par un test).
let wwwCree = false;
let indexCree = false;
if (!existsSync(INDEX)) {
    if (!existsSync(WWW)) { mkdirSync(WWW, { recursive: true }); wwwCree = true; }
    writeFileSync(INDEX, '<!doctype html><title>contrôle</title>\n');
    indexCree = true;
}

const nettoyer = () => {
    try {
        if (indexCree) rmSync(INDEX, { force: true });
        if (wwwCree) rmSync(WWW, { recursive: true, force: true });
    } catch { /* rien à sauver ici */ }
};

// ─── L'évaluation ─────────────────────────────────────────────────────────
//
// `app-update.yml` absent du dossier de ressources : le shell doit REFUSER
// de brancher l'auto-update. C'est la branche par défaut, celle que tout le
// monde exécute aujourd'hui, puisque le paquet n'est pas signé.
const ressourcesNonSignees = mkdtempSync(join(tmpdir(), 'shell-nonsigne-'));
process.resourcesPath = ressourcesNonSignees;

let defaut = null;
try {
    await import(new URL('../apps/electron/main.js', import.meta.url).href);
    // `brancherAutoUpdate()` charge `electron-updater` de façon dynamique :
    // on laisse la microtâche se poser pour que cette branche soit
    // réellement traversée, elle aussi.
    await new Promise((resoudre) => setTimeout(resoudre, 150));
} catch (erreur) {
    defaut = erreur;
}

if (defaut) {
    nettoyer();
    console.error("Le shell Electron ne s'évalue pas :");
    console.error(defaut.stack || defaut.message);
    process.exit(1);
}
faits.push("le module s'évalue de bout en bout");

const espion = globalThis.__shellEspion;

// ─── 2. Les choix de sécurité de la fenêtre ───────────────────────────────
const prefs = espion.optionsFenetre?.webPreferences;
if (!prefs) {
    problemes.push(
        "BrowserWindow n'a reçu aucun `webPreferences`. Le shell laisserait "
        + 'alors Electron choisir ses défauts pour le bac à sable et '
        + "l'isolation de contexte.");
} else {
    const EXIGE = {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        sandbox: true,
    };
    for (const [cle, attendu] of Object.entries(EXIGE)) {
        if (prefs[cle] !== attendu) {
            problemes.push(
                `webPreferences.${cle} vaut ${JSON.stringify(prefs[cle])} au lieu de `
                + `${JSON.stringify(attendu)}. C'est un choix de sécurité que `
                + "l'en-tête de main.js présente comme une garantie.");
        }
    }
    if (typeof prefs.preload !== 'string' || !prefs.preload.endsWith('preload.cjs')) {
        problemes.push(
            'Le pont préchargé attendu (preload.cjs) est absent de '
            + `webPreferences.preload : ${JSON.stringify(prefs.preload)}.`);
    }
    if (problemes.length === 0) {
        faits.push('webPreferences : isolation, bac à sable, pas de Node dans la page');
    }
}

// ─── 3. Les gardes de navigation ──────────────────────────────────────────
//
// Elles ne sont pas seulement présentes : on les DÉCLENCHE. Une garde
// existante mais inerte serait invisible autrement.
if (!espion.chargements.some(([type]) => type === 'file')) {
    problemes.push(
        "La fenêtre n'a pas chargé www/index.html par `loadFile` : "
        + `chargements observés = ${JSON.stringify(espion.chargements)}. `
        + 'La suite de creerFenetre() (les gardes de navigation) est donc '
        + 'restée hors de portée de ce contrôle.');
} else {
    const ouvrir = espion.gestionnaireOuverture;
    if (typeof ouvrir !== 'function') {
        problemes.push(
            'Aucun `setWindowOpenHandler` posé : un lien externe pourrait ouvrir '
            + "une fenêtre dans l'application.");
    } else {
        const verdict = ouvrir({ url: 'https://exemple.invalide/page' });
        if (verdict?.action !== 'deny') {
            problemes.push(
                `setWindowOpenHandler rend ${JSON.stringify(verdict)} pour une URL `
                + "https : il doit rendre { action: 'deny' }.");
        }
        if (!espion.externes.includes('https://exemple.invalide/page')) {
            problemes.push(
                "Un lien https n'a pas été transmis au navigateur du système : "
                + 'refuser la fenêtre sans ouvrir le lien ailleurs rend le lien mort.');
        }
        // Un schéma non http ne doit PAS être passé à openExternal.
        espion.externes.length = 0;
        ouvrir({ url: 'file:///C:/Windows/System32/cmd.exe' });
        if (espion.externes.length !== 0) {
            problemes.push(
                'setWindowOpenHandler a passé une URL non-http à openExternal '
                + `(${JSON.stringify(espion.externes)}). Seuls http(s) doivent sortir.`);
        }
    }

    const surNavigation = espion.ecouteurs.get('will-navigate');
    if (typeof surNavigation !== 'function') {
        problemes.push(
            "Aucun écouteur `will-navigate` : rien n'empêche la fenêtre principale "
            + 'de quitter le paquet.');
    } else {
        let empeche = false;
        surNavigation({ preventDefault: () => { empeche = true; } }, 'https://exemple.invalide/');
        if (!empeche) {
            problemes.push(
                'will-navigate laisse passer une navigation https dans la fenêtre '
                + 'principale.');
        }
        let empecheLocal = false;
        surNavigation({ preventDefault: () => { empecheLocal = true; } }, 'file:///paquet/index.html');
        if (empecheLocal) {
            problemes.push(
                'will-navigate refuse une navigation `file://` — celle du paquet '
                + "lui-même. La garde serait alors plus stricte que l'application.");
        }
    }
    if (espion.gestionnaireOuverture && espion.ecouteurs.has('will-navigate')) {
        faits.push('gardes de navigation posées ET déclenchées (https refusé, file:// permis)');
    }
}

// ─── 4. L'auto-update est-il conditionné à la signature ? ─────────────────
if (espion.updaterBranche) {
    problemes.push(
        "L'auto-update s'est branché alors qu'aucun `app-update.yml` ne déclare "
        + 'de `publisherName` — donc sur un paquet non signé, dont '
        + 'electron-updater ne pourrait pas vérifier la signature. '
        + 'docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md : signature d\'abord, '
        + 'auto-update ensuite.');
} else {
    faits.push('auto-update refusé sur un paquet non signé');
}

// La branche inverse — paquet signé — dans un processus neuf : `main.js` a
// déjà été évalué ici, et un module ESM ne s'évalue qu'une fois.
const ressourcesSignees = mkdtempSync(join(tmpdir(), 'shell-signe-'));
writeFileSync(join(ressourcesSignees, 'app-update.yml'),
    'provider: github\nowner: nicoo-o\nrepo: SpaceHub\npublisherName:\n  - CN=SpaceHub\n');

const { spawnSync } = await import('node:child_process');
const sousProcessus = spawnSync(process.execPath, [
    fileURLToPath(new URL('./electron-shell-check-signe.mjs', import.meta.url)),
], {
    cwd: RACINE,
    env: { ...process.env, SPACEHUB_RESSOURCES_SIGNEES: ressourcesSignees },
    encoding: 'utf8',
});

if (sousProcessus.status !== 0) {
    problemes.push(
        "Sur un paquet SIGNÉ, l'auto-update ne s'est pas branché : "
        + (sousProcessus.stdout || '') + (sousProcessus.stderr || ''));
} else {
    faits.push('auto-update branché sur un paquet signé (la garde ne bloque pas tout)');
}

rmSync(ressourcesNonSignees, { recursive: true, force: true });
rmSync(ressourcesSignees, { recursive: true, force: true });
nettoyer();

// ─── Verdict ──────────────────────────────────────────────────────────────
for (const f of faits) console.log(`  ✓ ${f}`);

if (problemes.length) {
    console.error(`\nShell Electron : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error(`  ✖ ${p}`);
    process.exit(1);
}

console.log('\nShell Electron : évaluation complète, choix de sécurité vérifiés, '
    + 'gardes de navigation exercées.');
process.exit(0);
