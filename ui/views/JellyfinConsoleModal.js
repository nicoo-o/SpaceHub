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
import { gabaritConsoleModules } from './JellyfinConsoleModal.template.js';

import './JellyfinConsoleModal.css';
import * as svc from '../../core/services.js';
export class JellyfinConsoleModal {
    constructor() {
        this._log = new Logger('JellyfinConsoleModal');
        this._activeTab = 'system';
        this._taskPollTimer = null;
        this._closeTimer = null;
        this._modal = null;
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
        const user = svc.auth()?.getUser?.();
        if (user?.Policy?.IsAdministrator !== true) {
            svc.toaster()?.error?.('Accès réservé aux administrateurs Jellyfin.');
            return false;
        }
        this._activeTab = tab;
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        document.getElementById('sh-jf-console-modal')?.remove();

        const modal = document.createElement('div');
        this._modal = modal;
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
                        <span>État du serveur Jellyfin : vérification en cours</span>
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
            const spatialNav = svc.nav() || svc.nav();
            if (spatialNav) spatialNav.onModalClosed();
            this._closeTimer = setTimeout(() => {
                modal.remove();
                if (this._modal === modal) this._modal = null;
                this._closeTimer = null;
            }, 260);
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

        const spatialNav = svc.nav() || svc.nav();
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
                    <p>⚠️ Erreur lors du chargement : ${this._escape(err?.message || 'Erreur inconnue')}</p>
                </div>
            `;
        }
    }

    // ─── 1. Onglet Système & Général ──────────────────────────────────────────

    async _renderSystemTab(container, modal) {
        const api = svc.jellyfinApi();
        const info = await api?.getSystemInfo?.();
        const counts = await api?.getItemCounts?.();
        const genConfig = await api?.getGeneralConfiguration?.() || {};
        this._generalConfig = genConfig;

        const serverName = genConfig.ServerName || info?.ServerName || 'Nom indisponible';
        const version = info?.Version || 'Version indisponible';
        const os = info?.OperatingSystem || 'Système indisponible';
        const arch = info?.SystemArchitecture || 'Architecture indisponible';
        const httpPort = info?.HttpServerPortNumber ?? '—';
        const httpsPort = info?.HttpsPortNumber ?? '—';
        const cachePath = info?.CachePath || 'Chemin indisponible';
        const dataPath = info?.DataFolderPath || 'Chemin indisponible';
        const logPath = info?.LogPath || 'Chemin indisponible';
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
                        <input type="text" class="sh-console-input" id="sh-cfg-server-name" value="${this._escape(serverName)}" />
                    </div>
                    <div class="sh-console-stat-box highlight">
                        <span class="sh-console-stat-label">Version Jellyfin</span>
                        <strong class="sh-console-stat-val">${this._escape(version)}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Système d'Exploitation</span>
                        <strong class="sh-console-stat-val">${this._escape(os)} (${this._escape(arch)})</strong>
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
                        <code>${this._escape(dataPath)}</code>
                    </div>
                    <div class="sh-console-path-item">
                        <span class="sh-console-path-tag">Cache Média</span>
                        <code>${this._escape(cachePath)}</code>
                    </div>
                    <div class="sh-console-path-item">
                        <span class="sh-console-path-tag">Fichiers Journaux</span>
                        <code>${this._escape(logPath)}</code>
                    </div>
                </div>

                <h3 class="sh-console-section-title" style="margin-top: 24px;">Médias Indexés au Total</h3>
                <div class="sh-console-bento-grid">
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Films Indexés</span>
                        <strong class="sh-console-stat-val">${this._escape(counts?.MovieCount ?? '—')}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Séries TV</span>
                        <strong class="sh-console-stat-val">${this._escape(counts?.SeriesCount ?? '—')}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Épisodes</span>
                        <strong class="sh-console-stat-val">${this._escape(counts?.EpisodeCount ?? '—')}</strong>
                    </div>
                    <div class="sh-console-stat-box">
                        <span class="sh-console-stat-label">Pistes Audio</span>
                        <strong class="sh-console-stat-val">${this._escape(counts?.SongCount ?? '—')}</strong>
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
                svc.toaster()?.success?.('Configuration générale enregistrée !');
            } else {
                svc.toaster()?.error?.('Échec de l\'enregistrement.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        });

        // Gestion du Redémarrage
        container.querySelector('#sh-btn-restart-server')?.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment redémarrer le serveur Jellyfin ? Toutes les lectures seront momentanément interrompues.')) {
                svc.toaster()?.info?.('Demande de redémarrage envoyée au serveur...');
                const success = await api?.restartServer?.();
                if (success) {
                    svc.toaster()?.success?.('Serveur en cours de redémarrage.');
                } else {
                    svc.toaster()?.error?.('Échec de la demande de redémarrage.');
                }
            }
        });

        // Gestion de l'Arrêt
        container.querySelector('#sh-btn-shutdown-server')?.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment arrêter le serveur Jellyfin ?')) {
                svc.toaster()?.info?.('Arrêt du serveur en cours...');
                await api?.shutdownServer?.();
            }
        });
    }

    // ─── 2. Onglet Transcodage & Accélération GPU ─────────────────────────────

    async _renderEncodingTab(container, modal) {
        const api = svc.jellyfinApi();
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
                svc.toaster()?.success?.('Réglages de transcodage enregistrés !');
            } else {
                svc.toaster()?.error?.('Impossible de sauvegarder le transcodage.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer les Réglages';
        });
    }

    // ─── 3. Onglet Réseau & Ports ─────────────────────────────────────────────

    async _renderNetworkTab(container, modal) {
        const api = svc.jellyfinApi();
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
                svc.toaster()?.success?.('Configuration réseau enregistrée !');
            } else {
                svc.toaster()?.error?.('Échec de l\'enregistrement réseau.');
            }
            btn.disabled = false;
            btn.textContent = 'Enregistrer Réseau';
        });
    }

    // ─── 4. Onglet Gestion des Utilisateurs ───────────────────────────────────

    async _renderUsersTab(container, modal) {
        const api = svc.jellyfinApi();
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
                                        <strong>${this._escape(u.Name || 'Utilisateur')}</strong>
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
        const api = svc.jellyfinApi();
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
                listContainer.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Aucune tâche planifiée trouvée.</p>';
                return;
            }

            listContainer.innerHTML = taskList.map(task => {
                const isRunning = task.State === 'Running';
                const progress = Math.round(task.CurrentProgressPercentage || 0);
                const lastStatus = task.LastExecutionResult?.Status || 'Terminé';
                const category = task.Category || 'Système';

                return `
                    <div class="sh-console-task-row" data-task-id="${this._escape(task.Id)}">
                        <div class="sh-console-task-info">
                            <div class="sh-console-task-title-row">
                                <strong>${this._escape(task.Name || 'Tâche sans nom')}</strong>
                                <span class="sh-console-task-cat">${this._escape(category)}</span>
                                ${isRunning ? `<span class="sh-console-task-badge running"><span class="sh-pulse-dot"></span> En cours (${progress}%)</span>` : `<span class="sh-console-task-badge idle">${this._escape(lastStatus)}</span>`}
                            </div>
                            <small class="sh-console-task-desc">${this._escape(task.Description || 'Aucune description disponible.')}</small>
                            ${isRunning ? `
                                <div class="sh-console-progress-track">
                                    <div class="sh-console-progress-fill" style="width: ${progress}%"></div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="sh-console-task-action">
                            ${isRunning
                                ? `<button class="sh-console-task-btn stop" data-action="stop" data-id="${this._escape(task.Id)}">⏹ Arrêter</button>`
                                : `<button class="sh-console-task-btn start" data-action="start" data-id="${this._escape(task.Id)}">▶ Exécuter</button>`
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
                        svc.toaster()?.info?.('Lancement de la tâche...');
                        await api?.startScheduledTask?.(taskId);
                    } else {
                        svc.toaster()?.info?.('Annulation de la tâche...');
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
        const api = svc.jellyfinApi();
        const logs = await api?.getServerLogs?.() || [];
        this._cachedLogs = logs;

        const defaultLog = logs.length > 0 ? logs[0].Name : '';

        container.innerHTML = `
            <div class="sh-console-logs-wrapper">
                <div class="sh-console-logs-toolbar">
                    <div class="sh-console-logs-select-group">
                        <label for="sh-console-log-file-select" style="font-size: 12px; color: rgba(var(--sh-ink, 255, 255, 255), 0.6); margin-right: 8px;">Fichier :</label>
                        <select class="sh-console-select" id="sh-console-log-file-select">
                            ${logs.map(l => `<option value="${this._escape(l.Name)}">${this._escape(l.Name)} (${this._escape((l.Size / 1024).toFixed(0))} KB)</option>`).join('')}
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
                    <div style="padding: 20px; color: rgba(var(--sh-ink, 255, 255, 255), 0.4); text-align: center;">Chargement du fichier journal...</div>
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
                terminalView.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Aucun fichier log disponible.</p>';
                return;
            }

            terminalView.innerHTML = '<div style="padding: 20px; color: rgba(var(--sh-ink, 255, 255, 255), 0.4);">Lecture du journal en direct...</div>';
            const rawText = await api?.getLogFile?.(fileName);
            this._activeLogContent = rawText;
            renderFormattedLogs();
        };

