/**
 * SpaceHub — Jellyfin Advanced System Console Modal
 * Version: 2.0.0 (Apple VisionOS Glassmorphism)
 *
 * Console d'administration système complète pour Jellyfin & Gestionnaire de Plugins SDK :
 * 1. 💻 Système & Général (Specs serveur, OS, chemins, redémarrage / arrêt)
 * 2. ⚡ Transcodage & GPU (NVENC, QuickSync, VAAPI, VideoToolbox, codecs H.264/HEVC/AV1, throttling, presets)
 * 3. 🌐 Réseau & Ports (Ports HTTP 8096 / HTTPS 8920, IPv6, UPnP, URL publique)
 * 4. 👥 Gestion des Utilisateurs (Comptes, rôles admin, dernières activités, création/suppression)
 * 5. ⏱️ Tâches Planifiées (Statuts live, barres de progression, exécution 1-clic)
 * 6. 📜 Journal & Logs Live (Terminal interactif, filtres INF/WRN/ERR, recherche)
 * 7. 🧩 Extensions & Plugins (Modules SpaceHub SDK + Plugins Serveur avec statut de compatibilité)
 */

'use strict';

import Logger from '../../core/Logger.js';

export class JellyfinConsoleModal {
    constructor() {
        this._log = new Logger('JellyfinConsoleModal');
        this._activeTab = 'system';
        this._taskPollTimer = null;
        this._cachedLogs = [];
        this._activeLogContent = '';
        this._encodingConfig = null;
        this._generalConfig = null;
        this._networkConfig = null;
    }

    /**
     * Ouvre la console système avancée.
     * @param {'system'|'encoding'|'network'|'users'|'tasks'|'logs'|'plugins'} [tab='system']
     */
    async open(tab = 'system') {
        this._activeTab = tab;
        document.getElementById('sh-jf-console-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-jf-console-modal';
        modal.className = 'sh-console-modal-overlay';
        modal.innerHTML = `
            <div class="sh-console-card">
                <!-- En-tête Console -->
                <div class="sh-console-header">
                    <div class="sh-console-title-group">
                        <div class="sh-console-brand-badge">
                            <span class="sh-console-pulse"></span>
                            <span>CONSOLE SYSTÈME JELLYFIN & SDK</span>
                        </div>
                        <h2 class="sh-console-title">Administration Système Avancée</h2>
                    </div>

                    <!-- Navigation par Onglets (Liquid Spring Pill Track) -->
                    <nav class="sh-console-nav">
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'system' ? 'active' : ''}" data-tab="system">
                            <span>💻</span>
                            <span>Système</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'encoding' ? 'active' : ''}" data-tab="encoding">
                            <span>⚡</span>
                            <span>Transcodage GPU</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'network' ? 'active' : ''}" data-tab="network">
                            <span>🌐</span>
                            <span>Réseau</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'users' ? 'active' : ''}" data-tab="users">
                            <span>👥</span>
                            <span>Utilisateurs</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
                            <span>⏱️</span>
                            <span>Tâches</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'logs' ? 'active' : ''}" data-tab="logs">
                            <span>📜</span>
                            <span>Logs Live</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-console-nav-tab ${this._activeTab === 'plugins' ? 'active' : ''}" data-tab="plugins">
                            <span>🧩</span>
                            <span>Extensions & Plugins</span>
                        </button>
                    </nav>

                    <button class="sh-console-close-btn" id="sh-console-btn-close" title="Fermer la console">✕</button>
                </div>

                <!-- Corps de la Console avec Défilement Doux -->
                <div class="sh-console-body sh-scrollbar" id="sh-console-body-content">
                    <div class="sh-console-loading">
                        <div class="sh-console-spinner"></div>
                        <p>Chargement des paramètres système...</p>
                    </div>
                </div>

                <!-- Pied de page -->
                <div class="sh-console-footer">
                    <div class="sh-console-footer-status" id="sh-console-footer-status">
                        <span>🟢 Serveur Jellyfin Connecté & Prêt</span>
                    </div>
                    <button tabindex="0" data-nav-focusable="true" class="sh-console-done-btn" id="sh-console-btn-done">Fermer</button>
                </div>
            </div>
        `;

        this._injectStyles();
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));

