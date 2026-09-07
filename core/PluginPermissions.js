/**
 * SpaceHub — Plugin permissions
 *
 * Les permissions sont refusées par défaut. Ce module ne donne jamais accès au
 * token Jellyfin : il ne fait qu'autoriser des capacités exposées par l'hôte.
 */
'use strict';

const ADMIN_ONLY = new Set([
    'server.plugins.configure',
    'server.plugins.install',
    'server.plugins.update',
    'server.plugins.uninstall',
    'server.system.control',
    'jellyfin.metadata.write',
    'jellyfin.library.refresh'
]);

const KNOWN_PERMISSIONS = new Set([
    'ui.dashboard.read', 'ui.dashboard.write', 'ui.theme.register', 'ui.theme.apply',
    'ui.modal.open', 'jellyfin.items.read', 'jellyfin.metadata.read',
    'jellyfin.metadata.write', 'jellyfin.library.read', 'jellyfin.library.refresh',
    'server.plugins.read', 'server.plugins.configure', 'server.plugins.install',
    'server.plugins.update', 'server.plugins.uninstall', 'server.system.read',
    'server.system.control', 'network.external.read', 'settings.plugin.read',
    'settings.plugin.write'
]);

export class PluginPermissionError extends Error {
    constructor(pluginId, permission, reason = 'Permission refusée') {
        super(`${reason}: ${pluginId} → ${permission}`);
        this.name = 'PluginPermissionError';
        this.pluginId = pluginId;
        this.permission = permission;
    }
}

export class PluginPermissions {
    constructor({ settings = null, userProvider = null, policyProvider = null, eventBus = null } = {}) {
        this._settings = settings;
        this._userProvider = userProvider;
        this._policyProvider = policyProvider;
        this._eventBus = eventBus;
    }

    validate(requested = []) {
        if (!Array.isArray(requested)) return { valid: false, unknown: [], permissions: [] };
        const permissions = [...new Set(requested)].filter(Boolean);
        const unknown = permissions.filter(permission => !KNOWN_PERMISSIONS.has(permission));
        return { valid: unknown.length === 0, unknown, permissions };
    }

    isAdministrator() {
        return this._userProvider?.()?.Policy?.IsAdministrator === true;
    }

    getApproved(pluginId) {
        const configured = this._settings?.get(`plugins.${pluginId}.approvedPermissions`, []);
        return Array.isArray(configured) ? configured : [];
    }

    /**
     * Approuve un jeu de permissions pour un plugin.
     *
     * CE QUI ÉTAIT TROP LARGE. Toute approbation était réservée aux
     * administrateurs Jellyfin. C'est juste pour ce qui touche au SERVEUR —
     * installer un greffon, écrire des métadonnées, relancer une analyse de
     * médiathèque : ces actes engagent tout le monde, et `ADMIN_ONLY` les
     * énumère précisément pour cette raison.
     *
     * Mais la règle s'appliquait aussi aux permissions purement locales.
     * Conséquence concrète : le plugin de notes ne demande que
     * `network.external.read` et `jellyfin.metadata.read` — ni l'une ni
     * l'autre dans `ADMIN_ONLY` — et restait pourtant inactif sur tout compte
     * non-administrateur. L'écran de réglages proposait à ces utilisateurs de
     * saisir leur clé API OMDb, dans un champ dont la valeur n'aurait jamais
     * pu servir. On leur demandait un secret pour rien.
     *
     * La règle devient donc : l'approbation exige un administrateur
     * uniquement si le lot contient une permission `ADMIN_ONLY`. Le reste ne
     * concerne que ce navigateur et son propriétaire — les approbations sont
     * stockées dans ses réglages locaux, elles n'engagent personne d'autre.
     *
     * @param {string} pluginId
     * @param {string[]} permissions
     * @returns {string[]} Les permissions retenues.
     */
    setApproved(pluginId, permissions) {
        const result = this.validate(permissions);
        if (!result.valid) throw new PluginPermissionError(pluginId, result.unknown[0], 'Permission inconnue');

        const sensibles = result.permissions.filter(p => ADMIN_ONLY.has(p));
        if (sensibles.length > 0 && !this.isAdministrator()) {
            throw new PluginPermissionError(
                pluginId, sensibles[0],
                `Approbation réservée aux administrateurs Jellyfin : « ${sensibles[0]} » agit sur le serveur`);
        }
        this._settings?.set(`plugins.${pluginId}.approvedPermissions`, result.permissions);
        this._eventBus?.emit('plugin:permissions-changed', { pluginId, permissions: result.permissions });
        return result.permissions;
    }

    can(pluginId, permission, { requested = [], allowSafeDefaults = false } = {}) {
        if (!KNOWN_PERMISSIONS.has(permission)) return false;
        if (ADMIN_ONLY.has(permission) && !this.isAdministrator()) return false;
        const user = this._userProvider?.() || null;
        const policy = this._policyProvider?.();
        if (policy?.denies?.(pluginId, permission, user?.Id)) return false;
        if (policy?.can?.(pluginId, permission, user?.Id)) return true;
        const approved = this.getApproved(pluginId);
        if (approved.includes(permission)) return true;
        const safe = !ADMIN_ONLY.has(permission) && allowSafeDefaults && !requested.includes(permission);
        return safe;
    }

    assert(pluginId, permission, options = {}) {
        if (!this.can(pluginId, permission, options)) {
            throw new PluginPermissionError(pluginId, permission);
        }
        return true;
    }

    getPolicy(pluginId, requested = []) {
        const validation = this.validate(requested);
        return {
            ...validation,
            approved: this.getApproved(pluginId),
            administrator: this.isAdministrator(),
            denied: validation.permissions.filter(permission => !this.can(pluginId, permission, { requested }))
        };
    }
}

export { ADMIN_ONLY, KNOWN_PERMISSIONS };
export default PluginPermissions;
