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
        // Zone de déclenchement invisible sur le bord gauche de l'écran (20px)
        const triggerZone = document.createElement('div');
        triggerZone.className = 'sh-sidebar-trigger-zone';
        triggerZone.id = 'sh-sidebar-trigger-zone';

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

                <div class="sh-sidebar-scroll-area sh-scrollbar">
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

        // Backdrop
        this._backdropEl = document.createElement('div');
        this._backdropEl.className = 'sh-sidebar-backdrop';
        this._backdropEl.addEventListener('click', () => this.closeMobile());

        container.appendChild(triggerZone);
        container.appendChild(this._drawerEl);
        container.appendChild(this._backdropEl);

        this._bindEvents(triggerZone);
    }

    _bindEvents(triggerZone) {
        // Déclenchement automatique au survol du bord gauche de l'écran
        triggerZone?.addEventListener('mouseenter', () => {
            this._drawerEl.classList.add('sh-sidebar-revealed');
        });

        this._drawerEl.addEventListener('mouseleave', () => {
            this._drawerEl.classList.remove('sh-sidebar-revealed');
        });

        this._drawerEl.querySelectorAll('.sh-sidebar-item, .sh-sidebar-brand').forEach(btn => {
            btn.addEventListener('click', () => {
                const nav = btn.dataset.nav;
                if (nav && this._router) {
                    this._drawerEl.querySelectorAll('.sh-sidebar-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._router.navigate(nav);
                    this._drawerEl.classList.remove('sh-sidebar-revealed');
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
        this._drawerEl.classList.remove('sh-sidebar-revealed');
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
/* Zone de détection invisible sur le bord gauche de l'écran (18px) */
.sh-sidebar-trigger-zone {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 18px;
    z-index: 99998;
    background: transparent;
}

/* Barre latérale Monochromique 100% masquée par défaut */
.sh-glass-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    background: rgba(8, 8, 12, 0.92);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 99999;
    transform: translateX(-100%);
    transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
    box-shadow: none;
}

/* Glisse en douceur à l'écran dès que la souris entre dans la zone ou sur la sidebar */
.sh-glass-sidebar.sh-sidebar-revealed,
.sh-glass-sidebar:hover {
    transform: translateX(0);
    box-shadow: 20px 0 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(255, 255, 255, 0.05);
}

.sh-sidebar-inner {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.sh-sidebar-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px 22px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
}

.sh-sidebar-logo-icon {
    font-size: 24px;
    filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.5));
}

.sh-sidebar-logo-text {
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #ffffff;
    white-space: nowrap;
}

.sh-sidebar-logo-text span {
    color: var(--sh-color-primary, #ffffff);
    opacity: 0.85;
}

.sh-sidebar-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 14px;
    display: flex;
    flex-direction: column;
    gap: 22px;
}

.sh-sidebar-section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.8px;
    color: rgba(255, 255, 255, 0.35);
    padding: 0 12px 6px 12px;
    white-space: nowrap;
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
    padding: 11px 14px;
    border-radius: 10px;
    background: transparent;
    border: 1px solid transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
    width: 100%;
    text-align: left;
    white-space: nowrap;
}

.sh-sidebar-item:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    transform: translateX(4px);
}

.sh-sidebar-item.active {
    background: #ffffff;
    color: #050505;
    font-weight: 800;
    box-shadow: 0 4px 20px rgba(255, 255, 255, 0.25);
    border-color: #ffffff;
}

.sh-sb-icon {
    font-size: 18px;
    min-width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-sb-label {
    flex: 1;
}

/* Mobile & Tablettes */
@media (max-width: 991px) {
    .sh-glass-sidebar.open-mobile {
        transform: translateX(0);
    }
    .sh-sidebar-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(6px);
        z-index: 99990;
        display: none;
    }
    .sh-sidebar-backdrop.active {
        display: block;
    }
        `;
        document.head.appendChild(style);
    }
}

export default AppSidebarDrawer;