        const closeModal = () => {
            if (this._taskPollTimer) {
                clearInterval(this._taskPollTimer);
                this._taskPollTimer = null;
            }
            modal.classList.remove('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            if (spatialNav) spatialNav.onModalClosed();
            setTimeout(() => modal.remove(), 260);
        };

        modal.querySelector('#sh-console-btn-close')?.addEventListener('click', closeModal);
        modal.querySelector('#sh-console-btn-done')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Navigation des onglets
        modal.querySelectorAll('.sh-console-nav-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                modal.querySelectorAll('.sh-console-nav-tab').forEach(b => b.classList.remove('active'));
                const targetBtn = e.currentTarget;
                targetBtn.classList.add('active');
                this._activeTab = targetBtn.dataset.tab;
                this._renderActiveTab(modal);
            });
        });

        await this._renderActiveTab(modal);

        const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
        if (spatialNav) {
            spatialNav.onModalOpened(modal, modal.querySelector('.sh-console-nav-tab.active'));
        }
    }

    /**
     * Rendu de l'onglet actif.
     */
    async _renderActiveTab(modal) {
        const bodyEl = modal.querySelector('#sh-console-body-content');
        if (!bodyEl) return;

        if (this._taskPollTimer) {
            clearInterval(this._taskPollTimer);
            this._taskPollTimer = null;
        }

        bodyEl.innerHTML = `
            <div class="sh-console-loading">
                <div class="sh-console-spinner"></div>
                <p>Chargement des données...</p>
            </div>
        `;

        try {
            switch (this._activeTab) {
                case 'system':
                    await this._renderSystemTab(bodyEl, modal);
                    break;
                case 'encoding':
                    await this._renderEncodingTab(bodyEl, modal);
                    break;
                case 'network':
                    await this._renderNetworkTab(bodyEl, modal);
                    break;
                case 'users':
                    await this._renderUsersTab(bodyEl, modal);
                    break;
                case 'tasks':
                    await this._renderTasksTab(bodyEl, modal);
                    break;
                case 'logs':
                    await this._renderLogsTab(bodyEl, modal);
                    break;
                case 'plugins':
                    await this._renderPluginsTab(bodyEl, modal);
                    break;
                default:
                    await this._renderSystemTab(bodyEl, modal);
            }
        } catch (err) {
            bodyEl.innerHTML = `
                <div class="sh-console-error-box">
                    <p>⚠️ Erreur lors du chargement : ${err.message}</p>
                </div>
            `;
        }
    }

    // ─── 1. Onglet Système & Général ──────────────────────────────────────────

    async _renderSystemTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const info = await api?.getSystemInfo?.();
        const counts = await api?.getItemCounts?.();
        const genConfig = await api?.getGeneralConfiguration?.() || {};
        this._generalConfig = genConfig;

        const serverName = genConfig.ServerName || info?.ServerName || 'Jellyfin Server';
        const version = info?.Version || '10.9+';
        const os = info?.OperatingSystem || 'Linux / Windows';
        const arch = info?.SystemArchitecture || 'x64';
        const httpPort = info?.HttpServerPortNumber || 8096;
        const httpsPort = info?.HttpsPortNumber || 8920;
        const cachePath = info?.CachePath || 'Standard Cache';
        const dataPath = info?.DataFolderPath || 'Standard Data';
        const logPath = info?.LogPath || 'Standard Logs';
        const prefLang = genConfig.PreferredMetadataLanguage || 'fr';

        container.innerHTML = `
            <div class="sh-console-section">
                <div class="sh-console-section-header">
                    <div>
                        <h3 class="sh-console-section-title">Informations Serveur & Paramètres Généraux</h3>
                        <p class="sh-console-section-sub">Spécifications techniques de la machine hôte et contrôle d'état.</p>
                    </div>
                    <div class="sh-console-btn-group">
                        <button class="sh-console-primary-btn" id="sh-btn-save-general">Enregistrer</button>
                        <button class="sh-console-danger-btn" id="sh-btn-restart-server">Redémarrer</button>
                        <button class="sh-console-danger-btn outline" id="sh-btn-shutdown-server">Éteindre</button>
                    </div>
                </div>

                <div class="sh-console-bento-grid">
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Nom du Serveur</span>
                        <input type="text" class="sh-console-input" id="sh-cfg-server-name" value="${serverName}" />
                    </div>
                    <div class="sh-console-stat-box highlight">
                        <span class="sh-console-stat-label">Version Jellyfin</span>
                        <strong class="sh-console-stat-val">v${version}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Système d'Exploitation</span>
                        <strong class="sh-console-stat-val">${os} (${arch})</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Langue des Métadonnées</span>
                        <select class="sh-console-select full" id="sh-cfg-pref-lang">
                            <option value="fr" ${prefLang === 'fr' ? 'selected' : ''}>Français (fr)</option>
                            <option value="en" ${prefLang === 'en' ? 'selected' : ''}>English (en)</option>
                            <option value="es" ${prefLang === 'es' ? 'selected' : ''}>Español (es)</option>
                            <option value="de" ${prefLang === 'de' ? 'selected' : ''}>Deutsch (de)</option>
                            <option value="ja" ${prefLang === 'ja' ? 'selected' : ''}>Japonais (ja)</option>
                        </select>
                    </div>
                </div>

                <h3 class="sh-console-section-title" style="margin-top: 24px;">Stockage & Chemins Système</h3>
                <div class="sh-console-paths-list">
                    <div class="sh-console-path-item">
                        <span class="sh-console-path-tag">Base de données</span>
                        <code>${dataPath}</code>
                    </div>
                    <div class="sh-console-path-item">
                        <span class="sh-console-path-tag">Cache Média</span>
                        <code>${cachePath}</code>
                    </div>
                    <div class="sh-console-path-item">
                        <span class="sh-console-path-tag">Fichiers Journaux</span>
                        <code>${logPath}</code>
                    </div>
                </div>

                <h3 class="sh-console-section-title" style="margin-top: 24px;">Médias Indexés au Total</h3>
                <div class="sh-console-bento-grid">
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Films Indexés</span>
                        <strong class="sh-console-stat-val">${counts?.MovieCount || 0}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Séries TV</span>
                        <strong class="sh-console-stat-val">${counts?.SeriesCount || 0}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Épisodes</span>
                        <strong class="sh-console-stat-val">${counts?.EpisodeCount || 0}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Pistes Audio</span>
                        <strong class="sh-console-stat-val">${counts?.SongCount || 0}</strong>
                    </div>
                </div>
            </div>
        `;

        // Sauvegarde de la configuration générale
        container.querySelector('#sh-btn-save-general')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Enregistrement...';

            const payload = {
                ...this._generalConfig,
                ServerName: container.querySelector('#sh-cfg-server-name')?.value?.trim() || serverName,
                PreferredMetadataLanguage: container.querySelector('#sh-cfg-pref-lang')?.value || 'fr'
            };

            const success = await api?.setGeneralConfiguration?.(payload);
            if (success) {
                window.SpaceHub?.ui?.components?.toaster?.success?.('Configuration générale enregistrée !');
            } else {
                window.SpaceHub?.ui?.components?.toaster?.error?.('Échec de l\'enregistrement.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        });

        // Gestion du Redémarrage
        container.querySelector('#sh-btn-restart-server')?.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment redémarrer le serveur Jellyfin ? Toutes les lectures seront momentanément interrompues.')) {
                window.SpaceHub?.ui?.components?.toaster?.info?.('Demande de redémarrage envoyée au serveur...');
                const success = await api?.restartServer?.();
                if (success) {
                    window.SpaceHub?.ui?.components?.toaster?.success?.('Serveur en cours de redémarrage.');
                } else {
                    window.SpaceHub?.ui?.components?.toaster?.error?.('Échec de la demande de redémarrage.');
                }
            }
        });

        // Gestion de l'Arrêt
        container.querySelector('#sh-btn-shutdown-server')?.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment arrêter le serveur Jellyfin ?')) {
                window.SpaceHub?.ui?.components?.toaster?.info?.('Arrêt du serveur en cours...');
                await api?.shutdownServer?.();
            }
        });
    }

    // ─── 2. Onglet Transcodage & Accélération GPU ─────────────────────────────

    async _renderEncodingTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const options = await api?.getEncodingOptions?.() || {};
        this._encodingConfig = options;

        const hwType = options?.HardwareAccelerationType || 'none';
        const tempPath = options?.TranscodingTempPath || '';
        const threadCount = options?.EncodingThreadCount ?? -1;
        const enableThrottling = options?.EnableThrottling !== false;
        const enableH264 = options?.EnableHardwareEncoding !== false;
        const h264Preset = options?.EncoderPreset || 'auto';

        // Codecs matériels
        const decH264 = options?.EnableHardwareDecoding !== false;
        const decHevc = options?.EnableHevcEncoding !== false;
        const decAv1 = options?.EnableAv1Encoding === true;

        container.innerHTML = `
            <div class="sh-console-section">
                <div class="sh-console-section-header">
                    <div>
                        <h3 class="sh-console-section-title">Moteur de Transcodage & Matériel (GPU)</h3>
                        <p class="sh-console-section-sub">Configurez les accélérateurs matériels pour la lecture fluide sur tous vos écrans.</p>
                    </div>
                    <button class="sh-console-primary-btn" id="sh-btn-save-encoding">Enregistrer les Réglages</button>
                </div>

                <!-- 1. Sélection Accélérateur GPU -->
                <div class="sh-console-form-group">
                    <label class="sh-console-label" for="sh-cfg-hw-accel">Moteur d'Accélération Matérielle</label>
                    <select class="sh-console-select full" id="sh-cfg-hw-accel">
                        <option value="none" ${hwType === 'none' ? 'selected' : ''}>Désactivé (CPU Logiciel)</option>
                        <option value="nvenc" ${hwType === 'nvenc' ? 'selected' : ''}>Nvidia NVENC / CUDA (GeForce / RTX / Quadro)</option>
                        <option value="qsv" ${hwType === 'qsv' ? 'selected' : ''}>Intel QuickSync Video (QSV)</option>
                        <option value="vaapi" ${hwType === 'vaapi' ? 'selected' : ''}>VAAPI (Linux Open Source)</option>
                        <option value="amf" ${hwType === 'amf' ? 'selected' : ''}>AMD AMF (Radeon GPU)</option>
                        <option value="videotoolbox" ${hwType === 'videotoolbox' ? 'selected' : ''}>Apple VideoToolbox (Mac M1/M2/M3 & Intel)</option>
                    </select>
                </div>

                <!-- 2. Codecs Décodage / Encodage -->
                <h4 class="sh-console-subsection-title" style="margin-top: 20px;">Codecs & Prise en charge</h4>
                <div class="sh-console-switches-grid">
                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Encodage Matériel Accéléré</strong>
                            <small>Utilise la puce graphique pour encoder les flux vidéo en direct</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-hw-encoding" ${enableH264 ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>

                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Limitation du Débit (Throttling)</strong>
                            <small>Met en pause le transcodage dès que le tampon de lecture est suffisant</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-throttling" ${enableThrottling ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>

                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Décodage Matériel H.264 / AVC</strong>
                            <small>Accélère la décompression des vidéos standards H.264</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-dec-h264" ${decH264 ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>

                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Décodage Matériel HEVC / H.265 (4K)</strong>
                            <small>Accélère les flux 4K HDR & HEVC 10-bit</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-dec-hevc" ${decHevc ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- 3. Répertoires & Presets -->
                <h4 class="sh-console-subsection-title" style="margin-top: 20px;">Paramètres Avancés</h4>
                <div class="sh-console-bento-grid">
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-transcode-path">Dossier Temporaire de Transcodage</label>
                        <input type="text" class="sh-console-input full" id="sh-cfg-transcode-path" placeholder="Ex: /tmp/transcodes ou C:\\Jellyfin\\transcodes" value="${tempPath}" />
                    </div>
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-threads">Threads d'Encodage</label>
                        <select class="sh-console-select full" id="sh-cfg-threads">
                            <option value="-1" ${threadCount === -1 ? 'selected' : ''}>Automatique (Recommandé)</option>
                            <option value="0" ${threadCount === 0 ? 'selected' : ''}>Tous les coeurs CPU</option>
                            <option value="2" ${threadCount === 2 ? 'selected' : ''}>2 Threads</option>
                            <option value="4" ${threadCount === 4 ? 'selected' : ''}>4 Threads</option>
                            <option value="8" ${threadCount === 8 ? 'selected' : ''}>8 Threads</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#sh-btn-save-encoding')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Enregistrement...';

            const payload = {
                ...this._encodingConfig,
                HardwareAccelerationType: container.querySelector('#sh-cfg-hw-accel')?.value || 'none',
                TranscodingTempPath: container.querySelector('#sh-cfg-transcode-path')?.value?.trim() || '',
                EnableHardwareEncoding: container.querySelector('#sh-cfg-hw-encoding')?.checked === true,
                EnableThrottling: container.querySelector('#sh-cfg-throttling')?.checked === true,
                EnableHardwareDecoding: container.querySelector('#sh-cfg-dec-h264')?.checked === true,
                EnableHevcEncoding: container.querySelector('#sh-cfg-dec-hevc')?.checked === true,
                EncodingThreadCount: parseInt(container.querySelector('#sh-cfg-threads')?.value || '-1', 10)
            };

            const success = await api?.setEncodingOptions?.(payload);
            if (success) {
                window.SpaceHub?.ui?.components?.toaster?.success?.('Réglages de transcodage enregistrés !');
            } else {
                window.SpaceHub?.ui?.components?.toaster?.error?.('Impossible de sauvegarder le transcodage.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer les Réglages';
        });
    }

    // ─── 3. Onglet Réseau & Ports ─────────────────────────────────────────────

    async _renderNetworkTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const netConfig = await api?.getNetworkConfiguration?.() || {};
        this._networkConfig = netConfig;

        const httpPort = netConfig.InternalHttpPort || 8096;
        const httpsPort = netConfig.InternalHttpsPort || 8920;
        const publicHttpPort = netConfig.PublicHttpPort || 8096;
        const publicHttpsPort = netConfig.PublicHttpsPort || 8920;
        const enableIpv6 = netConfig.EnableIPv6 === true;
        const enableUPnP = netConfig.EnableUPnP === true;

        container.innerHTML = `
            <div class="sh-console-section">
                <div class="sh-console-section-header">
                    <div>
                        <h3 class="sh-console-section-title">Configuration Réseau & Ports</h3>
                        <p class="sh-console-section-sub">Gestion des ports de communication, protocoles et accès distant.</p>
                    </div>
                    <button class="sh-console-primary-btn" id="sh-btn-save-network">Enregistrer Réseau</button>
                </div>

                <div class="sh-console-bento-grid">
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-port-http">Port HTTP Local</label>
                        <input type="number" class="sh-console-input full" id="sh-cfg-port-http" value="${httpPort}" />
                    </div>
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-port-https">Port HTTPS Local</label>
                        <input type="number" class="sh-console-input full" id="sh-cfg-port-https" value="${httpsPort}" />
                    </div>
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-pub-http">Port HTTP Public</label>
                        <input type="number" class="sh-console-input full" id="sh-cfg-pub-http" value="${publicHttpPort}" />
                    </div>
                    <div class="sh-console-form-group">
                        <label class="sh-console-label" for="sh-cfg-pub-https">Port HTTPS Public</label>
                        <input type="number" class="sh-console-input full" id="sh-cfg-pub-https" value="${publicHttpsPort}" />
                    </div>
                </div>

                <h4 class="sh-console-subsection-title" style="margin-top: 20px;">Protocoles & Découverte</h4>
                <div class="sh-console-switches-grid">
                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Prise en charge IPv6</strong>
                            <small>Autorise les connexions réseau via adresses IPv6</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-ipv6" ${enableIpv6 ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>

                    <div class="sh-console-switch-row">
                        <div class="sh-console-switch-text">
                            <strong>Mappage de Port Automatique (UPnP)</strong>
                            <small>Configure automatiquement les règles de routage de la box/routeur</small>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" id="sh-cfg-upnp" ${enableUPnP ? 'checked' : ''} />
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#sh-btn-save-network')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Enregistrement...';

            const payload = {
                ...this._networkConfig,
                InternalHttpPort: parseInt(container.querySelector('#sh-cfg-port-http')?.value || '8096', 10),
                InternalHttpsPort: parseInt(container.querySelector('#sh-cfg-port-https')?.value || '8920', 10),
                PublicHttpPort: parseInt(container.querySelector('#sh-cfg-pub-http')?.value || '8096', 10),
                PublicHttpsPort: parseInt(container.querySelector('#sh-cfg-pub-https')?.value || '8920', 10),
                EnableIPv6: container.querySelector('#sh-cfg-ipv6')?.checked === true,
                EnableUPnP: container.querySelector('#sh-cfg-upnp')?.checked === true
            };

            const success = await api?.setNetworkConfiguration?.(payload);
            if (success) {
                window.SpaceHub?.ui?.components?.toaster?.success?.('Configuration réseau enregistrée !');
            } else {
                window.SpaceHub?.ui?.components?.toaster?.error?.('Échec de l\'enregistrement réseau.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer Réseau';
        });
    }

    // ─── 4. Onglet Gestion des Utilisateurs ───────────────────────────────────

    async _renderUsersTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const users = await api?.getUsers?.() || [];

        container.innerHTML = `
            <div class="sh-console-section">
                <div class="sh-console-section-header">
                    <div>
                        <h3 class="sh-console-section-title">Comptes Utilisateurs Jellyfin (${users.length})</h3>
                        <p class="sh-console-section-sub">Consultez les privilèges, dates d'accès et politiques de chaque compte.</p>
                    </div>
                </div>

                <div class="sh-console-users-grid">
                    ${users.map(u => {
                        const isAdmin = u.Policy?.IsAdministrator === true;
                        const isDisabled = u.Policy?.IsDisabled === true;
                        const lastLogin = u.LastLoginDate ? new Date(u.LastLoginDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais';
                        const lastActivity = u.LastActivityDate ? new Date(u.LastActivityDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Inactif';

                        const initials = (u.Name || 'U').slice(0, 2).toUpperCase();

                        return `
                            <div class="sh-console-user-card ${isDisabled ? 'disabled' : ''}">
                                <div class="sh-console-user-avatar">
                                    <span>${initials}</span>
                                </div>
                                <div class="sh-console-user-details">
                                    <div class="sh-console-user-name-row">
                                        <strong>${u.Name}</strong>
                                        ${isAdmin ? '<span class="sh-user-badge admin">👑 Admin</span>' : '<span class="sh-user-badge standard">Membre</span>'}
                                    </div>
                                    <div class="sh-console-user-meta">
                                        <span>Dernière connexion : <strong>${lastLogin}</strong></span>
                                        <span>Dernière activité : <strong>${lastActivity}</strong></span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ─── 5. Onglet Tâches Planifiées (Scheduled Tasks) ─────────────────────────

    async _renderTasksTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const tasks = await api?.getScheduledTasks?.() || [];

        container.innerHTML = `
            <div class="sh-console-section">
                <div class="sh-console-section-header">
                    <div>
                        <h3 class="sh-console-section-title">Tâches Automatiques & Maintenance</h3>
                        <p class="sh-console-section-sub">Surveillance et déclenchement direct des routines d'arrière-plan Jellyfin.</p>
                    </div>
                    <button class="sh-console-action-btn" id="sh-btn-refresh-tasks">↻ Actualiser</button>
                </div>

                <div class="sh-console-tasks-list" id="sh-console-tasks-container">
                    <!-- Injected dynamically -->
                </div>
            </div>
        `;

        const listContainer = container.querySelector('#sh-console-tasks-container');

        const renderTaskList = (taskList) => {
            if (!taskList || taskList.length === 0) {
                listContainer.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:20px;">Aucune tâche planifiée trouvée.</p>';
                return;
            }

            listContainer.innerHTML = taskList.map(task => {
                const isRunning = task.State === 'Running';
                const progress = Math.round(task.CurrentProgressPercentage || 0);
                const lastStatus = task.LastExecutionResult?.Status || 'Terminé';
                const category = task.Category || 'Système';

                return `
                    <div class="sh-console-task-row" data-task-id="${task.Id}">
                        <div class="sh-console-task-info">
                            <div class="sh-console-task-title-row">
                                <strong>${task.Name}</strong>
                                <span class="sh-console-task-cat">${category}</span>
                                ${isRunning ? `<span class="sh-console-task-badge running"><span class="sh-pulse-dot"></span> En cours (${progress}%)</span>` : `<span class="sh-console-task-badge idle">${lastStatus}</span>`}
                            </div>
                            <small class="sh-console-task-desc">${task.Description || 'Aucune description disponible.'}</small>
                            ${isRunning ? `
                                <div class="sh-console-progress-track">
                                    <div class="sh-console-progress-fill" style="width: ${progress}%"></div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="sh-console-task-action">
                            ${isRunning
                                ? `<button class="sh-console-task-btn stop" data-action="stop" data-id="${task.Id}">⏹ Arrêter</button>`
                                : `<button class="sh-console-task-btn start" data-action="start" data-id="${task.Id}">▶ Exécuter</button>`
                            }
                        </div>
                    </div>
                `;
            }).join('');

            listContainer.querySelectorAll('.sh-console-task-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const action = e.currentTarget.dataset.action;
                    const taskId = e.currentTarget.dataset.id;
                    e.currentTarget.disabled = true;

                    if (action === 'start') {
                        window.SpaceHub?.ui?.components?.toaster?.info?.('Lancement de la tâche...');
                        await api?.startScheduledTask?.(taskId);
                    } else {
                        window.SpaceHub?.ui?.components?.toaster?.info?.('Annulation de la tâche...');
                        await api?.stopScheduledTask?.(taskId);
                    }
                    setTimeout(refreshTasks, 800);
                });
            });
        };

        const refreshTasks = async () => {
            const updated = await api?.getScheduledTasks?.() || [];
            renderTaskList(updated);
        };

        container.querySelector('#sh-btn-refresh-tasks')?.addEventListener('click', refreshTasks);
        renderTaskList(tasks);

        this._taskPollTimer = setInterval(async () => {
            if (this._activeTab === 'tasks') {
                const updated = await api?.getScheduledTasks?.() || [];
                const anyRunning = updated.some(t => t.State === 'Running');
                if (anyRunning) renderTaskList(updated);
            }
        }, 3000);
    }

    // ─── 6. Onglet Journal & Logs en Direct ────────────────────────────────────

    async _renderLogsTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const logs = await api?.getServerLogs?.() || [];
        this._cachedLogs = logs;

        const defaultLog = logs.length > 0 ? logs[0].Name : '';

        container.innerHTML = `
            <div class="sh-console-logs-wrapper">
                <div class="sh-console-logs-toolbar">
                    <div class="sh-console-logs-select-group">
                        <label for="sh-console-log-file-select" style="font-size: 12px; color: rgba(255,255,255,0.6); margin-right: 8px;">Fichier :</label>
                        <select class="sh-console-select" id="sh-console-log-file-select">
                            ${logs.map(l => `<option value="${l.Name}">${l.Name} (${(l.Size / 1024).toFixed(0)} KB)</option>`).join('')}
                        </select>
                    </div>

                    <div class="sh-console-logs-filter-group">
                        <input type="text" class="sh-console-search-input" id="sh-console-log-search" placeholder="Rechercher dans les logs (Ctrl+F)..." />
                        <select class="sh-console-select" id="sh-console-log-level-filter">
                            <option value="ALL">Tous les niveaux</option>
                            <option value="INF">🟢 Infos seulement</option>
                            <option value="WRN">🟠 Avertissements (WRN)</option>
                            <option value="ERR">🔴 Erreurs seulement (ERR)</option>
                            <option value="FTL">🟣 Fatales (FTL)</option>
                        </select>
                        <button class="sh-console-action-btn" id="sh-btn-refresh-logs" title="Rafraîchir les logs">↻ Actualiser</button>
                    </div>
                </div>

                <div class="sh-console-terminal sh-scrollbar" id="sh-console-terminal-view">
                    <div style="padding: 20px; color: rgba(255,255,255,0.4); text-align: center;">Chargement du fichier journal...</div>
                </div>
            </div>
        `;

        const terminalView = container.querySelector('#sh-console-terminal-view');
        const fileSelect = container.querySelector('#sh-console-log-file-select');
        const searchInput = container.querySelector('#sh-console-log-search');
        const levelFilter = container.querySelector('#sh-console-log-level-filter');
        const refreshBtn = container.querySelector('#sh-btn-refresh-logs');

        const loadSelectedLog = async () => {
            const fileName = fileSelect?.value || defaultLog;
            if (!fileName) {
                terminalView.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:20px;">Aucun fichier log disponible.</p>';
                return;
            }

            terminalView.innerHTML = '<div style="padding: 20px; color: rgba(255,255,255,0.4);">Lecture du journal en direct...</div>';
            const rawText = await api?.getLogFile?.(fileName);
            this._activeLogContent = rawText;
            renderFormattedLogs();
        };

        const renderFormattedLogs = () => {
            if (!this._activeLogContent) {
                terminalView.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:20px;">Fichier journal vide.</p>';
                return;
            }

            const query = searchInput?.value?.toLowerCase() || '';
            const selectedLevel = levelFilter?.value || 'ALL';
            const lines = this._activeLogContent.split('\n');

            const formattedHtml = lines.map(line => {
                if (!line.trim()) return '';

                if (selectedLevel !== 'ALL') {
                    if (!line.includes(`[${selectedLevel}]`)) return '';
                }

                if (query && !line.toLowerCase().includes(query)) return '';

                let lineClass = 'log-line-info';
                if (line.includes('[WRN]') || line.includes('warn')) lineClass = 'log-line-warn';
                if (line.includes('[ERR]') || line.includes('error') || line.includes('Exception')) lineClass = 'log-line-error';
                if (line.includes('[FTL]') || line.includes('fatal')) lineClass = 'log-line-fatal';

                const safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<div class="sh-log-row ${lineClass}">${safeLine}</div>`;
            }).filter(Boolean).join('');

            terminalView.innerHTML = formattedHtml || '<p style="color:rgba(255,255,255,0.4); padding:20px;">Aucune ligne correspondante trouvée.</p>';
            terminalView.scrollTop = terminalView.scrollHeight;
        };

        fileSelect?.addEventListener('change', loadSelectedLog);
        searchInput?.addEventListener('input', renderFormattedLogs);
        levelFilter?.addEventListener('change', renderFormattedLogs);
        refreshBtn?.addEventListener('click', loadSelectedLog);

        if (defaultLog) await loadSelectedLog();
    }

        // ─── 7. Onglet Extensions & Intégrations Dynamiques (SDK + Backend) ────────

    async _renderPluginsTab(container, modal) {
        const api = window.SpaceHub?.jellyfin?.api;
        const serverPlugins = await api?.getPlugins?.() || [];

        // 1. Vraies Intégrations Servarr & Média
        const servarrIntegrations = [
            { id: 'sonarr', name: 'Sonarr Series Integration', desc: 'Gestion des séries TV, saisons et calendrier des épisodes', icon: '📺' },
            { id: 'radarr', name: 'Radarr Movies Integration', desc: 'Gestion des films, formats numériques et sorties cinéma', icon: '🎬' },
            { id: 'prowlarr', name: 'Prowlarr Indexers Integration', desc: 'Surveillance des indexeurs BitTorrent et Usenet', icon: '⚡' },
            { id: 'bazarr', name: 'Bazarr Subtitles Sync', desc: 'Recherche et synchronisation automatique des sous-titres FR', icon: '📝' },
            { id: 'jellyseerr', name: 'Jellyseerr Media Requests', desc: 'Hub de découverte TMDB et demandes de streaming', icon: '🍿' },
            { id: 'qbittorrent', name: 'qBittorrent Download Client', desc: 'Supervision des téléchargements et métriques de débit', icon: '📥' }
        ];

        // 2. Vrais Plugins SDK enregistrés dans PluginManager
        const sdkPlugins = window.SpaceHub?.sdk?.getPlugins?.() || [];
        const settings = window.SpaceHub?.core?.settings;

        container.innerHTML = `
            <div class="sh-console-section">
                <!-- Section 1 : Intégrations Natives Servarr -->
                <div class="sh-console-section-header">
                    <div>
                        <div class="sh-console-brand-badge small">INTÉGRATIONS MÉDIAS & SERVARR</div>
                        <h3 class="sh-console-section-title">Services Connectés (${servarrIntegrations.length})</h3>
                        <p class="sh-console-section-sub">Services multimédias managés par SpaceHub avec supervision opérationnelle.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid">
                    ${servarrIntegrations.map(mod => {
                        const isEnabled = settings?.get(`${mod.id}.enabled`, true) !== false;
                        const serviceInstance = window.SpaceHub?.integrations?.[mod.id];
                        const isConfigured = Boolean(settings?.get(`${mod.id}.url`) || settings?.get(`${mod.id}.apiKey`));

                        return `
                            <div class="sh-console-plugin-card">
                                <div class="sh-console-plugin-header">
                                    <div class="sh-console-plugin-icon">${mod.icon}</div>
                                    <div class="sh-console-plugin-info">
                                        <strong>${mod.name}</strong>
                                        <code>${isConfigured ? '🟢 Configuré & Actif' : '⚪ Non configuré'}</code>
                                    </div>
                                    <label class="sh-apple-switch">
                                        <input type="checkbox" class="sh-servarr-toggle" data-module-id="${mod.id}" ${isEnabled ? 'checked' : ''} />
                                        <span class="sh-apple-switch-slider"></span>
                                    </label>
                                </div>
                                <p class="sh-console-plugin-desc">${mod.desc}</p>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Section 2 : Extensions & Plugins SDK Reconnus -->
                <div class="sh-console-section-header" style="margin-top: 32px;">
                    <div>
                        <div class="sh-console-brand-badge small">SPACEHUB SDK CLIENT</div>
                        <h3 class="sh-console-section-title">Extensions & Plugins SDK (${sdkPlugins.length})</h3>
                        <p class="sh-console-section-sub">Plugins tiers et communautaires gérés par le PluginManager officiel.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid" id="sh-console-sdk-plugins-grid">
                    ${sdkPlugins.length > 0 ? sdkPlugins.map(plugin => `
                        <div class="sh-console-plugin-card">
                            <div class="sh-console-plugin-header">
                                <div class="sh-console-plugin-icon">${plugin.icon}</div>
                                <div class="sh-console-plugin-info">
                                    <strong>${plugin.name}</strong>
                                    <code>v${plugin.version} • ${plugin.author}</code>
                                </div>
                                <label class="sh-apple-switch">
                                    <input type="checkbox" class="sh-sdk-plugin-toggle" data-plugin-id="${plugin.id}" ${plugin.isEnabled ? 'checked' : ''} />
                                    <span class="sh-apple-switch-slider"></span>
                                </label>
                            </div>
                            <p class="sh-console-plugin-desc">${plugin.description || 'Extension SDK active.'}</p>
                        </div>
                    `).join('') : `
                        <div class="sh-console-empty-plugin-state" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                            <p style="color: rgba(255,255,255,0.5); font-size: 13.5px; margin: 0;">Aucun plugin SDK tiers installé. Vous pouvez enregistrer des extensions via <code>SpaceHub.sdk.registerPlugin()</code>.</p>
                        </div>
                    `}
                </div>

                <!-- Section 3 : Plugins Serveur Jellyfin (Backend) -->
                <div class="sh-console-section-header" style="margin-top: 32px;">
                    <div>
                        <div class="sh-console-brand-badge small">JELLYFIN BACKEND SERVEUR</div>
                        <h3 class="sh-console-section-title">Plugins Installés sur le Serveur (${serverPlugins.length})</h3>
                        <p class="sh-console-section-sub">Extensions installées directement sur votre instance Jellyfin.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid">
                    ${serverPlugins.length > 0 ? serverPlugins.map(p => {
                        const nameLower = (p.Name || '').toLowerCase();
                        const isLegacySkin = nameLower.includes('skin') || nameLower.includes('css') || nameLower.includes('tweak');

                        return `
                            <div class="sh-console-plugin-card server ${isLegacySkin ? 'legacy' : ''}">
                                <div class="sh-console-plugin-header">
                                    <div class="sh-console-plugin-icon">📦</div>
                                    <div class="sh-console-plugin-info">
                                        <strong>${p.Name}</strong>
                                        <code>v${p.Version} • Statut: ${p.Status || 'Actif'}</code>
                                    </div>
                                    <span class="sh-plugin-status-badge loaded">🟢 Serveur</span>
                                </div>
                                <p class="sh-console-plugin-desc">${p.Description || 'Extension serveur Jellyfin.'}</p>
                            </div>
                        `;
                    }).join('') : `
                        <div class="sh-console-empty-plugin-state">
                            <p>Aucun plugin serveur tiers détecté sur votre instance Jellyfin.</p>
                        </div>
                    `}
                </div>
            </div>
        `;

        // Écouteurs pour les toggles Servarr
        container.querySelectorAll('.sh-servarr-toggle').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const modId = e.currentTarget.dataset.moduleId;
                settings?.set(`${modId}.enabled`, e.currentTarget.checked);
                window.SpaceHub?.ui?.components?.toaster?.info?.(`Intégration ${modId} ${e.currentTarget.checked ? 'activée' : 'désactivée'}.`);
            });
        });

        // Écouteurs pour les vrais plugins SDK
        container.querySelectorAll('.sh-sdk-plugin-toggle').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const pluginId = e.currentTarget.dataset.pluginId;
                const isChecked = e.currentTarget.checked;
                
                if (isChecked) {
                    await window.SpaceHub?.sdk?.enablePlugin(pluginId);
                    window.SpaceHub?.ui?.components?.toaster?.success?.(`Plugin "${pluginId}" activé !`);
                } else {
                    await window.SpaceHub?.sdk?.disablePlugin(pluginId);
                    window.SpaceHub?.ui?.components?.toaster?.info?.(`Plugin "${pluginId}" désactivé.`);
                }
            });
        });
    }

    // ─── Styles VisionOS Immersifs Sans Bug d'Affichage ────────────────────────

    _injectStyles() {
        if (document.getElementById('sh-jf-console-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-jf-console-styles';
        style.textContent = `
.sh-console-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(48px) saturate(180%);
    -webkit-backdrop-filter: blur(48px) saturate(180%);
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
    padding: 24px;
    box-sizing: border-box;
}

