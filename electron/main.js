/**
 * SpaceHub — Electron Main Process
 * Version: 1.0.0
 *
 * Point d'entrée principal pour l'application Desktop Electron.
 * Gère la fenêtre, le stockage sécurisé (keytar), les raccourcis multimédias globaux,
 * le System Tray et Discord Rich Presence.
 */

const { app, BrowserWindow, ipcMain, protocol, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const keytar = require('keytar');

// Service de stockage sécurisé pour les clés API
class SecureStorage {
    constructor() {
        this.serviceName = 'SpaceHub';
    }

    async set(key, value) {
        await keytar.setPassword(this.serviceName, key, value);
    }

    async get(key) {
        return await keytar.getPassword(this.serviceName, key);
    }

    async delete(key) {
        await keytar.deletePassword(this.serviceName, key);
    }

    async clear() {
        const keys = await keytar.findPasswords(this.serviceName);
        for (const key of keys) {
            await keytar.deletePassword(this.serviceName, key);
        }
    }
}

let mainWindow = null;
let secureStorage = null;
let tray = null;
let rpcClient = null;

// Gestion instance unique
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true
        },
        icon: path.join(__dirname, '../logo.png'),
        title: 'SpaceHub',
        backgroundColor: '#101014'
    });

    // En développement, charger depuis le serveur Vite
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // En production, charger depuis le build
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, '../logo.png');
        tray = new Tray(iconPath);
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Ouvrir SpaceHub',
                click: () => {
                    mainWindow?.show();
                    mainWindow?.focus();
                }
            },
            { type: 'separator' },
            {
                label: 'Lecture / Pause',
                click: () => mainWindow?.webContents.send('media-command', 'toggle')
            },
            {
                label: 'Suivant',
                click: () => mainWindow?.webContents.send('media-command', 'next')
            },
            {
                label: 'Précédent',
                click: () => mainWindow?.webContents.send('media-command', 'prev')
            },
            { type: 'separator' },
            {
                label: 'Quitter',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('SpaceHub — Media Center');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
    } catch (err) {
        console.warn('[Tray] Erreur création System Tray:', err.message);
    }
}

function registerGlobalShortcuts() {
    // Touches multimédias physiques du clavier
    globalShortcut.register('MediaPlayPause', () => {
        mainWindow?.webContents.send('media-command', 'toggle');
    });

    globalShortcut.register('MediaNextTrack', () => {
        mainWindow?.webContents.send('media-command', 'next');
    });

    globalShortcut.register('MediaPreviousTrack', () => {
        mainWindow?.webContents.send('media-command', 'prev');
    });

    globalShortcut.register('MediaStop', () => {
        mainWindow?.webContents.send('media-command', 'stop');
    });
}

// ─── Discord Rich Presence ───────────────────────────────────────────────────

function initDiscordRPC() {
    try {
        const DiscordRPC = require('discord-rpc');
        const CLIENT_ID = '1200000000000000000'; // SpaceHub App ID
        DiscordRPC.register(CLIENT_ID);

        rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

        rpcClient.on('ready', () => {
            console.log('[Discord RPC] Connecté à Discord');
        });

        rpcClient.login({ clientId: CLIENT_ID }).catch(() => {
            console.log('[Discord RPC] Discord n\'est pas ouvert sur cette machine');
        });
    } catch (e) {
        console.log('[Discord RPC] Module discord-rpc optionnel');
    }
}

// IPC Handlers pour Discord Rich Presence
ipcMain.handle('discord:set-activity', async (event, activity) => {
    if (!rpcClient) return false;
    try {
        await rpcClient.setActivity({
            details: activity.details || 'Explore la médiathèque',
            state: activity.state || 'SpaceHub Media Center',
            startTimestamp: activity.startTimestamp || new Date(),
            largeImageKey: activity.largeImageKey || 'spacehub_logo',
            largeImageText: activity.largeImageText || 'SpaceHub',
            smallImageKey: activity.smallImageKey || 'play',
            smallImageText: activity.smallImageText || 'En lecture',
            instance: false
        });
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('discord:clear-activity', async () => {
    if (!rpcClient) return false;
    try {
        await rpcClient.clearActivity();
        return true;
    } catch {
        return false;
    }
});

// IPC Handlers pour le stockage sécurisé
ipcMain.handle('secure-storage:set', async (event, key, value) => {
    await secureStorage.set(key, value);
    return true;
});

ipcMain.handle('secure-storage:get', async (event, key) => {
    return await secureStorage.get(key);
});

ipcMain.handle('secure-storage:delete', async (event, key) => {
    await secureStorage.delete(key);
    return true;
});

ipcMain.handle('secure-storage:clear', async () => {
    await secureStorage.clear();
    return true;
});

// IPC Handlers pour les fonctionnalités natives
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.handle('close-window', () => mainWindow?.close());

// Protocole personnalisé
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'spacehub',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true
        }
    }
]);

app.whenReady().then(() => {
    secureStorage = new SecureStorage();
    createWindow();
    createTray();
    registerGlobalShortcuts();
    initDiscordRPC();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow?.show();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
