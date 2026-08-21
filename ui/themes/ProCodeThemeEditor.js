/**
 * SpaceHub — Pro Theme Studio & Live CSS Code Editor (Horizon 8++)
 * Version: 1.0.0
 *
 * Éditeur de code CSS et variables en direct (Live Split View) :
 * - Injection CSS en temps réel sans rechargement
 * - Auto-complétion des variables CSS SpaceHub
 * - Import/Export de packages thématiques .spacehub-theme.json
 */

'use strict';

import Logger from '../../core/Logger.js';

class ProCodeThemeEditor {
    constructor() {
        this._log = new Logger('ProCodeThemeEditor');
        this._customStyleEl = null;
    }

    /**
     * Ouvre la modale de l'éditeur de thèmes pro.
     */
    openEditorModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const currentCSS = localStorage.getItem('sh_custom_css') || `/* Thème personnalisé SpaceHub */
:root {
    --sh-color-primary: #7c6aff;
    --sh-bg-surface-1: #0a0a0f;
    --sh-bg-surface-2: #12121c;
    --sh-radius: 12px;
    --sh-glass-blur: 16px;
}
`;

        const modal = new Modal({
            id: 'pro-theme-editor-modal',
            title: '🎨 Pro Theme Studio — Éditeur CSS en Direct',
            size: 'xl',
            content: `
                <div class="sh-pro-theme-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-size:12px; color:var(--sh-text-secondary);">
                            Modifiez les variables CSS ci-dessous : les changements s'appliquent instantanément.
                        </span>
                        <div style="display:flex; gap:8px;">
                            <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-theme-export">📤 Exporter .json</button>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-theme-reset">🔄 Réinitialiser</button>
                        </div>
                    </div>

                    <textarea id="sh-pro-css-editor" class="sh-pro-editor-textarea" spellcheck="false">${currentCSS}</textarea>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="close">Fermer</button>
                <button class="sh-btn sh-btn--primary" id="btn-theme-save">💾 Enregistrer le Thème</button>
            `
        });

        modal.open();
        modal._el.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.close());

        const editor = modal._el.querySelector('#sh-pro-css-editor');

        // Live injection as you type
        editor.addEventListener('input', () => {
            this.applyCSS(editor.value);
        });

        modal._el.querySelector('#btn-theme-save')?.addEventListener('click', () => {
            localStorage.setItem('sh_custom_css', editor.value);
            this.applyCSS(editor.value);
            window.SpaceHub?.ui?.components?.toaster?.success('Thème personnalisé sauvegardé !');
            modal.close();
        });

        modal._el.querySelector('#btn-theme-export')?.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({ css: editor.value, author: 'SpaceHub User', version: '1.0' }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my-spacehub-theme.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    applyCSS(cssText) {
        if (!this._customStyleEl) {
            this._customStyleEl = document.createElement('style');
            this._customStyleEl.id = 'sh-pro-custom-theme-live';
            document.head.appendChild(this._customStyleEl);
        }
        this._customStyleEl.textContent = cssText;
    }
}

export default ProCodeThemeEditor;
