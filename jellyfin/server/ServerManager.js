/**
 * SpaceHub — Jellyfin Multi-Server Manager
 * Version: 1.0.0
 *
 * Gestionnaire multi-serveurs permettant de connecter et basculer entre
 * plusieurs instances Jellyfin (ex: Serveur Local, Serveur Famille, VPS).
 */

'use strict';

import Logger from '../../core/Logger.js';

const STORAGE_KEY = 'SpaceHub_servers_list';

class ServerManager {
    constructor(eventBus, authManager) {
        this._log = new Logger('ServerManager');
        this._eventBus = eventBus;
        this._auth = authManager;
        this._servers = this._loadServers();
        this._activeServerId = this._loadActiveServerId();

        this._log.info(`ServerManager initialisé avec ${this._servers.length} serveur(s).`);
    }

    _loadServers() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    _saveServers() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._servers));
        } catch (err) {
            this._log.error('Erreur sauvegarde liste serveurs:', err);
        }
    }

    _loadActiveServerId() {
        return localStorage.getItem('SpaceHub_active_server_id') || (this._servers[0]?.id || null);
    }

    _saveActiveServerId(id) {
        this._activeServerId = id;
        if (id) {
            localStorage.setItem('SpaceHub_active_server_id', id);
        } else {
            localStorage.removeItem('SpaceHub_active_server_id');
        }
    }

    /**
     * Retourne la liste de tous les serveurs enregistrés.
     * @returns {Array<Object>}
     */
    getServers() {
        return [...this._servers];
    }

    /**
     * Retourne le serveur actif.
     * @returns {Object|null}
     */
    getActiveServer() {
        return this._servers.find(s => s.id === this._activeServerId) || this._servers[0] || null;
    }

    /**
     * Enregistre un nouveau serveur.
     * @param {Object} serverInfo
     */
    addServer(serverInfo) {
        const id = serverInfo.id || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const cleanUrl = serverInfo.url.trim().replace(/\/$/, '');

        const existingIndex = this._servers.findIndex(s => s.url.toLowerCase() === cleanUrl.toLowerCase() && s.userId === serverInfo.userId);

        const newServer = {
            id,
            name: serverInfo.name || new URL(cleanUrl).hostname,
            url: cleanUrl,
            username: serverInfo.username,
            userId: serverInfo.userId,
            token: serverInfo.token,
            addedAt: new Date().toISOString(),
            isOnline: true
        };

        if (existingIndex >= 0) {
            this._servers[existingIndex] = { ...this._servers[existingIndex], ...newServer };
        } else {
            this._servers.push(newServer);
        }

        this._saveServers();

        if (!this._activeServerId || this._servers.length === 1) {
            this.switchServer(id);
        }

        this._eventBus?.emit('servers:changed', this._servers);
        this._log.info(`Serveur ajouté : ${newServer.name} (${cleanUrl})`);
        return newServer;
    }

    /**
     * Supprime un serveur de la liste.
     * @param {string} serverId
     */
    removeServer(serverId) {
        this._servers = this._servers.filter(s => s.id !== serverId);
        this._saveServers();

        if (this._activeServerId === serverId) {
            const nextServer = this._servers[0];
            if (nextServer) {
                this.switchServer(nextServer.id);
            } else {
                this._saveActiveServerId(null);
                this._auth?.logout();
            }
        }

        this._eventBus?.emit('servers:changed', this._servers);
        this._log.info(`Serveur supprimé : ${serverId}`);
    }

    /**
     * Bascule vers un serveur enregistré en mettant à jour la session active.
     * @param {string} serverId
     */
    async switchServer(serverId) {
        const target = this._servers.find(s => s.id === serverId);
        if (!target) {
            this._log.warn(`Serveur introuvable : ${serverId}`);
            return false;
        }

        this._log.info(`Bascule vers le serveur : "${target.name}" (${target.url})`);
        this._saveActiveServerId(target.id);

        // Mettre à jour l'AuthManager
        if (this._auth) {
            this._auth._saveAuth({
                ServerUrl: target.url,
                AccessToken: target.token,
                User: { Id: target.userId, Name: target.username }
            });
            this._auth._syncGlobalClient(target.url, target.token);
        }

        // Mettre à jour SettingsManager pour cet utilisateur
        window.SpaceHub?.core?.settings?.setUserId(target.userId);

        // Recharger les données du dashboard et des bibliothèques
        this._eventBus?.emit('server:switched', target);
        window.SpaceHub?.ui?.dashboard?.refreshAll();

        return true;
    }

    /**
     * Teste la connectivité d'un serveur.
     * @param {string} serverId
     * @returns {Promise<boolean>}
     */
    async pingServer(serverId) {
        const srv = this._servers.find(s => s.id === serverId);
        if (!srv) return false;

        try {
            const res = await fetch(`${srv.url}/System/Info/Public`, { method: 'GET', timeout: 5000 });
            const online = res.ok;
            srv.isOnline = online;
            this._saveServers();
            return online;
        } catch {
            srv.isOnline = false;
            this._saveServers();
            return false;
        }
    }

    /**
     * Teste la connectivité de tous les serveurs en tâche de fond.
     */
    async pingAll() {
        for (const s of this._servers) {
            await this.pingServer(s.id);
        }
        this._eventBus?.emit('servers:statusUpdated', this._servers);
    }
}

export default ServerManager;
