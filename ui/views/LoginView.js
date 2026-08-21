/**
 * SpaceHub — Login View
 * Version: 1.0.0
 *
 * Écran de connexion autonome pour se connecter à un serveur Jellyfin.
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
                <div class="sh-login-card">
                    <div class="sh-login-header">
                        <h1 class="sh-login-title">SpaceHub</h1>
                        <p class="sh-login-subtitle">Connectez-vous à votre serveur Jellyfin</p>
                    </div>

                    <form class="sh-login-form" id="sh-login-form">
                        <div class="sh-login-field">
                            <label for="server-url">URL du Serveur Jellyfin</label>
                            <input type="url" id="server-url" class="sh-input" placeholder="http://192.168.1.100:8096" value="http://localhost:8096" required />
                        </div>

                        <div class="sh-login-field">
                            <label for="username">Nom d'utilisateur</label>
                            <input type="text" id="username" class="sh-input" placeholder="Votre identifiant" required autofocus />
                        </div>

                        <div class="sh-login-field">
                            <label for="password">Mot de passe</label>
                            <input type="password" id="password" class="sh-input" placeholder="Mot de passe (optionnel si vide)" />
                        </div>

                        <div class="sh-login-error" id="sh-login-error" style="display:none;"></div>

                        <button type="submit" class="sh-btn sh-btn--primary sh-login-submit" id="sh-login-btn">
                            Se connecter
                        </button>
                    </form>
                </div>
            </div>
        `;

        const form = container.querySelector('#sh-login-form');
        const btn = container.querySelector('#sh-login-btn');
        const errorEl = container.querySelector('#sh-login-error');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serverUrl = container.querySelector('#server-url').value.trim();
            const username = container.querySelector('#username').value.trim();
            const password = container.querySelector('#password').value;

            btn.disabled = true;
            btn.textContent = 'Connexion en cours...';
            errorEl.style.display = 'none';

            const auth = window.SpaceHub?.auth;
            const res = await auth.login(serverUrl, username, password);

            if (res.success) {
                this.onLoginSuccess?.(res.user);
            } else {
                errorEl.textContent = res.error || 'Erreur lors de la connexion.';
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Se connecter';
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-login-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-login-styles';
        style.textContent = `
.sh-login-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--sh-space-4, 16px);
    background: radial-gradient(circle at top center, rgba(124, 106, 255, 0.15), transparent 60%);
}

.sh-login-card {
    width: 100%;
    max-width: 420px;
    background: var(--sh-bg-surface, #18181f);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-lg, 16px);
    padding: var(--sh-space-8, 32px);
    box-shadow: var(--sh-shadow-xl, 0 24px 64px rgba(0,0,0,0.7));
}

.sh-login-header {
    text-align: center;
    margin-bottom: var(--sh-space-6, 24px);
}

.sh-login-title {
    font-size: var(--sh-text-2xl, 30px);
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #fff, var(--sh-color-primary, #7c6aff));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0 0 6px 0;
}

.sh-login-subtitle {
    font-size: var(--sh-text-sm, 13px);
    color: var(--sh-text-secondary, #9898b8);
    margin: 0;
}

.sh-login-form {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-4, 16px);
}

.sh-login-field {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-1, 4px);
}

.sh-login-field label {
    font-size: var(--sh-text-xs, 11px);
    font-weight: 600;
    color: var(--sh-text-secondary, #9898b8);
    text-transform: uppercase;
}

.sh-login-submit {
    width: 100%;
    padding: var(--sh-space-3, 12px);
    font-size: var(--sh-text-md, 17px);
    font-weight: 600;
    justify-content: center;
    margin-top: var(--sh-space-2, 8px);
}

.sh-login-error {
    background: rgba(255, 92, 122, 0.1);
    border: 1px solid var(--sh-color-danger, #ff5c7a);
    border-radius: var(--sh-radius-sm, 8px);
    padding: var(--sh-space-3, 12px);
    color: var(--sh-color-danger, #ff5c7a);
    font-size: var(--sh-text-sm, 13px);
}
        `;
        document.head.appendChild(style);
    }
}

export default LoginView;
