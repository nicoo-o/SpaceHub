/**
 * SpaceHub — Modern Floating Glass Sidebar & Hub Drawer
 * Version: 1.0.0
 *
 * Barre latérale intelligente multi-plateforme :
 * - Sur PC (Desktop) : Barre rétractée ultra-fine (60px) qui s'étend en douceur au survol (hover 260px) avec effet de verre acrylique (backdrop-blur)
 * - Sur Mobile (GSM) : Tiroir coulissant déclenché par un bouton dédié dans le header
 * - Sur TV : Focusable à la télécommande (D-Pad Gauche)
 *
 * Organise les 16 fonctionnalités en 4 Grands Hubs limpides :
 * 1. 🍿 Divertissement (Films, Séries, Live TV, Musique, Photos, Ma Liste, Historique, Rewind)
 * 2. ⚙️ Automatisation (Servarr Pro, Téléchargements, Calendrier, Recyclarr)
 * 3. 🛡️ Système & Domotique (Admin Cockpit NOC, Domotique Cinéma & Ambilight)
 * 4. ♿ Personnalisation (Accessibilité, Thèmes, Extensions)
 */

'use strict';

class AppSidebarDrawer {
    constructor(router) {
        this._router = router;
        this._isOpenMobile = false;
        this._drawerEl = null;
        this._backdropEl = null;

        this._injectStyles();
    }

    render(container) {
        this._drawerEl = document.createElement('aside');
        this._drawerEl.className = 'sh-glass-sidebar';
        this._drawerEl.id = 'sh-glass-sidebar';

        this._drawerEl.innerHTML = `
            <div class="sh-sidebar-inner">
                <!-- Header Sidebar -->
                <div class="sh-sidebar-brand" data-nav="/">
                    <span class="sh-sidebar-logo-icon">🚀</span>
                    <span class="sh-sidebar-logo-text">Space<span>Hub</span></span>
                </div>

                <div class="sh-sidebar-scroll-area">
                    <!-- HUB 1 : DIVERTISSEMENT -->
                    <div class="sh-sidebar-section">
                        <div class="sh-sidebar-section-title">DIVERTISSEMENT</div>
                        <nav class="sh-sidebar-nav">
                            <button class="sh-sidebar-item active" data-nav="/">
                                <span class="sh-sb-icon">🏠</span>
                                <span class="sh-sb-label">Accueil</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/library">
                                <span class="sh-sb-icon">📚</span>
                                <span class="sh-sb-label">Bibliothèques</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/livetv">
                                <span class="sh-sb-icon">📺</span>
                                <span class="sh-sb-label">Live TV & EPG</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/watchlist">
                                <span class="sh-sb-icon">📋</span>
                                <span class="sh-sb-label">Ma Liste</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/photos">
                                <span class="sh-sb-icon">🖼️</span>
                                <span class="sh-sb-label">Photos Immich</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/history">
                                <span class="sh-sb-icon">🕰️</span>
                                <span class="sh-sb-label">Historique</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/rewind">
                                <span class="sh-sb-icon">✨</span>
                                <span class="sh-sb-label">SpaceHub Rewind</span>
                            </button>
                        </nav>
                    </div>

                    <!-- HUB 2 : AUTOMATISATION -->
                    <div class="sh-sidebar-section">
                        <div class="sh-sidebar-section-title">AUTOMATISATION</div>
                        <nav class="sh-sidebar-nav">
                            <button class="sh-sidebar-item" data-nav="/servarr">
                                <span class="sh-sb-icon">⚙️</span>
                                <span class="sh-sb-label">Servarr Pro & Recyclarr</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/downloads">
                                <span class="sh-sb-icon">📥</span>
                                <span class="sh-sb-label">Téléchargements & Offline</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/calendar">
                                <span class="sh-sb-icon">📅</span>
                                <span class="sh-sb-label">Calendrier Sorties</span>
                            </button>
                        </nav>
                    </div>

                    <!-- HUB 3 : SYSTÈME & DOMOTIQUE -->
                    <div class="sh-sidebar-section">
                        <div class="sh-sidebar-section-title">SYSTÈME & CONTRÔLE</div>
                        <nav class="sh-sidebar-nav">
                            <button class="sh-sidebar-item" data-nav="/admin">
                                <span class="sh-sb-icon">🛡️</span>
                                <span class="sh-sb-label">Admin Cockpit NOC</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/domotics">
                                <span class="sh-sb-icon">💡</span>
                                <span class="sh-sb-label">Domotique & Ambilight</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/management">
                                <span class="sh-sb-icon">🔧</span>
                                <span class="sh-sb-label">Configuration Globale</span>
                            </button>
                        </nav>
                    </div>

                    <!-- HUB 4 : PERSONNALISATION -->
                    <div class="sh-sidebar-section">
                        <div class="sh-sidebar-section-title">PERSONNALISATION</div>
                        <nav class="sh-sidebar-nav">
                            <button class="sh-sidebar-item" data-nav="/accessibility">
                                <span class="sh-sb-icon">♿</span>
                                <span class="sh-sb-label">Accessibilité</span>
                            </button>
                            <button class="sh-sidebar-item" data-nav="/extensions">
                                <span class="sh-sb-icon">🧩</span>
                                <span class="sh-sb-label">Extensions & Thèmes</span>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        `;

        // Backdrop mobile
        this._backdropEl = document.createElement('div');
        this._backdropEl.className = 'sh-sidebar-backdrop';
        this._backdropEl.addEventListener('click', () => this.closeMobile());

        container.appendChild(this._drawerEl);
        container.appendChild(this._backdropEl);

        this._bindEvents();
    }

