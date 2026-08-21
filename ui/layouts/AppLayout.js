/**
 * SpaceHub — App Layout Shell
 * Version: 1.0.0
 *
 * Conteneur principal de l'application cliente autonome SpaceHub.
 * Fournit la barre de navigation supérieure, le menu utilisateur et le commutateur de vues.
 */

'use strict';

import Logger from '../../core/Logger.js';
import Router from '../../core/Router.js';

// Navigation principale : id interne, chemin de route, libellé affiché.
// Le "path" pilote le hash de l'URL (#/downloads, etc.) — voir core/Router.js.
const NAV_ITEMS = [
    { id: 'dashboard',   path: '/',            label: '🏠 Accueil' },
    { id: 'library',     path: '/library',     label: '📚 Bibliothèques' },
    { id: 'downloads',   path: '/downloads',   label: '📥 Downloads' },
    { id: 'calendar',    path: '/calendar',    label: '📅 Calendar' },
    { id: 'management',  path: '/management',  label: '⚙️ Management' },
    { id: 'livetv',      path: '/livetv',      label: '📺 Live TV' },
    { id: 'watchlist',   path: '/watchlist',   label: '📋 Ma Liste' },
    { id: 'photos',      path: '/photos',      label: '🖼️ Photos' },
    { id: 'history',     path: '/history',     label: '🕰️ Historique' },
    { id: 'extensions',  path: '/extensions',  label: '🧩 Extensions' },
];