        const renderFormattedLogs = () => {
            if (!this._activeLogContent) {
                terminalView.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Fichier journal vide.</p>';
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

            terminalView.innerHTML = formattedHtml || '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Aucune ligne correspondante trouvée.</p>';
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
        const api = svc.jellyfinApi();
        const pluginService = svc.jellyfinPlugins();
        const serverPlugins = await pluginService?.list?.({ force: true }) || await api?.getPlugins?.() || [];

        // 1. Intégrations natives SpaceHub (distinctes des plugins Jellyfin)
        const servarrIntegrations = [
            { id: 'sonarr', name: 'Sonarr Series Integration', desc: 'Gestion des séries TV, saisons et calendrier des épisodes', icon: '📺' },
            { id: 'radarr', name: 'Radarr Movies Integration', desc: 'Gestion des films, formats numériques et sorties cinéma', icon: '🎬' },
            { id: 'prowlarr', name: 'Prowlarr Indexers Integration', desc: 'Surveillance des indexeurs BitTorrent et Usenet', icon: '⚡' },
            { id: 'bazarr', name: 'Bazarr Subtitles Sync', desc: 'Recherche et synchronisation automatique des sous-titres FR', icon: '📝' },
            { id: 'jellyseerr', name: 'Jellyseerr Media Requests', desc: 'Hub de découverte TMDB et demandes de streaming', icon: '🍿' },
            { id: 'qbittorrent', name: 'qBittorrent Download Client', desc: 'Supervision des téléchargements et métriques de débit', icon: '📥' }
        ];

        // 2. Vrais Plugins SDK enregistrés dans PluginManager
        const sdkPlugins = svc.sdk()?.getPlugins?.() || [];
        const settings = svc.settings();

        container.innerHTML = gabaritConsoleModules({ ...this, sdkPlugins, servarrIntegrations, serverPlugins, settings, svc });

        // Écouteurs pour les toggles Servarr
        container.querySelectorAll('.sh-servarr-toggle').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const modId = e.currentTarget.dataset.moduleId;
                settings?.set(`${modId}.enabled`, e.currentTarget.checked);
                svc.toaster()?.info?.(`Intégration ${modId} ${e.currentTarget.checked ? 'activée' : 'désactivée'}.`);
            });
        });

        // Actions du catalogue signé (les erreurs restent visibles et aucun succès n'est simulé).
        const catalog = svc.pluginCatalog();
        const catalogAction = async (button, action, successMessage) => {
            button.disabled = true;
            try {
                await action();
                svc.toaster()?.success?.(successMessage);
                await this._renderPluginsTab(container, modal);
            } catch (error) {
                button.disabled = false;
                svc.toaster()?.error?.(error?.message || 'Opération catalogue refusée.');
            }
        };
        container.querySelector('#sh-catalog-load')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            const url = container.querySelector('#sh-catalog-url')?.value?.trim();
            await catalogAction(button, () => catalog.load(url), 'Catalogue signé chargé.');
        });
        container.querySelectorAll('.sh-catalog-approve').forEach(button => button.addEventListener('click', async () => {
            const entry = catalog?.get?.(button.dataset.pluginId);
            await catalogAction(button, () => catalog.approve(button.dataset.pluginId, entry?.permissions || []), 'Plugin approuvé.');
        }));
        container.querySelectorAll('.sh-catalog-install').forEach(button => button.addEventListener('click', async () => {
            const id = button.dataset.pluginId;
            const installed = catalog?.isInstalled?.(id);
            await catalogAction(button, () => installed
                ? svc.sdk()?.updateCatalogPlugin?.(id)
                : svc.sdk()?.installCatalogPlugin?.(id), installed ? 'Plugin mis à jour.' : 'Plugin installé.');
        }));
        container.querySelectorAll('.sh-catalog-rollback').forEach(button => button.addEventListener('click', async () => {
            await catalogAction(button, () => svc.sdk()?.rollbackCatalogPlugin?.(button.dataset.pluginId), 'Plugin restauré.');
        }));
        container.querySelectorAll('.sh-catalog-revoke').forEach(button => button.addEventListener('click', async () => {
            await catalogAction(button, () => catalog.revoke(button.dataset.pluginId), 'Plugin révoqué.');
        }));

        // Écouteurs pour les vrais plugins SDK
        container.querySelectorAll('.sh-sdk-approve').forEach(btn => btn.addEventListener('click', () => {
            const plugin = sdkPlugins.find(item => item.id === btn.dataset.pluginId);
            try {
                svc.sdk()?.approvePluginPermissions(plugin.id, plugin.permissions || []);
                svc.toaster()?.success?.(`Permissions approuvées pour ${plugin.id}.`);
            } catch (error) {
                svc.toaster()?.error?.(error.message);
            }
        }));
        container.querySelectorAll('.sh-sdk-plugin-toggle').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const pluginId = e.currentTarget.dataset.pluginId;
                const isChecked = e.currentTarget.checked;
                const success = isChecked
                    ? await svc.sdk()?.enablePlugin(pluginId)
                    : await svc.sdk()?.disablePlugin(pluginId);
                if (!success && isChecked) {
                    e.currentTarget.checked = false;
                    svc.toaster()?.error?.('Activation refusée : approuvez d’abord les permissions demandées.');
                }
            });
        });

        // Écouteurs pour le plugin de notes (spacehub.ratings)
        const ratingCache = svc.ratingCache();
        const ratingsPlugin = sdkPlugins.find(plugin => plugin.id === 'spacehub.ratings');
        const ratingsStatusEl = container.querySelector('#sh-ratings-plugin-status');
        if (ratingsStatusEl) {
            if (ratingsPlugin) {
                ratingsStatusEl.textContent = ratingsPlugin.isEnabled
                    ? (ratingCache?.hasProvider?.() ? '🟢 Actif — provider OMDb enregistré' : '🟡 Activé — clé OMDb manquante')
                    : '⚪ Désactivé';
            } else {
                ratingsStatusEl.textContent = '⚪ Plugin non enregistré';
            }
        }
        const omdbKeyInput = container.querySelector('#sh-omdb-api-key');
        if (omdbKeyInput && ratingsPlugin) {
            const storage = svc.sdk()?.getPluginStorage?.('spacehub.ratings');
            const savedKey = storage?.get?.('omdbApiKey', '') || '';
            omdbKeyInput.placeholder = savedKey ? 'Clé enregistrée (••••)' : 'Clé API OMDb';
        }
        container.querySelector('#sh-omdb-save-key')?.addEventListener('click', () => {
            const key = omdbKeyInput?.value?.trim();
            const resultEl = container.querySelector('#sh-omdb-test-result');
            if (!key) {
                if (resultEl) resultEl.textContent = '❌ Veuillez saisir une clé API.';
                return;
            }
            try {
                const storage = svc.sdk()?.getPluginStorage?.('spacehub.ratings');
                storage?.set?.('omdbApiKey', key);
                // Purger le cache des notes et rafraîchir les badges déjà montés
                ratingCache?.clear?.();
                document.dispatchEvent(new CustomEvent('spacehub:ratings-updated'));
                if (resultEl) resultEl.textContent = '✅ Clé enregistrée — notes externes rechargées.';
            } catch (error) {
                if (resultEl) resultEl.textContent = `❌ ${error.message}`;
            }
        });
        container.querySelector('#sh-omdb-test')?.addEventListener('click', async () => {
            const resultEl = container.querySelector('#sh-omdb-test-result');
            const key = omdbKeyInput?.value?.trim() || svc.sdk()?.getPluginStorage?.('spacehub.ratings')?.get?.('omdbApiKey', '');
            if (!key) {
                if (resultEl) resultEl.textContent = '❌ Saisissez d’abord une clé API.';
                return;
            }
            if (resultEl) resultEl.textContent = '⏳ Test en cours…';
            const result = await ratingCache?.testConnection?.(key);
            if (resultEl) {
                resultEl.textContent = result?.ok
                    ? `✅ Connexion OK — « ${result.title} » : IMDb ${result.imdb ?? '—'}, RT ${result.rt ?? '—'}%, Metacritic ${result.metacritic ?? '—'}`
                    : `❌ ${result?.error || 'Test échoué.'}`;
            }
        });
        // Clé TMDB (textes de critiques réels) — enregistrement + test réel
        const tmdbKeyInput = container.querySelector('#sh-tmdb-api-key');
        if (tmdbKeyInput) {
            const tmdbStorage = svc.sdk()?.getPluginStorage?.('spacehub.ratings');
            const savedTmdb = tmdbStorage?.get?.('tmdbApiKey', '') || '';
            tmdbKeyInput.placeholder = savedTmdb ? 'Clé TMDB enregistrée (••••)' : tmdbKeyInput.placeholder;
        }
        container.querySelector('#sh-tmdb-save-key')?.addEventListener('click', () => {
            const resultEl = container.querySelector('#sh-tmdb-test-result');
            const key = tmdbKeyInput?.value?.trim();
            if (!key) {
                if (resultEl) resultEl.textContent = '❌ Veuillez saisir une clé TMDB.';
                return;
            }
            try {
                svc.sdk()?.getPluginStorage?.('spacehub.ratings')?.set?.('tmdbApiKey', key);
                ratingCache?.clear?.();
                document.dispatchEvent(new CustomEvent('spacehub:ratings-updated'));
                if (resultEl) resultEl.textContent = '✅ Clé TMDB enregistrée — textes de critiques activés.';
                if (tmdbKeyInput) tmdbKeyInput.value = '';
            } catch (error) {
                if (resultEl) resultEl.textContent = `❌ ${error.message}`;
            }
        });
        container.querySelector('#sh-tmdb-test')?.addEventListener('click', async () => {
            const resultEl = container.querySelector('#sh-tmdb-test-result');
            const key = tmdbKeyInput?.value?.trim() || svc.sdk()?.getPluginStorage?.('spacehub.ratings')?.get?.('tmdbApiKey', '');
            if (!key) {
                if (resultEl) resultEl.textContent = '❌ Saisissez d’abord une clé TMDB.';
                return;
            }
            if (resultEl) resultEl.textContent = '⏳ Test en cours…';
            const result = await ratingCache?.testTmdbConnection?.(key);
            if (resultEl) {
                resultEl.textContent = result?.ok
                    ? `✅ Connexion TMDB OK — « ${result.title} »`
                    : `❌ ${result?.error || 'Test échoué.'}`;
            }
        });

        const providerCheckboxes = container.querySelectorAll('.sh-ratings-provider');
        const currentProviders = ratingCache?.getProviderFilter?.() || [];
        providerCheckboxes.forEach(chk => { chk.checked = currentProviders.includes(chk.value); });
        container.querySelector('#sh-ratings-save-providers')?.addEventListener('click', () => {
            const selected = [...container.querySelectorAll('.sh-ratings-provider:checked')].map(chk => chk.value);
            const resultEl = container.querySelector('#sh-ratings-save-result');
            if (selected.length === 0) {
                if (resultEl) resultEl.textContent = '❌ Sélectionnez au moins un fournisseur.';
                return;
            }
            try {
                settings?.set('ratings.display.providers', selected);
                if (resultEl) resultEl.textContent = `✅ Fournisseurs enregistrés : ${selected.join(', ')}`;
            } catch (error) {
                if (resultEl) resultEl.textContent = `❌ ${error.message}`;
            }
        });

        container.querySelectorAll('.sh-server-plugin-config').forEach(btn => btn.addEventListener('click', async () => {
            try {
                const pluginId = btn.dataset.pluginId;
                const config = await pluginService.getConfiguration(pluginId);
                const safeConfig = pluginService.redactConfiguration(config);
                const edited = prompt('Configuration JSON du plugin (les secrets sont masqués et conservés si inchangés) :', JSON.stringify(safeConfig, null, 2));
                if (edited === null) return;
                const parsed = JSON.parse(edited);
                await pluginService.saveConfiguration(pluginId, pluginService.mergeRedactedConfiguration(config, parsed));
                svc.toaster()?.success?.('Configuration envoyée à Jellyfin.');
            } catch (error) {
                svc.toaster()?.error?.(`Configuration refusée : ${error.message}`);
            }
        }));
    }

    // ─── Styles VisionOS Immersifs Sans Bug d'Affichage ────────────────────────

    destroy() {
        if (this._taskPollTimer) {
            clearInterval(this._taskPollTimer);
            this._taskPollTimer = null;
        }
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        this._modal?.remove();
        this._modal = null;
    }

    _escape(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans JellyfinConsoleModal.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default JellyfinConsoleModal;
