/**
 * SpaceHub — User Management & Granular Policy Controller (Horizon 7++)
 * Version: 1.0.0
 *
 * Gestion des utilisateurs Jellyfin et des règles d'accès :
 * - Liste des utilisateurs avec statut de connexion et session en direct
 * - Actions administratives : Activer/Désactiver le transcodage 4K, limitation de débit max, verrouillage
 */

'use strict';

import Logger from '../../core/Logger.js';

class UserManagementController {
    constructor() {
        this._log = new Logger('UserManagementController');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère la liste des utilisateurs Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getUsers() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Users`, { headers: this._auth?.getAuthHeaders() });
            if (!res.ok) return [];
            return await res.json();
        } catch (err) {
            this._log.error('Erreur récupération utilisateurs:', err);
            return [];
        }
    }

    /**
     * Met à jour la configuration d'un utilisateur (transcodage 4K, débit, etc.).
     * @param {string} userId
     * @param {Object} policy
     */
    async updateUserPolicy(userId, policy) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Users/${userId}/Policy`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(policy)
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur mise à jour utilisateur ${userId}:`, err);
            return false;
        }
    }
}

export default UserManagementController;
