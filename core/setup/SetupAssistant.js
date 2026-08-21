/**
 * SpaceHub — Setup Assistant
 * Version: 1.0.0
 *
 * Assistant de configuration initial avec auto-découverte réseau.
 * Guide l'utilisateur à travers la configuration de SpaceHub et détecte
 * automatiquement les services *arr sur le réseau local.
 */

'use strict';

import Logger from '../Logger.js';

class SetupAssistant {
    constructor(eventBus, settings) {
        this._log = new Logger('SetupAssistant');
        this._eventBus = eventBus;
        this._settings = settings;
        this._currentStep = 0;
        this._steps = [
            'welcome',
            'jellyfin',
            'discover',
            'integrations',
            'complete'
        ];
        this._discoveredServices = new Map();
        this._log.info('Setup Assistant initialisé.');
    }

    /**
     * Démarre l'assistant.
     * @param {HTMLElement} container
     */
    start(container) {
        this._container = container;
        this._currentStep = 0;
        this._renderStep();
    }

    /**
     * Passe à l'étape suivante.
     */
    nextStep() {
        if (this._currentStep < this._steps.length - 1) {
            this._currentStep++;
            this._renderStep();
        }
    }

    /**
     * Revient à l'étape précédente.
     */
    prevStep() {
        if (this._currentStep > 0) {
            this._currentStep--;
            this._renderStep();
        }
    }

