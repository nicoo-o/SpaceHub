/**
 * SpaceHub — la branche « paquet signé » du shell Electron
 * ========================================================
 *
 * POURQUOI UN SECOND FICHIER, ET UN SECOND PROCESSUS
 * --------------------------------------------------
 * `electron-shell-check.mjs` vérifie que l'auto-update REFUSE de se brancher
 * sur un paquet non signé. Une garde qui refuse tout serait tout aussi
 * conforme à ce test et tout aussi cassée : il faut donc exercer aussi la
 * branche qui accepte.
 *
 * Or `apps/electron/main.js` est un module ESM, et un module ESM ne
 * s'évalue qu'UNE FOIS par processus. Le premier import a déjà lu
 * `process.resourcesPath` et pris sa décision ; changer la variable après
 * coup ne rejouerait rien. D'où un processus neuf, lancé par le contrôle
 * principal, avec un `app-update.yml` qui déclare un `publisherName`.
 *
 * Ce fichier n'est pas destiné à être lancé à la main. Il attend
 * `SPACEHUB_RESSOURCES_SIGNEES` dans son environnement.
 */

import { registerHooks } from 'node:module';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ressources = process.env.SPACEHUB_RESSOURCES_SIGNEES;
if (!ressources || !existsSync(join(ressources, 'app-update.yml'))) {
    console.error('SPACEHUB_RESSOURCES_SIGNEES absent ou sans app-update.yml.');
    process.exit(1);
}
process.resourcesPath = ressources;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(RACINE, 'apps', 'electron', 'www');
const INDEX = join(WWW, 'index.html');

globalThis.__shellEspion = { updaterBranche: false };

const DOUBLURE_ELECTRON = `
export const app = {
    commandLine: { appendSwitch() {} },
    requestSingleInstanceLock: () => true,
    on() {},
    whenReady: () => Promise.resolve(),
    getPath: () => process.env.TEMP || process.env.TMPDIR || '/tmp',
    quit() {},
};
export class BrowserWindow {
    constructor() {
        return {
            loadFile() {}, loadURL() {}, isMinimized: () => false,
            restore() {}, focus() {},
            webContents: { setWindowOpenHandler() {}, on() {} },
        };
    }
    static getAllWindows() { return []; }
}
export const Menu = { setApplicationMenu() {} };
export const shell = { openExternal() {} };
export const ipcMain = { on() {} };
`;

const DOUBLURE_UPDATER = `
const espion = globalThis.__shellEspion;
export const autoUpdater = {
    on() {},
    checkForUpdates: () => Promise.resolve(null),
};
Object.defineProperty(autoUpdater, 'autoDownload', {
    set() { espion.updaterBranche = true; }, get() { return true; }, configurable: true,
});
`;

const enDataUrl = (s) => 'data:text/javascript,' + encodeURIComponent(s);

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'electron') return { url: enDataUrl(DOUBLURE_ELECTRON), shortCircuit: true };
        if (specifier === 'electron-updater') return { url: enDataUrl(DOUBLURE_UPDATER), shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

let wwwCree = false;
let indexCree = false;
if (!existsSync(INDEX)) {
    if (!existsSync(WWW)) { mkdirSync(WWW, { recursive: true }); wwwCree = true; }
    writeFileSync(INDEX, '<!doctype html><title>contrôle</title>\n');
    indexCree = true;
}

try {
    await import(new URL('../apps/electron/main.js', import.meta.url).href);
    await new Promise((r) => setTimeout(r, 150));
} catch (erreur) {
    console.error(erreur.stack || erreur.message);
    process.exit(1);
} finally {
    if (indexCree) rmSync(INDEX, { force: true });
    if (wwwCree) rmSync(WWW, { recursive: true, force: true });
}

if (!globalThis.__shellEspion.updaterBranche) {
    console.error(
        "Paquet signé (publisherName présent dans app-update.yml) et pourtant "
        + "l'auto-update ne s'est pas branché. La garde de signature refuse "
        + 'alors tout, y compris le cas pour lequel elle a été écrite.');
    process.exit(1);
}

process.exit(0);