    _bindEvents() {
        this._drawerEl.querySelectorAll('.sh-sidebar-item, .sh-sidebar-brand').forEach(btn => {
            btn.addEventListener('click', () => {
                const nav = btn.dataset.nav;
                if (nav && this._router) {
                    this._drawerEl.querySelectorAll('.sh-sidebar-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._router.navigate(nav);
                    this.closeMobile();
                }
            });
        });
    }

    toggleMobile() {
        this._isOpenMobile = !this._isOpenMobile;
        this._drawerEl.classList.toggle('open-mobile', this._isOpenMobile);
        this._backdropEl.classList.toggle('active', this._isOpenMobile);
    }

    closeMobile() {
        this._isOpenMobile = false;
        this._drawerEl.classList.remove('open-mobile');
        this._backdropEl.classList.remove('active');
    }

    setActiveNav(path) {
        this._drawerEl?.querySelectorAll('.sh-sidebar-item').forEach(btn => {
            const isMatch = btn.dataset.nav === path || (path === '' && btn.dataset.nav === '/');
            btn.classList.toggle('active', isMatch);
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-sidebar-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-sidebar-styles';
        style.textContent = `
/* Floating Glass Sidebar (Desktop Hover-Expandable) */
.sh-glass-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 68px; /* État réduit sur PC */
    background: rgba(10, 10, 15, 0.75);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 10000;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
    overflow: hidden;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
}

/* Extension fluide au survol de la souris sur PC */
@media (min-width: 992px) {
    .sh-glass-sidebar:hover {
        width: 270px; /* État étendu */
        box-shadow: 10px 0 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(124, 106, 255, 0.15);
    }
}

.sh-sidebar-inner {
    width: 270px;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.sh-sidebar-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 18px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
}

.sh-sidebar-logo-icon {
    font-size: 24px;
    filter: drop-shadow(0 0 10px rgba(124, 106, 255, 0.8));
}

.sh-sidebar-logo-text {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #fff;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s ease 0.1s;
}

.sh-glass-sidebar:hover .sh-sidebar-logo-text {
    opacity: 1;
}

.sh-sidebar-logo-text span {
    color: var(--sh-color-primary, #7c6aff);
}

.sh-sidebar-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.sh-sidebar-section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(255, 255, 255, 0.35);
    padding: 0 10px 6px 10px;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.sh-glass-sidebar:hover .sh-sidebar-section-title {
    opacity: 1;
}

.sh-sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sh-sidebar-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 14px;
    border-radius: 10px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    text-align: left;
    white-space: nowrap;
}

.sh-sidebar-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    transform: translateX(3px);
}

.sh-sidebar-item.active {
    background: var(--sh-color-primary, #7c6aff);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(124, 106, 255, 0.4);
}

.sh-sb-icon {
    font-size: 18px;
    min-width: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-sb-label {
    opacity: 0;
    transition: opacity 0.2s ease;
}

.sh-glass-sidebar:hover .sh-sb-label {
    opacity: 1;
}

/* Version Mobile (GSM) et TV */
@media (max-width: 991px) {
    .sh-glass-sidebar {
        transform: translateX(-100%);
        width: 280px;
    }
    .sh-glass-sidebar.open-mobile {
        transform: translateX(0);
    }
    .sh-sidebar-logo-text, .sh-sidebar-section-title, .sh-sb-label {
        opacity: 1 !important;
    }
    .sh-sidebar-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 9999;
        display: none;
    }
    .sh-sidebar-backdrop.active {
        display: block;
    }
}
        `;
        document.head.appendChild(style);
    }
}

export default AppSidebarDrawer;