class AppLayout {
    constructor() {
        this._log = new Logger('AppLayout');
        this._currentNavId = 'dashboard';
        this._router = new Router();
        this._views = {}; // Cache pour les instances de vues lazy-loadées

        // Exposé pour que les vues (ex: les onglets de ManagementView) puissent
        // naviguer sans avoir à remonter jusqu'à l'instance AppLayout.
        if (window.SpaceHub) window.SpaceHub.router = this._router;

        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    render(container) {
        const user = this._auth?.getUser();
        const serverUrl = this._auth?.getServerUrl();

        container.innerHTML = `
            <div class="sh-app-shell">
                <!-- Header / Barre de navigation -->
                <header class="sh-app-header">
                    <div class="sh-app-header__left">
                        <div class="sh-app-logo" data-navigate="dashboard">
                            <span class="sh-app-logo__icon">🚀</span>
                            <span class="sh-app-logo__text">SpaceHub</span>
                        </div>
                        <nav class="sh-app-nav">
                            ${NAV_ITEMS.map(item => `
                                <button class="sh-app-nav__link ${this._currentNavId === item.id ? 'active' : ''}" data-nav-id="${item.id}" data-path="${item.path}">
                                    ${item.label}
                                </button>
                            `).join('')}
                        </nav>
                    </div>

                    <div class="sh-app-header__right">
                        <button class="sh-btn sh-btn--ghost sh-header-search-btn" id="sh-btn-quick-search" title="Recherche rapide (Ctrl+K)">
                            <span>🔍</span>
                            <span class="sh-header-search-txt">Rechercher...</span>
                            <kbd>Ctrl+K</kbd>
                        </button>

                        <button class="sh-btn sh-btn--ghost" id="sh-btn-theme-toggle" title="Changer de thème">
                            🎨
                        </button>

                        <button class="sh-btn sh-btn--ghost" id="sh-btn-open-settings" title="Réglages SpaceHub">
                            ⚙️
                        </button>

                        <!-- Menu Utilisateur -->
                        <div class="sh-user-menu-wrapper">
                            <button class="sh-user-avatar-btn" id="sh-user-menu-btn" title="${user?.Name || 'Utilisateur'}">
                                <span>👤</span>
                                <span class="sh-user-name">${user?.Name || 'Utilisateur'}</span>
                            </button>
                            <div class="sh-user-dropdown" id="sh-user-dropdown" style="display:none;">
                                <div class="sh-user-dropdown__header">
                                    <strong>${user?.Name || 'Utilisateur'}</strong>
                                    <span class="sh-user-server sh-truncate">${serverUrl}</span>
                                </div>
                                <hr style="border:none; border-top:1px solid var(--sh-border-color); margin:8px 0;"/>
                                <button class="sh-user-dropdown__item" id="sh-btn-logout">
                                    🚪 Déconnexion
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Zone de contenu principale -->
                <main class="sh-app-main" id="sh-main-view-container"></main>

                <!-- Mini-Player Persistant -->
                <div id="sh-mini-player-container"></div>
            </div>
        `;

        this._bindHeaderEvents(container);
        this._setupRoutes();
        this._renderMiniPlayer();
        this._router.start('/');
    }

    _renderMiniPlayer() {
        const container = document.getElementById('sh-mini-player-container');
        if (!container) return;

        container.innerHTML = `
            <div class="sh-mini-player" style="display:none;">
                <div class="sh-mini-player__turntable">
                    <div class="sh-vinyl-record">
                        <img class="sh-mini-player__cover" src="" alt="">
                    </div>
                </div>
                <div class="sh-mini-player__info">
                    <div class="sh-mini-player__meta">
                        <span class="sh-mini-player__title"></span>
                        <span class="sh-mini-player__artist"></span>
                    </div>
                </div>
                <div class="sh-mini-player__controls">
                    <button class="sh-mini-player__btn sh-mini-prev">⏮</button>
                    <button class="sh-mini-player__btn sh-mini-toggle">▶</button>
                    <button class="sh-mini-player__btn sh-mini-next">⏭</button>
                </div>
                <div class="sh-mini-player__progress-wrap">
                    <div class="sh-mini-player__bar"><div class="sh-mini-player__fill"></div></div>
                </div>
            </div>
        `;

        const player = container.querySelector('.sh-mini-player');
        const vinyl = container.querySelector('.sh-vinyl-record');
        const eb = window.SpaceHub?.core?.eventBus;

        eb.on('audio:changed', (state) => {
            player.style.display = 'flex';
            player.querySelector('.sh-mini-player__title').textContent = state.item.Name;
            player.querySelector('.sh-mini-player__artist').textContent = state.item.Artists?.join(', ') || 'Artiste inconnu';

            const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');
            const cover = player.querySelector('.sh-mini-player__cover');
            cover.src = jellyfin.getImageUrl(state.item.Id, 'Primary', { maxWidth: 100 });

            if (state.isPlaying) vinyl.classList.add('spinning');
            else vinyl.classList.remove('spinning');
        });

        eb.on('audio:play', () => {
            player.querySelector('.sh-mini-toggle').textContent = '⏸';
            vinyl.classList.add('spinning');
        });

        eb.on('audio:pause', () => {
            player.querySelector('.sh-mini-toggle').textContent = '▶';
            vinyl.classList.remove('spinning');
        });

        eb.on('audio:timeupdate', (state) => {
            const pct = (state.currentTime / state.duration) * 100;
            player.querySelector('.sh-mini-player__fill').style.width = `${pct}%`;
        });

        player.querySelector('.sh-mini-toggle').addEventListener('click', () => window.SpaceHub.audio.toggle());
        player.querySelector('.sh-mini-prev').addEventListener('click', () => window.SpaceHub.audio.previous());
        player.querySelector('.sh-mini-next').addEventListener('click', () => window.SpaceHub.audio.next());
    }

    _bindHeaderEvents(container) {
        // Navigation logo et liens
        container.querySelector('[data-navigate="dashboard"]')?.addEventListener('click', () => this._router.navigate('/'));

        container.querySelectorAll('[data-nav-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._router.navigate(btn.dataset.path);
            });
        });

        // Recherche rapide
        container.querySelector('#sh-btn-quick-search')?.addEventListener('click', () => {
            window.SpaceHub?.jellyfin?.search?.open();
        });

        // Toggle thème
        container.querySelector('#sh-btn-theme-toggle')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.themes?.next();
        });

        // Réglages
        container.querySelector('#sh-btn-open-settings')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.settingsPanel?.open();
        });

        // Dropdown utilisateur
        const userBtn = container.querySelector('#sh-user-menu-btn');
        const dropdown = container.querySelector('#sh-user-dropdown');

        userBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            if (dropdown) dropdown.style.display = 'none';
        });

        // Déconnexion
        container.querySelector('#sh-btn-logout')?.addEventListener('click', () => {
            this._auth?.logout();
        });
    }

    /**
     * Enregistre chaque route auprès du Router. Chaque handler met à jour
     * this._currentNavId (pour l'état actif des onglets) puis délègue le
     * rendu réel à _renderView().
     */
    _setupRoutes() {
        for (const item of NAV_ITEMS) {
            this._router.register(item.path, (subpath) => {
                this._currentNavId = item.id;
                this._renderView(item.id, subpath);
            });
        }
        this._router.setNotFound(() => this._router.navigate('/'));
    }

    /**
     * @param {string} navId
     * @param {string|null} subpath - ex: 'sonarr' pour /management/sonarr
     */
    async _renderView(navId, subpath) {
        const container = document.querySelector('#sh-main-view-container');
        if (!container) return;

        // Mise à jour de l'état actif des onglets
        document.querySelectorAll('.sh-app-nav__link').forEach(link => {
            link.classList.toggle('active', link.dataset.navId === navId);
        });

        container.innerHTML = '';

        try {
            if (navId === 'dashboard') {
                await window.SpaceHub?.ui?.dashboard?.render(container);
                return;
            }

            // Lazy-loading de la vue demandée
            if (!this._views[navId]) {
                this._log.info(`Lazy-loading de la vue : ${navId}`);
                let ViewClass;
                switch (navId) {
                    case 'library':
                        ViewClass = (await import('../views/LibraryView.js')).default;
                        break;
                    case 'downloads':
                        ViewClass = (await import('../views/DownloadsView.js')).default;
                        break;
                    case 'calendar':
                        ViewClass = (await import('../views/CalendarView.js')).default;
                        break;
                    case 'management':
                        ViewClass = (await import('../views/ManagementView.js')).default;
                        break;
                    case 'extensions':
                        ViewClass = (await import('../views/ExtensionsView.js')).default;
                        break;
                    case 'photos':
                        ViewClass = (await import('../views/photos/PhotosView.js')).default;
                        break;
                    case 'livetv':
                        ViewClass = (await import('../views/livetv/LiveTvView.js')).default;
                        break;
                    case 'watchlist':
                        ViewClass = (await import('../views/watchlist/WatchlistView.js')).default;
                        break;
                    case 'history':
                        ViewClass = (await import('../views/ActivityHistoryView.js')).default;
                        break;
                    default:
                        throw new Error(`Vue inconnue : ${navId}`);
                }
                this._views[navId] = new ViewClass();
            }

            await this._views[navId].render(container, subpath);
        } catch (err) {
            this._log.error(`Erreur lors du rendu de la vue "${navId}":`, err);
            container.innerHTML = `<div style="padding:48px;text-align:center;color:var(--sh-color-danger,#ff5c7a);">Erreur lors du chargement de cette page.</div>`;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-layout-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-layout-styles';
        style.textContent = `
.sh-app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.sh-app-header {
    height: 64px;
    background: var(--sh-bg-glass, rgba(24, 24, 31, 0.82));
    backdrop-filter: var(--sh-bg-glass-blur, blur(14px));
    border-bottom: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--sh-space-6, 24px);
    position: sticky;
    top: 0;
    z-index: var(--sh-z-sticky, 200);
}

.sh-app-header__left,
.sh-app-header__right {
    display: flex;
    align-items: center;
    gap: var(--sh-space-4, 16px);
}

.sh-app-logo {
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    cursor: pointer;
}

.sh-app-logo__icon {
    font-size: 24px;
}

.sh-app-logo__text {
    font-size: var(--sh-text-xl, 24px);
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #fff, var(--sh-color-primary, #7c6aff));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.sh-app-nav {
    display: flex;
    gap: var(--sh-space-2, 8px);
    margin-left: var(--sh-space-4, 16px);
}

.sh-app-nav__link {
    background: transparent;
    border: none;
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    border-radius: var(--sh-radius-sm, 8px);
    color: var(--sh-text-secondary, #9898b8);
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
}

.sh-app-nav__link:hover {
    color: var(--sh-text-primary, #f0f0f8);
    background: var(--sh-bg-surface-2, #22222e);
}

.sh-app-nav__link.active {
    color: var(--sh-text-on-primary, #fff);
    background: var(--sh-color-primary, #7c6aff);
}

.sh-header-search-btn {
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    padding: 6px 12px;
    background: var(--sh-bg-surface-2, #22222e);
}

.sh-header-search-btn kbd {
    font-size: 10px;
    background: var(--sh-bg-surface-3, #2e2e3d);
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--sh-text-muted);
}

.sh-user-menu-wrapper {
    position: relative;
}

.sh-user-avatar-btn {
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-full, 9999px);
    padding: 4px 12px 4px 6px;
    color: var(--sh-text-primary, #f0f0f8);
    cursor: pointer;
}

.sh-user-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 220px;
    background: var(--sh-bg-surface, #18181f);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    box-shadow: var(--sh-shadow-lg, 0 12px 40px rgba(0,0,0,0.6));
    padding: var(--sh-space-3, 12px);
    z-index: var(--sh-z-dropdown, 100);
}

.sh-user-server {
    display: block;
    font-size: 11px;
    color: var(--sh-text-muted, #5c5c7a);
    margin-top: 2px;
}

.sh-user-dropdown__item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 8px 10px;
    border-radius: var(--sh-radius-sm, 8px);
    color: var(--sh-color-danger, #ff5c7a);
    font-size: var(--sh-text-sm, 13px);
    cursor: pointer;
    transition: background 0.15s;
}

.sh-user-dropdown__item:hover {
    background: rgba(255, 92, 122, 0.1);
}

.sh-app-main {
    flex: 1;
}

#sh-mini-player-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 500;
}

.sh-mini-player {
    height: 72px;
    background: var(--sh-bg-glass, rgba(24, 24, 31, 0.9));
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--sh-border-color);
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 32px;
}

.sh-mini-player__turntable {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-vinyl-record {
    width: 56px;
    height: 56px;
    background: #111;
    border-radius: 50%;
    border: 2px solid #222;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.05);
}

.sh-vinyl-record::before {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.05);
}

.sh-vinyl-record::after {
    content: '';
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--sh-bg-surface);
    border-radius: 50%;
    z-index: 2;
}

.sh-mini-player__cover {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    z-index: 1;
}

.spinning {
    animation: rotate-vinyl 3s linear infinite;
}

@keyframes rotate-vinyl {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.sh-mini-player__info {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 240px;
}

.sh-mini-player__cover {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    object-fit: cover;
}

.sh-mini-player__meta {
    display: flex;
    flex-direction: column;
}

.sh-mini-player__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--sh-text-primary);
}

.sh-mini-player__artist {
    font-size: 12px;
    color: var(--sh-text-muted);
}

.sh-mini-player__controls {
    display: flex;
    align-items: center;
    gap: 16px;
}

.sh-mini-player__btn {
    background: transparent;
    border: none;
    color: var(--sh-text-primary);
    font-size: 20px;
    cursor: pointer;
    transition: transform 0.2s;
}

.sh-mini-player__btn:hover {
    transform: scale(1.1);
}

.sh-mini-toggle {
    width: 40px;
    height: 40px;
    background: var(--sh-color-primary);
    border-radius: 50%;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-mini-player__progress-wrap {
    flex: 1;
}

.sh-mini-player__bar {
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    position: relative;
}

.sh-mini-player__fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--sh-color-primary);
    border-radius: 2px;
}
        `;
        document.head.appendChild(style);
    }
}

export default AppLayout;
