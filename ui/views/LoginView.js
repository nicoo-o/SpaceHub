/**
 * SpaceHub — Login View
 * Version: 2.0.0 — Apple TV / VisionOS Premium
 *
 * Écran de connexion immersif OLED avec fond nébuleuse, carte glass,
 * champs dark glass, bouton pill blanc animé et états de chargement premium.
 */

'use strict';

class LoginView {
    constructor(onLoginSuccess) {
        this.onLoginSuccess = onLoginSuccess;
        this._injectStyles();
    }

    render(container) {
        container.innerHTML = `
            <div class="sh-login-wrapper">
                <!-- Fond Nébuleuse Spatiale OLED -->
                <div class="sh-login-nebula" aria-hidden="true">
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--1"></div>
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--2"></div>
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--3"></div>
                </div>

                <!-- Carte Glass -->
                <div class="sh-login-card">
                    <!-- Logo -->
                    <div class="sh-login-header">
                        <div class="sh-login-brand">
                            <div class="sh-login-luminous-dot" title="SpaceHub Active">
                                <div class="sh-login-dot-core"></div>
                            </div>
                            <svg class="sh-login-rocket" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                            </svg>
                            <span class="sh-login-brand-name">SpaceHub</span>
                        </div>
                        <p class="sh-login-subtitle">Connectez-vous à votre serveur Jellyfin</p>
                    </div>

                    <!-- Formulaire -->
                    <form class="sh-login-form" id="sh-login-form" novalidate>
                        <div class="sh-login-field">
                            <label for="server-url">URL du Serveur</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="2" y1="12" x2="22" y2="12"></line>
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                </svg>
                                <input type="url" id="server-url" class="sh-input sh-login-input" placeholder="http://192.168.1.100:8096" value="http://localhost:8096" required />
                            </div>
                        </div>

                        <div class="sh-login-field">
                            <label for="username">Nom d'utilisateur</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <input type="text" id="username" class="sh-input sh-login-input" placeholder="Votre identifiant" required autofocus autocomplete="username" />
                            </div>
                        </div>

                        <div class="sh-login-field">
                            <label for="password">Mot de passe</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <input type="password" id="password" class="sh-input sh-login-input" placeholder="Mot de passe (optionnel)" autocomplete="current-password" />
                            </div>
                        </div>

                        <!-- Erreur -->
                        <div class="sh-login-error" id="sh-login-error" style="display:none;" role="alert"></div>

                        <!-- Bouton Connexion -->
                        <button type="submit" class="sh-login-btn" id="sh-login-btn">
                            <span class="sh-login-btn__content" id="sh-login-btn-content">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                                </svg>
                                <span>Se connecter</span>
                            </span>
                            <span class="sh-login-btn__loading" id="sh-login-btn-loading" style="display:none;">
                                <svg class="sh-login-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
                                </svg>
                                <span>Connexion...</span>
                            </span>
                        </button>
                    </form>
                </div>
            </div>
        `;

        const form    = container.querySelector('#sh-login-form');
        const btn     = container.querySelector('#sh-login-btn');
        const errorEl = container.querySelector('#sh-login-error');
        const content = container.querySelector('#sh-login-btn-content');
        const loading = container.querySelector('#sh-login-btn-loading');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serverUrl = container.querySelector('#server-url').value.trim();
            const username  = container.querySelector('#username').value.trim();
            const password  = container.querySelector('#password').value;

            btn.disabled     = true;
            content.style.display = 'none';
            loading.style.display  = 'flex';
            errorEl.style.display  = 'none';

            const auth = window.SpaceHub?.auth;
            const res  = await auth.login(serverUrl, username, password);

            if (res.success) {
                // Succès — animation de validation
                loading.style.display = 'none';
                content.style.display = 'flex';
                btn.classList.add('sh-login-btn--success');
                this.onLoginSuccess?.(res.user);
            } else {
                errorEl.textContent      = res.error || 'Erreur lors de la connexion.';
                errorEl.style.display    = 'block';
                btn.disabled             = false;
                content.style.display   = 'flex';
                loading.style.display   = 'none';
                // Shake sur erreur
                const card = container.querySelector('.sh-login-card');
                card.classList.add('sh-login-card--shake');
                setTimeout(() => card.classList.remove('sh-login-card--shake'), 500);
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-login-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-login-styles';
        style.textContent = `
/* ── Fond OLED + Nébuleuse ───────────────────────────────────── */
.sh-login-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #000000;
    overflow: hidden;
    padding: 24px;
    box-sizing: border-box;
}

.sh-login-nebula {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
}

.sh-login-nebula__orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0;
    animation: sh-login-orb-pulse 8s ease-in-out infinite;
}
.sh-login-nebula__orb--1 {
    width: 500px; height: 500px;
    top: -150px; left: -100px;
    background: radial-gradient(circle, rgba(80, 60, 180, 0.35), transparent 70%);
    animation-delay: 0s;
}
.sh-login-nebula__orb--2 {
    width: 400px; height: 400px;
    bottom: -120px; right: -80px;
    background: radial-gradient(circle, rgba(40, 100, 200, 0.25), transparent 70%);
    animation-delay: 3s;
}
.sh-login-nebula__orb--3 {
    width: 300px; height: 300px;
    top: 40%; left: 55%;
    background: radial-gradient(circle, rgba(120, 50, 180, 0.18), transparent 70%);
    animation-delay: 1.5s;
}

@keyframes sh-login-orb-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.12); }
}

/* ── Carte Glass ──────────────────────────────────────────────── */
.sh-login-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(48px) saturate(180%);
    -webkit-backdrop-filter: blur(48px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 24px;
    padding: 40px 36px;
    box-shadow:
        0 32px 80px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
    animation: sh-springIn 550ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes sh-login-card-in {
    from { opacity: 0; transform: scale(0.93) translateY(20px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
}

.sh-login-card--shake {
    animation: sh-login-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
@keyframes sh-login-shake {
    10%, 90%  { transform: translateX(-3px); }
    20%, 80%  { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-5px); }
    40%, 60%  { transform: translateX(5px); }
}

/* ── En-tête Marque ──────────────────────────────────────────── */
.sh-login-header {
    text-align: center;
    margin-bottom: 32px;
}

.sh-login-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    cursor: default;
    user-select: none;
    animation: sh-fadeInDown 400ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both;
}

.sh-login-luminous-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
    display: flex; align-items: center; justify-content: center;
}
.sh-login-dot-core {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: #ffffff;
    animation: sh-login-dot 2s ease-in-out infinite;
}
@keyframes sh-login-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%       { transform: scale(1.5); opacity: 0.45; }
}

.sh-login-rocket {
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sh-login-brand:hover .sh-login-rocket {
    transform: translateY(-3px) rotate(-10deg) scale(1.15);
}

.sh-login-brand-name {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #ffffff;
}

.sh-login-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    animation: sh-fadeIn 400ms ease 200ms both;
}

/* ── Formulaire ───────────────────────────────────────────────── */
.sh-login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sh-login-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: sh-fadeInUp 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.sh-login-field:nth-child(1) { animation-delay: 150ms; }
.sh-login-field:nth-child(2) { animation-delay: 200ms; }
.sh-login-field:nth-child(3) { animation-delay: 250ms; }

.sh-login-field label {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.50);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.sh-login-input-wrap {
    position: relative;
}
.sh-login-input-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    stroke: rgba(255, 255, 255, 0.35);
    pointer-events: none;
    transition: stroke 180ms ease;
}
.sh-login-input-wrap:focus-within .sh-login-input-icon {
    stroke: rgba(255, 255, 255, 0.70);
}

.sh-login-input {
    padding-left: 40px !important;
}

/* ── Erreur ───────────────────────────────────────────────────── */
.sh-login-error {
    background: rgba(255, 69, 58, 0.10);
    border: 1px solid rgba(255, 69, 58, 0.30);
    border-radius: 12px;
    padding: 11px 14px;
    color: #ff453a;
    font-size: 13px;
    font-weight: 500;
    animation: sh-fadeInUp 250ms ease both;
}

/* ── Bouton Se Connecter ──────────────────────────────────────── */
.sh-login-btn {
    position: relative;
    width: 100%;
    padding: 14px 20px;
    background: #ffffff;
    color: #000000;
    border: none;
    border-radius: 999px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 8px;
    box-shadow: 0 4px 24px rgba(255, 255, 255, 0.20);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease, background 200ms ease;
    animation: sh-fadeInUp 350ms cubic-bezier(0.16, 1, 0.3, 1) 300ms both;
    overflow: hidden;
}
.sh-login-btn:hover:not(:disabled) {
    transform: scale(1.03);
    box-shadow: 0 8px 32px rgba(255, 255, 255, 0.32);
}
.sh-login-btn:active:not(:disabled) {
    transform: scale(0.97);
}
.sh-login-btn:disabled {
    cursor: default;
    background: rgba(255, 255, 255, 0.85);
}
.sh-login-btn--success {
    background: #32d74b !important;
    color: #ffffff !important;
    box-shadow: 0 4px 24px rgba(50, 215, 75, 0.40) !important;
}

.sh-login-btn__content,
.sh-login-btn__loading {
    display: flex;
    align-items: center;
    gap: 8px;
}

.sh-login-spinner {
    animation: sh-spin 0.9s linear infinite;
    transform-origin: center;
}
        `;
        document.head.appendChild(style);
    }
}

export default LoginView;

