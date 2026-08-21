/**
 * SpaceHub — User Permissions
 * Version: 1.0.0
 *
 * Gestion des permissions par utilisateur Jellyfin.
 * Permet à l'administrateur de contrôler quels widgets/sections
 * sont visibles pour chaque utilisateur.
 */

'use strict';

import Logger from '../Logger.js';

class UserPermissions {
    constructor(eventBus, settings) {
        this._log = new Logger('UserPermissions');
        this._eventBus = eventBus;
        this._settings = settings;
        this._currentUser = null;
        this._isAdmin = false;

        this._registerDefaults();
        this._initListeners();
        this._log.info('User Permissions initialisé.');
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'permissions.defaultWidgets': ['continueWatching', 'latestAdditions', 'quickActions'],
            'permissions.defaultSections': ['home', 'libraries', 'downloads', 'calendar'],
            'permissions.adminOnlySections': ['management', 'extensions'],
            'permissions.adminOnlyWidgets': ['sonarrQueue', 'radarrQueue', 'qbittorrent']
        });
    }

    _initListeners() {
        this._eventBus.on('auth:login', (user) => this._onUserLogin(user));
        this._eventBus.on('auth:logout', () => this._onUserLogout());
    }

    /**
     * Appelé lors de la connexion d'un utilisateur.
     * @private
     */
    _onUserLogin(user) {
        this._currentUser = user;
        this._isAdmin = this._checkIsAdmin(user);
        this._log.info(`Utilisateur connecté: ${user.Name} (Admin: ${this._isAdmin})`);
    }

    /**
     * Appelé lors de la déconnexion.
     * @private
     */
    _onUserLogout() {
        this._currentUser = null;
        this._isAdmin = false;
    }

    /**
     * Vérifie si l'utilisateur est administrateur.
     * @private
     */
    _checkIsAdmin(user) {
        // Vérifier via les politiques Jellyfin ou un réglage SpaceHub
        const policy = user?.Policy;
        if (policy?.IsAdministrator) return true;
        
        // Fallback: réglage manuel SpaceHub
        const adminUsers = this._settings.get('permissions.adminUsers', []);
        return adminUsers.includes(user?.Id);
    }

    /**
     * Définit les widgets autorisés pour un utilisateur.
     * @param {string} userId
     * @param {Array<string>} widgets
     */
    setUserWidgets(userId, widgets) {
        this._settings.set(`permissions.users.${userId}.widgets`, widgets);
    }

    /**
     * Définit les sections autorisées pour un utilisateur.
     * @param {string} userId
     * @param {Array<string>} sections
     */
    setUserSections(userId, sections) {
        this._settings.set(`permissions.users.${userId}.sections`, sections);
    }

    /**
     * Récupère les widgets autorisés pour l'utilisateur actuel.
     * @returns {Array<string>}
     */
    getAllowedWidgets() {
        if (!this._currentUser) return this._settings.get('permissions.defaultWidgets', []);

        const userId = this._currentUser.Id;
        const userWidgets = this._settings.get(`permissions.users.${userId}.widgets`);

        if (userWidgets) {
            return userWidgets;
        }

        // Si pas de config spécifique, utiliser les défauts
        // Mais filtrer les widgets admin-only si pas admin
        const defaults = this._settings.get('permissions.defaultWidgets', []);
        const adminOnly = this._settings.get('permissions.adminOnlyWidgets', []);

        if (this._isAdmin) {
            return defaults;
        }

        return defaults.filter(w => !adminOnly.includes(w));
    }

    /**
     * Récupère les sections autorisées pour l'utilisateur actuel.
     * @returns {Array<string>}
     */
    getAllowedSections() {
        if (!this._currentUser) return this._settings.get('permissions.defaultSections', []);

        const userId = this._currentUser.Id;
        const userSections = this._settings.get(`permissions.users.${userId}.sections`);

        if (userSections) {
            return userSections;
        }

        // Si pas de config spécifique, utiliser les défauts
        const defaults = this._settings.get('permissions.defaultSections', []);
        const adminOnly = this._settings.get('permissions.adminOnlySections', []);

        if (this._isAdmin) {
            return defaults;
        }

        return defaults.filter(s => !adminOnly.includes(s));
    }

    /**
     * Vérifie si un widget est autorisé.
     * @param {string} widgetId
     * @returns {boolean}
     */
    isWidgetAllowed(widgetId) {
        return this.getAllowedWidgets().includes(widgetId);
    }

    /**
     * Vérifie si une section est autorisée.
     * @param {string} sectionId
     * @returns {boolean}
     */
    isSectionAllowed(sectionId) {
        return this.getAllowedSections().includes(sectionId);
    }

    /**
     * Définit la liste des utilisateurs administrateurs (override).
     * @param {Array<string>} userIds
     */
    setAdminUsers(userIds) {
        this._settings.set('permissions.adminUsers', userIds);
    }

    /**
     * Récupère la configuration de permissions pour tous les utilisateurs.
     * @returns {Object}
     */
    getAllUsersPermissions() {
        const allSettings = this._settings.get('permissions.users', {});
        return allSettings;
    }

    /**
     * Réinitialise les permissions d'un utilisateur aux valeurs par défaut.
     * @param {string} userId
     */
    resetUserPermissions(userId) {
        this._settings.delete(`permissions.users.${userId}`);
    }

    /**
     * Crée un profil de permissions (template).
     * @param {string} profileName
     * @param {Object} config
     */
    createPermissionProfile(profileName, config) {
        this._settings.set(`permissions.profiles.${profileName}`, config);
    }

    /**
     * Applique un profil à un utilisateur.
     * @param {string} userId
     * @param {string} profileName
     */
    applyProfileToUser(userId, profileName) {
        const profile = this._settings.get(`permissions.profiles.${profileName}`);
        if (profile) {
            if (profile.widgets) this.setUserWidgets(userId, profile.widgets);
            if (profile.sections) this.setUserSections(userId, profile.sections);
        }
    }

    /**
     * Récupère tous les profils disponibles.
     * @returns {Array<Object>}
     */
    getPermissionProfiles() {
        const profiles = this._settings.get('permissions.profiles', {});
        return Object.entries(profiles).map(([name, config]) => ({ name, ...config }));
    }
}

export default UserPermissions;
