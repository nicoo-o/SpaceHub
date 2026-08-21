/**
 * SpaceHub — Electron Main Process
 * Version: 1.0.0
 *
 * Point d'entrée principal pour l'application Desktop Electron.
 * Gère la fenêtre, le stockage sécurisé et les intégrations natives.
 */

const { app, BrowserWindow, ipcMain, protocol } = require('electron');
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

let mainWindow;
let secureStorage;

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
        backgroundColor: '#1a1a1a'
    });

    // En développement, charger depuis le serveur Vite
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // En production, charger depuis le build
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

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
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-platform', () => {
    return process.platform;
});

ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize();
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

ipcMain.handle('close-window', () => {
    mainWindow?.close();
});

// Protocole personnalisé pour les ressources locales
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

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Gestion des mises à jour (auto-updater)
const { autoUpdater } = require('electron-updater');

autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://updates.spacehub.app/releases'
});

autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});