.sh-console-modal-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

.sh-console-card {
    width: 100%;
    max-width: 1100px;
    height: 88vh;
    background: rgba(14, 14, 18, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 28px;
    box-shadow: 0 32px 90px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    padding: 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 18px;
    transform: scale(0.96) translateY(12px);
    transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
}

.sh-console-modal-overlay.open .sh-console-card {
    transform: scale(1) translateY(0);
}

.sh-console-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 16px;
    gap: 16px;
    flex-wrap: wrap;
}

.sh-console-brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 100px;
    font-size: 10px;
    font-weight: 750;
    color: #ffffff;
    letter-spacing: 0.8px;
    margin-bottom: 4px;
}

.sh-console-brand-badge.small {
    font-size: 9px;
    padding: 2px 8px;
    margin-bottom: 6px;
}

.sh-console-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #30d158;
    box-shadow: 0 0 8px #30d158;
}

.sh-console-title {
    font-size: 20px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.4px;
}

.sh-console-nav {
    display: flex;
    gap: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 100px;
    padding: 4px;
    flex-wrap: wrap;
}

.sh-console-nav-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.60);
    padding: 6px 14px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 180ms ease;
}

.sh-console-nav-tab:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
}

.sh-console-nav-tab.active {
    color: #000000;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.25);
}

