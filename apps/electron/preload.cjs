/**
 * SpaceHub — pont préchargé (exécutable Windows)
 *
 * LE SEUL pont entre la page web et le processus principal. Une seule
 * fonction : transmettre la préférence « mises à jour automatiques » des
 * réglages au processus principal (qui la persiste et pilote
 * electron-updater). Sandboxé (sandbox: true dans main.js), aucun autre
 * privilège n'est exposé — la page n'a ni Node, ni ipcRenderer brut.
 *
 * Fichier .cjs : le paquet Electron est « type: module », or un preload
 * sandboxé s'exécute en CommonJS — l'extension impose le bon mode.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spacehubAutoUpdate', {
    definirActif: (actif) => ipcRenderer.send('auto-update:definir-actif', actif === true),
});