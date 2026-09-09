/**
 * SpaceHub — processus principal Electron (Windows)
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * L'application est un site statique autonome (dist/). L'exécutable Windows
 * est une coquille minimale autour de CE MÊME build : une fenêtre Chromium
 * dédiée qui charge www/index.html, rien de plus. Ce fichier est
 * volontairement court — toute logique d'application ici créerait une
 * deuxième source de vérité avec le build web, et une surface d'attaque
 * doublée.
 *
 * Les choix de sécurité suivent la recommandation Electron pour une
 * application qui ne charge que du contenu local :
 *   • contextIsolation (défaut, réaffirmé) et nodeIntegration désactivé —
 *     la page n'a aucun accès à Node ;
 *   • pas de remote module ;
 *   • le menu par défaut est retiré (F11 plein écran reste disponible) ;
 *   • toute navigation hors fichier local est refusée — l'application
 *     n'a pas de raison d'ouvrir un site dans la fenêtre, et les liens
 *     externes ne doivent jamais naviguer le shell.
 */

import { app, BrowserWindow, Menu, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const RACINE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(RACINE, 'www', 'index.html');

// Empêche le cache V8 partagé d'échouer sur des chemins avec espaces
// (C:\Users\…\Desktop\projet perso code\) — comportement observé, bénin.
app.commandLine.appendSwitch('disable-http-cache');

let fenetre = null;

function creerFenetre() {
    fenetre = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#101014',
        autoHideMenuBar: true,
        icon: join(RACINE, 'icon.ico'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            sandbox: true,
            spellcheck: false,
        },
    });

    // Aucun menu applicatif — l'application web gère toute la navigation.
    Menu.setApplicationMenu(null);

    if (!existsSync(INDEX)) {
        // Ne doit jamais arriver : le paquet embarque www/. Message clair
        // plutôt qu'une fenêtre blanche muette si l'assemblage a dévié.
        fenetre.loadURL('data:text/html,' + encodeURIComponent(
            '<body style="background:#101014;color:#f0f0f8;font-family:sans-serif;display:grid;place-items:center;height:92vh">' +
            '<div><h1>SpaceHub</h1><p>www/index.html introuvable dans le paquet.</p></div></body>'));
        return;
    }

    fenetre.loadFile(INDEX);

    // Les liens externes (documentation, GitHub…) vont au navigateur réel,
    // jamais dans la fenêtre de l'application.
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    // Filet : refuse toute navigation principale qui quitterait le paquet.
    fenetre.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) event.preventDefault();
    });
}

const verrou = app.requestSingleInstanceLock();
if (!verrou) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (fenetre) {
            if (fenetre.isMinimized()) fenetre.restore();
            fenetre.focus();
        }
    });

    app.whenReady().then(creerFenetre);

    // Windows : fermer toutes les fenêtres quitte l'application.
    app.on('window-all-closed', () => app.quit());

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
    });
}