.sh-console-close-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
    transition: all 160ms ease;
}

.sh-console-close-btn:hover {
    background: rgba(255, 255, 255, 0.20);
    transform: scale(1.08);
}

.sh-console-body {
    flex: 1;
    overflow-y: auto;
    padding-right: 6px;
}

.sh-console-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sh-console-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
}

.sh-console-section-title {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
}

.sh-console-section-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 2px 0 0 0;
}

.sh-console-subsection-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin: 12px 0 6px 0;
}

.sh-console-btn-group {
    display: flex;
    gap: 8px;
}

.sh-console-primary-btn {
    background: #ffffff;
    border: none;
    color: #000000;
    padding: 7px 16px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 160ms ease;
}

.sh-console-primary-btn:hover {
    transform: scale(1.04);
}

.sh-console-danger-btn {
    background: rgba(255, 69, 58, 0.18);
    border: 1px solid rgba(255, 69, 58, 0.35);
    color: #ff453a;
    padding: 7px 16px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-console-danger-btn:hover {
    background: rgba(255, 69, 58, 0.30);
}

.sh-console-danger-btn.outline {
    background: transparent;
    border-color: rgba(255, 69, 58, 0.25);
    color: rgba(255, 69, 58, 0.8);
}

/* Form inputs & Selects - Fix styling bug */
.sh-console-form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-console-label {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
}

select.sh-console-select {
    background-color: #16161e !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 12px !important;
    padding: 10px 14px !important;
    font-size: 13px !important;
    outline: none !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 14px center !important;
    padding-right: 36px !important;
    box-sizing: border-box !important;
}

select.sh-console-select option {
    background-color: #16161e !important;
    color: #ffffff !important;
    padding: 10px !important;
}

input.sh-console-input {
    background-color: #16161e !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 12px !important;
    padding: 10px 14px !important;
    font-size: 13px !important;
    outline: none !important;
    box-sizing: border-box !important;
}

input.sh-console-input:focus, select.sh-console-select:focus {
    border-color: rgba(255, 255, 255, 0.4) !important;
}

.sh-console-select.full, input.sh-console-input.full {
    width: 100%;
}

/* Switches Grid */
.sh-console-switches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 12px;
}

