/**
 * SpaceHub — Le shell Electron s'évalue-t-il vraiment ?
 * ====================================================
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
 * CE QUE CE CONTRÔLE PROUVE
 * -------------------------
 * Il importe le VRAI `main.js`, avec `electron` et `electron-updater`
 * remplacés par des doublures minimales (le motif du stub de loader déjà
 * employé pour le CSS dans `scripts/css-stub-loader.mjs`). Si le module
 * s'évalue de bout en bout, alors tout ce que son évaluation touche existe :
 * imports, constantes, fonctions, ordre de déclaration. Si un identifiant
 * libre manque — ou qu'un import disparaît en refactorant — l'évaluation
 * lève et ce contrôle tombe.
 *
 * CE QUE CE CONTRÔLE NE PROUVE PAS
 * --------------------------------
 * Il n'ouvre aucune fenêtre, ne rend aucune page et ne parle à aucun service.
 * Les doublures répondent à la place d'Electron : le contrat vérifié est
 * « le shell s'évalue », pas « le shell fonctionne ». La fumée de démarrage
 * du vrai binaire reste à faire à la main (ou sur un runner Windows).
 *
 *   node scripts/electron-shell-check.mjs
 */

import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = join(RACINE, 'apps', 'electron', 'main.js');

if (!existsSync(SHELL)) {
    console.error(`Shell Electron introuvable : ${SHELL}`);
    process.exit(1);
}

// ─── Les doublures ────────────────────────────────────────────────────────
//
// Elles n'existent que pour laisser l'évaluation aller au bout : chaque
// membre réellement touché par `main.js` doit exister ici, sans quoi le
// contrôle signalerait un faux défaut (manque dans la doublure, pas dans le
// shell). Les ajouter au fil des besoins fait partie du contrat : une
// nouvelle API Electron dans le shell doit être doublée ici pour que la
// garde continue de mesurer le shell et non l'écart entre les deux.
const DOUBLURE_ELECTRON = `
function fausseFenetre() {
    return {
        loadFile() {},
        loadURL() {},
        isMinimized: () => false,
        restore() {},
        focus() {},
        webContents: { setWindowOpenHandler() {}, on() {} },
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
    constructor() { return fausseFenetre(); }
    static getAllWindows() { return []; }
}

export const Menu = { setApplicationMenu() {} };
export const shell = { openExternal() {} };
export const ipcMain = { on() {} };
`;

const DOUBLURE_UPDATER = `
export const autoUpdater = {
    on() {},
    checkForUpdates: () => Promise.resolve(null),
};
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

// ─── L'évaluation ─────────────────────────────────────────────────────────
let defaut = null;

try {
    await import(new URL('../apps/electron/main.js', import.meta.url).href);
    // `brancherAutoUpdate()` charge `electron-updater` de façon dynamique et
    // planifie la première vérification : on laisse la microtâche se poser
    // pour que cette branche soit réellement traversée, elle aussi.
    await new Promise((resoudre) => setTimeout(resoudre, 100));
} catch (erreur) {
    defaut = erreur;
}

// Le shell planifie un contrôle des mises à jour à 6 h (avec jitter) : sans
// sortie explicite, la minuterie maintiendrait la boucle d'événements
// ouverte et la CI attendrait son expiration.
if (defaut) {
    console.error("Le shell Electron ne s'évalue pas :");
    console.error(defaut.stack || defaut.message);
    process.exit(1);
}

console.log('Shell Electron : évaluation complète, identifiants tous définis.');
process.exit(0);