    /**
     * Rend l'étape actuelle.
     * @private
     */
    _renderStep() {
        const stepName = this._steps[this._currentStep];
        this._container.innerHTML = `
            <div class="sh-setup-assistant">
                <div class="sh-setup-progress">
                    ${this._steps.map((step, i) => `
                        <div class="sh-setup-step ${i === this._currentStep ? 'active' : ''} ${i < this._currentStep ? 'completed' : ''}">
                            <div class="sh-setup-step__number">${i + 1}</div>
                            <div class="sh-setup-step__label">${this._getStepLabel(step)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="sh-setup-content" id="sh-setup-content"></div>
                <div class="sh-setup-footer">
                    ${this._currentStep > 0 ? '<button class="sh-btn sh-btn--secondary" id="sh-setup-prev">← Précédent</button>' : ''}
                    ${this._currentStep < this._steps.length - 1 ? '<button class="sh-btn sh-btn--primary" id="sh-setup-next">Suivant →</button>' : ''}
                </div>
            </div>
        `;

        this._renderStepContent(stepName);
        this._bindStepEvents();
    }

    /**
     * Rend le contenu de l'étape.
     * @private
     */
    _renderStepContent(stepName) {
        const content = document.getElementById('sh-setup-content');
        
        switch (stepName) {
            case 'welcome':
                content.innerHTML = `
                    <div class="sh-setup-welcome">
                        <h2>🚀 Bienvenue dans SpaceHub</h2>
                        <p>SpaceHub est votre dashboard unifié pour Jellyfin et vos services *arr.</p>
                        <p>Cet assistant va vous guider à travers la configuration initiale.</p>
                        <div class="sh-setup-features">
                            <div class="sh-setup-feature">
                                <span class="sh-setup-feature__icon">📺</span>
                                <span>Jellyfin</span>
                            </div>
                            <div class="sh-setup-feature">
                                <span class="sh-setup-feature__icon">🎬</span>
                                <span>Sonarr/Radarr</span>
                            </div>
                            <div class="sh-setup-feature">
                                <span class="sh-setup-feature__icon">📥</span>
                                <span>qBittorrent</span>
                            </div>
                            <div class="sh-setup-feature">
                                <span class="sh-setup-feature__icon">📸</span>
                                <span>Immich</span>
                            </div>
                        </div>
                    </div>
                `;
                break;

            case 'jellyfin':
                content.innerHTML = `
                    <div class="sh-setup-jellyfin">
                        <h2>📺 Configuration Jellyfin</h2>
                        <p>Connectez-vous à votre serveur Jellyfin.</p>
                        <div class="sh-form-group">
                            <label class="sh-form-label">URL du serveur</label>
                            <input type="url" class="sh-form-input" id="sh-jellyfin-url" placeholder="http://localhost:8096" value="http://localhost:8096">
                        </div>
                        <div class="sh-form-group">
                            <label class="sh-form-label">Nom d'utilisateur</label>
                            <input type="text" class="sh-form-input" id="sh-jellyfin-username" placeholder="Votre nom d'utilisateur">
                        </div>
                        <div class="sh-form-group">
                            <label class="sh-form-label">Mot de passe</label>
                            <input type="password" class="sh-form-input" id="sh-jellyfin-password" placeholder="Votre mot de passe">
                        </div>
                        <button class="sh-btn sh-btn--primary" id="sh-jellyfin-connect">Se connecter</button>
                        <div id="sh-jellyfin-status" class="sh-setup-status"></div>
                    </div>
                `;
                this._bindJellyfinEvents();
                break;

            case 'discover':
                content.innerHTML = `
                    <div class="sh-setup-discover">
                        <h2>🔍 Auto-découverte des services</h2>
                        <p>SpaceHub va scanner votre réseau local pour détecter automatiquement les services *arr.</p>
                        <button class="sh-btn sh-btn--primary" id="sh-discover-start">Lancer la découverte</button>
                        <div id="sh-discover-results" class="sh-discover-results"></div>
                    </div>
                `;
                this._bindDiscoverEvents();
                break;

            case 'integrations':
                content.innerHTML = `
                    <div class="sh-setup-integrations">
                        <h2>⚙️ Configuration des intégrations</h2>
                        <p>Configurez les services détectés (ou ajoutez-en manuellement).</p>
                        <div id="sh-integrations-list" class="sh-integrations-list"></div>
                    </div>
                `;
                this._renderIntegrationsList();
                break;

            case 'complete':
                content.innerHTML = `
                    <div class="sh-setup-complete">
                        <h2>✅ Configuration terminée !</h2>
                        <p>SpaceHub est maintenant configuré et prêt à l'emploi.</p>
                        <div class="sh-setup-summary">
                            <h3>Résumé de la configuration</h3>
                            <ul id="sh-setup-summary-list"></ul>
                        </div>
                        <button class="sh-btn sh-btn--primary sh-btn--large" id="sh-setup-finish">Accéder à SpaceHub</button>
                    </div>
                `;
                this._renderSummary();
                break;
        }
    }

    /**
     * Lie les événements de navigation.
     * @private
     */
    _bindStepEvents() {
        const prevBtn = document.getElementById('sh-setup-prev');
        const nextBtn = document.getElementById('sh-setup-next');
        const finishBtn = document.getElementById('sh-setup-finish');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevStep());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextStep());
        }

        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                this._settings.set('setup.completed', true);
                this._eventBus.emit('setup:completed');
            });
        }
    }

    /**
     * Lie les événements de connexion Jellyfin.
     * @private
     */
    _bindJellyfinEvents() {
        const connectBtn = document.getElementById('sh-jellyfin-connect');
        const statusDiv = document.getElementById('sh-jellyfin-status');

        connectBtn.addEventListener('click', async () => {
            const url = document.getElementById('sh-jellyfin-url').value;
            const username = document.getElementById('sh-jellyfin-username').value;
            const password = document.getElementById('sh-jellyfin-password').value;

            statusDiv.innerHTML = '<div class="sh-loader">Connexion en cours...</div>';

            try {
                // Simulation de connexion (à remplacer par vraie logique AuthManager)
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                this._settings.set('jellyfin.url', url);
                this._settings.set('jellyfin.username', username);
                
                statusDiv.innerHTML = '<div class="sh-status sh-status--success">✅ Connexion réussie !</div>';
                connectBtn.disabled = true;
                connectBtn.textContent = 'Connecté';

            } catch (err) {
                statusDiv.innerHTML = `<div class="sh-status sh-status--error">❌ Erreur de connexion : ${err.message}</div>`;
            }
        });
    }

    /**
     * Lie les événements de découverte.
     * @private
     */
    _bindDiscoverEvents() {
        const startBtn = document.getElementById('sh-discover-start');
        const resultsDiv = document.getElementById('sh-discover-results');

        startBtn.addEventListener('click', async () => {
            startBtn.disabled = true;
            startBtn.textContent = 'Recherche en cours...';
            resultsDiv.innerHTML = '<div class="sh-loader">Scan du réseau...</div>';

            try {
                await this._discoverServices();
                this._renderDiscoverResults();
            } catch (err) {
                resultsDiv.innerHTML = `<div class="sh-status sh-status--error">Erreur lors de la découverte : ${err.message}</div>`;
            }

            startBtn.disabled = false;
            startBtn.textContent = 'Relancer la découverte';
        });
    }

    /**
     * Découvre les services sur le réseau local.
     * @private
     */
    async _discoverServices() {
        this._discoveredServices.clear();

        // Ports par défaut des services *arr
        const services = [
            { name: 'Sonarr', port: 8989, path: '/api/v3/system/status', settingKey: 'sonarr' },
            { name: 'Radarr', port: 7878, path: '/api/v3/system/status', settingKey: 'radarr' },
            { name: 'Prowlarr', port: 9696, path: '/api/v1/system/status', settingKey: 'prowlarr' },
            { name: 'Bazarr', port: 6767, path: '/api/system/status', settingKey: 'bazarr' },
            { name: 'Jellyseerr', port: 5055, path: '/api/v1/status', settingKey: 'jellyseerr' },
            { name: 'qBittorrent', port: 8080, path: '/api/v2/app/version', settingKey: 'qbittorrent' },
            { name: 'Lidarr', port: 8686, path: '/api/v1/system/status', settingKey: 'lidarr' },
            { name: 'Immich', port: 2283, path: '/api/server-info/ping', settingKey: 'immich' }
        ];

        // Scanner localhost et les IPs locales courantes
        const hosts = ['localhost', '127.0.0.1'];
        
        for (const service of services) {
            for (const host of hosts) {
                try {
                    const url = `http://${host}:${service.port}${service.path}`;
                    const response = await fetch(url, { 
                        method: 'GET',
                        signal: AbortSignal.timeout(2000)
                    });
                    
                    if (response.ok) {
                        this._discoveredServices.set(service.settingKey, {
                            name: service.name,
                            url: `http://${host}:${service.port}`,
                            discovered: true
                        });
                        break; // Trouvé, passer au service suivant
                    }
                } catch (err) {
                    // Service non trouvé sur cet host, continuer
                }
            }
        }

        this._log.info(`Découverte terminée: ${this._discoveredServices.size} services trouvés`);
    }

    /**
     * Rend les résultats de la découverte.
     * @private
     */
    _renderDiscoverResults() {
        const resultsDiv = document.getElementById('sh-discover-results');
        
        if (this._discoveredServices.size === 0) {
            resultsDiv.innerHTML = '<div class="sh-no-data">Aucun service détecté automatiquement. Vous pourrez les configurer manuellement à l\'étape suivante.</div>';
            return;
        }

        resultsDiv.innerHTML = `
            <div class="sh-discovered-services">
                <h3>Services détectés :</h3>
                ${Array.from(this._discoveredServices.entries()).map(([key, service]) => `
                    <div class="sh-discovered-service">
                        <span class="sh-discovered-service__name">${service.name}</span>
                        <span class="sh-discovered-service__url">${service.url}</span>
                        <span class="sh-discovered-service__status">✅ Détecté</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Rend la liste des intégrations à configurer.
     * @private
     */
    _renderIntegrationsList() {
        const listDiv = document.getElementById('sh-integrations-list');
        
        const integrations = [
            { key: 'sonarr', name: 'Sonarr', icon: '📺' },
            { key: 'radarr', name: 'Radarr', icon: '🎬' },
            { key: 'prowlarr', name: 'Prowlarr', icon: '🔍' },
            { key: 'bazarr', name: 'Bazarr', icon: '📝' },
            { key: 'jellyseerr', name: 'Jellyseerr', icon: '🎟️' },
            { key: 'qbittorrent', name: 'qBittorrent', icon: '📥' },
            { key: 'lidarr', name: 'Lidarr', icon: '🎵' },
            { key: 'immich', name: 'Immich', icon: '📸' }
        ];

        listDiv.innerHTML = integrations.map(integration => {
            const discovered = this._discoveredServices.get(integration.key);
            const defaultUrl = discovered?.url || '';
            
            return `
                <div class="sh-integration-item">
                    <div class="sh-integration-item__header">
                        <span class="sh-integration-item__icon">${integration.icon}</span>
                        <span class="sh-integration-item__name">${integration.name}</span>
                        ${discovered ? '<span class="sh-integration-item__badge">Auto-détecté</span>' : ''}
                    </div>
                    <div class="sh-form-group">
                        <label class="sh-form-label">URL</label>
                        <input type="url" class="sh-form-input" data-key="${integration.key}.url" value="${defaultUrl}" placeholder="http://localhost:${this._getDefaultPort(integration.key)}">
                    </div>
                    <div class="sh-form-group">
                        <label class="sh-form-label">API Key</label>
                        <input type="password" class="sh-form-input" data-key="${integration.key}.apiKey" placeholder="Clé API">
                    </div>
                </div>
            `;
        }).join('');

        // Sauvegarder automatiquement lors de la saisie
        listDiv.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                const value = e.target.value;
                this._settings.set(key, value);
            });
        });
    }

    /**
     * Retourne le port par défaut d'un service.
     * @private
     */
    _getDefaultPort(key) {
        const ports = {
            sonarr: 8989,
            radarr: 7878,
            prowlarr: 9696,
            bazarr: 6767,
            jellyseerr: 5055,
            qbittorrent: 8080,
            lidarr: 8686,
            immich: 2283
        };
        return ports[key] || 80;
    }

    /**
     * Rend le résumé de la configuration.
     * @private
     */
    _renderSummary() {
        const summaryList = document.getElementById('sh-setup-summary-list');
        
        const items = [
            { label: 'Serveur Jellyfin', value: this._settings.get('jellyfin.url', 'Non configuré') },
            { label: 'Utilisateur Jellyfin', value: this._settings.get('jellyfin.username', 'Non configuré') },
            { label: 'Intégrations configurées', value: this._countConfiguredIntegrations() }
        ];

        summaryList.innerHTML = items.map(item => `
            <li><strong>${item.label}:</strong> ${item.value}</li>
        `).join('');
    }

    /**
     * Compte les intégrations configurées.
     * @private
     */
    _countConfiguredIntegrations() {
        const integrations = ['sonarr', 'radarr', 'prowlarr', 'bazarr', 'jellyseerr', 'qbittorrent', 'lidarr', 'immich'];
        let count = 0;
        
        for (const key of integrations) {
            if (this._settings.get(`${key}.url`) && this._settings.get(`${key}.apiKey`)) {
                count++;
            }
        }
        
        return `${count} / ${integrations.length}`;
    }

    /**
     * Retourne le label d'une étape.
     * @private
     */
    _getStepLabel(step) {
        const labels = {
            welcome: 'Bienvenue',
            jellyfin: 'Jellyfin',
            discover: 'Découverte',
            integrations: 'Intégrations',
            complete: 'Terminé'
        };
        return labels[step] || step;
    }

    _injectStyles() {
        if (document.getElementById('sh-setup-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-setup-styles';
        style.textContent = `
.sh-setup-assistant {
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
}

.sh-setup-progress {
    display: flex;
    justify-content: space-between;
    margin-bottom: 32px;
    position: relative;
}

.sh-setup-progress::before {
    content: '';
    position: absolute;
    top: 20px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--sh-border-color);
    z-index: 0;
}

.sh-setup-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 1;
    position: relative;
}

.sh-setup-step__number {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--sh-bg-surface-2);
    border: 2px solid var(--sh-border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    margin-bottom: 8px;
    transition: all 0.3s;
}

.sh-setup-step.active .sh-setup-step__number {
    background: var(--sh-color-primary);
    border-color: var(--sh-color-primary);
    color: white;
}

.sh-setup-step.completed .sh-setup-step__number {
    background: var(--sh-color-success);
    border-color: var(--sh-color-success);
    color: white;
}

.sh-setup-step__label {
    font-size: 12px;
    color: var(--sh-text-muted);
}

.sh-setup-content {
    background: var(--sh-bg-surface-1);
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
    min-height: 300px;
}

.sh-setup-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}

.sh-setup-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-top: 24px;
}

.sh-setup-feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    background: var(--sh-bg-surface-2);
    border-radius: 8px;
}

.sh-setup-feature__icon {
    font-size: 32px;
    margin-bottom: 8px;
}

.sh-setup-status {
    margin-top: 16px;
}

.sh-discover-results {
    margin-top: 24px;
}

.sh-discovered-services {
    background: var(--sh-bg-surface-2);
    border-radius: 8px;
    padding: 16px;
}

.sh-discovered-service {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--sh-border-color);
}

.sh-discovered-service:last-child {
    border-bottom: none;
}

.sh-discovered-service__name {
    font-weight: 600;
}

.sh-discovered-service__url {
    color: var(--sh-text-muted);
    font-family: monospace;
}

.sh-discovered-service__status {
    margin-left: auto;
    color: var(--sh-color-success);
}

.sh-integrations-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sh-integration-item {
    background: var(--sh-bg-surface-2);
    border-radius: 8px;
    padding: 16px;
}

.sh-integration-item__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.sh-integration-item__icon {
    font-size: 24px;
}

.sh-integration-item__name {
    font-weight: 600;
}

.sh-integration-item__badge {
    margin-left: auto;
    background: var(--sh-color-success);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
}

.sh-setup-summary {
    background: var(--sh-bg-surface-2);
    border-radius: 8px;
    padding: 16px;
    margin: 24px 0;
}

.sh-setup-summary ul {
    margin: 12px 0 0 0;
    padding-left: 20px;
}

.sh-setup-summary li {
    margin-bottom: 8px;
}

.sh-btn--large {
    padding: 16px 32px;
    font-size: 16px;
}
        `;
        document.head.appendChild(style);
    }
}

export default SetupAssistant;
