/**
 * SpaceHub — Electron Preload Script
 * Version: 1.0.0
 *
 * Script de preload pour exposer les APIs sécurisées au renderer process.
 * Utilise contextBridge pour une communication sécurisée.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Exposer les APIs sécurisées au renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Stockage sécurisé (keytar)
    secureStorage: {
        set: (key, value) => ipcRenderer.invoke('secure-storage:set', key, value),
        get: (key) => ipcRenderer.invoke('secure-storage:get', key),
        delete: (key) => ipcRenderer.invoke('secure-storage:delete', key),
        clear: () => ipcRenderer.invoke('secure-storage:clear')
    },

    // Informations système
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),

    // Contrôle fenêtre
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),

    // Mises à jour
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    installUpdate: () => ipcRenderer.send('install-update')
});

// Exposer un flag pour détecter l'environnement Electron
contextBridge.exposeInMainWorld('isElectron', true);