.sh-console-switch-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.sh-console-switch-text strong {
    display: block;
    font-size: 13px;
    color: #ffffff;
}

.sh-console-switch-text small {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
}

.sh-console-bento-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}

.sh-console-stat-box {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-console-stat-box.highlight {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.16);
}

.sh-console-stat-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-console-stat-val {
    font-size: 15px;
    color: #ffffff;
    font-weight: 700;
}

.sh-console-paths-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sh-console-path-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 10px 14px;
}

.sh-console-path-tag {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    width: 140px;
    flex-shrink: 0;
}

.sh-console-path-item code {
    font-family: monospace;
    font-size: 12px;
    color: #64d2ff;
    word-break: break-all;
}

.sh-console-logs-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
}

.sh-console-logs-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.sh-console-logs-filter-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.sh-console-search-input {
    background: #16161e;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    color: #ffffff;
    padding: 8px 14px;
    font-size: 12px;
    min-width: 220px;
    outline: none;
}

.sh-console-action-btn {
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-console-action-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.sh-console-terminal {
    background: rgba(5, 5, 8, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 16px;
    padding: 16px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 11px;
    line-height: 1.6;
    height: 480px;
    overflow-y: auto;
    color: rgba(255, 255, 255, 0.85);
}

.sh-log-row {
    white-space: pre-wrap;
    word-break: break-all;
    padding: 2px 0;
}

.log-line-info { color: #d0d0d8; }
.log-line-warn { color: #ffd60a; }
.log-line-error { color: #ff453a; font-weight: bold; background: rgba(255, 69, 58, 0.08); }
.log-line-fatal { color: #bf5af2; font-weight: bold; }

.sh-console-users-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
}

.sh-console-user-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
}

.sh-console-user-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05));
    border: 1px solid rgba(255, 255, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 750;
    color: #ffffff;
    flex-shrink: 0;
}

.sh-user-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
}

.sh-user-badge.admin {
    background: rgba(255, 214, 10, 0.15);
    color: #ffd60a;
}

.sh-user-badge.standard {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
}

.sh-console-user-meta {
    display: flex;
    flex-direction: column;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    gap: 2px;
    margin-top: 4px;
}

.sh-console-tasks-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sh-console-task-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.sh-console-task-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-console-task-cat {
    font-size: 10px;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
}

.sh-console-task-desc {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 4px;
}

.sh-console-task-badge.running {
    font-size: 11px;
    font-weight: 700;
    color: #30d158;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.sh-console-progress-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 100px;
    margin-top: 8px;
    overflow: hidden;
}

.sh-console-progress-fill {
    height: 100%;
    background: #30d158;
    border-radius: 100px;
}

.sh-console-task-btn {
    padding: 8px 18px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-console-task-btn.start {
    background: #ffffff;
    color: #000000;
}

.sh-console-task-btn.stop {
    background: rgba(255, 69, 58, 0.2);
    color: #ff453a;
    border: 1px solid rgba(255, 69, 58, 0.4);
}

.sh-console-plugins-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 12px;
}

.sh-console-plugin-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sh-console-plugin-card.server {
    background: rgba(255, 255, 255, 0.02);
}

.sh-console-plugin-card.server.legacy {
    border-color: rgba(255, 214, 10, 0.25);
    background: rgba(255, 214, 10, 0.03);
}

.sh-console-plugin-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sh-console-plugin-icon {
    font-size: 22px;
}

.sh-console-plugin-info {
    flex: 1;
}

.sh-console-plugin-info strong {
    display: block;
    font-size: 13px;
    color: #ffffff;
}

.sh-console-plugin-info code {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-plugin-status-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
}

.sh-plugin-status-badge.loaded {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
}

.sh-plugin-status-badge.warn {
    background: rgba(255, 214, 10, 0.15);
    color: #ffd60a;
}

.sh-console-plugin-desc {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
    margin: 0;
}

.sh-console-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 16px;
}

.sh-console-footer-status {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-console-done-btn {
    background: #ffffff;
    border: none;
    color: #000000;
    padding: 8px 22px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 160ms ease;
}

.sh-apple-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
}

.sh-apple-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.sh-apple-switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.18);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 24px;
}

.sh-apple-switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 2px;
    bottom: 2px;
    background-color: #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 50%;
}

.sh-apple-switch input:checked + .sh-apple-switch-slider {
    background-color: #30d158;
    border-color: #30d158;
}

.sh-apple-switch input:checked + .sh-apple-switch-slider:before {
    transform: translateX(20px);
}
        `;
        document.head.appendChild(style);
    }
}

export default JellyfinConsoleModal;
