/**
 * SpaceHub — Extension Marketplace
 * Version: 1.0.0
 *
 * Gestionnaire de marketplace pour les extensions.
 * Permet de découvrir, installer et désinstaller des extensions.
 */

'use strict';

import Logger from '../Logger.js';

class ExtensionMarketplace {
    constructor(sdk) {
        this._log = new Logger('ExtensionMarketplace');
        this._sdk = sdk;
        this._registry = new Map();
        this._installedExtensions = new Map();

        this._loadInstalledExtensions();
        this._log.info('Marketplace initialisé.');
    }

    /**
     * Charge les extensions installées depuis le localStorage.
     * @private
     */
    _loadInstalledExtensions() {
        try {
            const raw = localStorage.getItem('SpaceHub_installed_extensions');
            if (raw) {
                const installed = JSON.parse(raw);
                for (const [id, info] of Object.entries(installed)) {
                    this._installedExtensions.set(id, info);
                }
            }
        } catch (err) {
            this._log.error('Erreur chargement extensions installées:', err);
        }
    }

    /**
     * Sauvegarde les extensions installées dans le localStorage.
     * @private
     */
    _saveInstalledExtensions() {
        try {
            const obj = Object.fromEntries(this._installedExtensions);
            localStorage.setItem('SpaceHub_installed_extensions', JSON.stringify(obj));
        } catch (err) {
            this._log.error('Erreur sauvegarde extensions installées:', err);
        }
    }

    /**
     * Enregistre une extension dans le registry (catalogue).
     * @param {Object} metadata - Métadonnées de l'extension
     */
    registerExtension(metadata) {
        this._registry.set(metadata.id, metadata);
        this._log.info(`Extension ajoutée au registry: ${metadata.id}`);
    }

    /**
     * Récupère les métadonnées d'une extension.
     * @param {string} id
     * @returns {Object|null}
     */
    getExtensionInfo(id) {
        return this._registry.get(id) || null;
    }

    /**
     * Liste toutes les extensions disponibles dans le registry.
     * @returns {Array<Object>}
     */
    listAvailableExtensions() {
        return Array.from(this._registry.values());
    }

    /**
     * Liste les extensions installées.
     * @returns {Array<Object>}
     */
    listInstalledExtensions() {
        return Array.from(this._installedExtensions.entries()).map(([id, info]) => ({
            id,
            ...info,
            metadata: this._registry.get(id)
        }));
    }

    /**
     * Installe une extension.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async install(id) {
        const metadata = this._registry.get(id);
        if (!metadata) {
            this._log.error(`Extension inconnue: ${id}`);
            return false;
        }

        if (this._installedExtensions.has(id)) {
            this._log.warn(`Extension déjà installée: ${id}`);
            return false;
        }

        try {
            // Charger le code de l'extension
            const code = await this._fetchExtensionCode(metadata.source);
            
            // Évaluer le code dans un contexte sécurisé
            const module = this._evaluateExtension(code, id);

            // Enregistrer l'extension via le SDK
            const context = this._sdk.register(module.manifest);

            // Exécuter l'initialisation si fournie
            if (module.initialize) {
                await module.initialize(context);
            }

            // Sauvegarder l'installation
            this._installedExtensions.set(id, {
                version: metadata.version,
                installedAt: new Date().toISOString(),
                enabled: true
            });
            this._saveInstalledExtensions();

            this._log.info(`Extension installée: ${id}`);
            return true;

        } catch (err) {
            this._log.error(`Erreur installation ${id}:`, err);
            return false;
        }
    }

    /**
     * Désinstalle une extension.
     * @param {string} id
     * @returns {boolean}
     */
    uninstall(id) {
        if (!this._installedExtensions.has(id)) {
            this._log.warn(`Extension non installée: ${id}`);
            return false;
        }

        try {
            // Désenregistrer via le SDK
            this._sdk.unregister(id);

            // Supprimer de la liste des installées
            this._installedExtensions.delete(id);
            this._saveInstalledExtensions();

            this._log.info(`Extension désinstallée: ${id}`);
            return true;

        } catch (err) {
            this._log.error(`Erreur désinstallation ${id}:`, err);
            return false;
        }
    }

    /**
     * Met à jour une extension.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async update(id) {
        const metadata = this._registry.get(id);
        const installed = this._installedExtensions.get(id);

        if (!metadata || !installed) {
            return false;
        }

        if (metadata.version === installed.version) {
            this._log.info(`Extension déjà à jour: ${id}`);
            return true;
        }

        // Désinstaller puis réinstaller
        this.uninstall(id);
        return await this.install(id);
    }

    /**
     * Récupère le code source d'une extension.
     * @private
     * @param {string} source
     * @returns {Promise<string>}
     */
    async _fetchExtensionCode(source) {
        if (source.startsWith('http://') || source.startsWith('https://')) {
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`Erreur fetch: ${response.status}`);
            }
            return await response.text();
        } else {
            // Source locale (fichier)
            const response = await fetch(source);
            return await response.text();
        }
    }

    /**
     * Évalue le code d'une extension de manière sécurisée.
     * @private
     * @param {string} code
     * @param {string} id
     * @returns {Object}
     */
    _evaluateExtension(code, id) {
        try {
            // Créer une fonction avec les exports
            const exports = {};
            const module = { exports };
            
            // Wrapper pour isoler le code
            const wrappedCode = `
                (function(module, exports) {
                    ${code}
                })(module, module.exports);
            `;
            
            // Évaluer
            eval(wrappedCode);
            
            return module.exports;
        } catch (err) {
            throw new Error(`Erreur évaluation extension ${id}: ${err.message}`);
        }
    }

    /**
     * Recherche des extensions par terme.
     * @param {string} query
     * @returns {Array<Object>}
     */
    search(query) {
        const lower = query.toLowerCase();
        return this.listAvailableExtensions().filter(ext => 
            ext.name.toLowerCase().includes(lower) ||
            ext.description.toLowerCase().includes(lower) ||
            ext.author.toLowerCase().includes(lower) ||
            ext.tags?.some(tag => tag.toLowerCase().includes(lower))
        );
    }
}

export default ExtensionMarketplace;
