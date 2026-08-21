/**
 * SpaceHub — Recyclarr Config Manager
 * Version: 1.0.0
 *
 * Gestionnaire de configuration Recyclarr pour la synchronisation automatique
 * des profils de qualité TRaSH Guides vers Sonarr/Radarr.
 * Permet de visualiser, éditer et appliquer les configs YAML directement depuis SpaceHub.
 */

'use strict';

import Logger from '../../core/Logger.js';

class RecyclarrManager {
    constructor() {
        this._log = new Logger('RecyclarrManager');

        // Préconfigurations basées sur les guides TRaSH officiels
        this._defaultProfiles = {
            radarr: {
                label: 'Radarr — TRaSH Quality Profile',
                yaml: `radarr:
  instance1:
    base_url: http://localhost:7878
    api_key: YOUR_RADARR_API_KEY

    quality_profiles:
      - name: Ultra-HD Bluray + Web
        reset_unmatched_scores:
          enabled: true
        upgrade:
          allowed: true
          until_quality: Remux-2160p
          until_score: 10000
        qualities:
          - name: Remux-2160p
          - name: Bluray-2160p
          - name: WEB 2160p
            qualities:
              - WEBRip-2160p
              - WEBDL-2160p
          - name: Bluray-1080p
          - name: WEB 1080p
            qualities:
              - WEBRip-1080p
              - WEBDL-1080p

    custom_formats:
      - trash_ids:
          - b124be9b146540f359377341d3a7809e  # Remaster
          - e7718d7a3ce595f289bfee26adc178f5  # Dolby Vision
          - 5d96ce331b98e78bdc493dfef7d60b60  # Multi-Audio
        quality_profiles:
          - name: Ultra-HD Bluray + Web`
            },
            sonarr: {
                label: 'Sonarr — TRaSH Quality Profile',
                yaml: `sonarr:
  instance1:
    base_url: http://localhost:8989
    api_key: YOUR_SONARR_API_KEY

    quality_profiles:
      - name: WEB-1080p
        reset_unmatched_scores:
          enabled: true
        upgrade:
          allowed: true
          until_quality: WEB 1080p
          until_score: 10000
        qualities:
          - name: WEB 1080p
            qualities:
              - WEBDL-1080p
              - WEBRip-1080p
          - name: WEB 720p
            qualities:
              - WEBDL-720p
              - WEBRip-720p

    custom_formats:
      - trash_ids:
          - 32b367365729d530ca1c124a0b180c64  # BadDual Groups
          - 4b900e171accbfb172729b63323f9d5e  # x264
        quality_profiles:
          - name: WEB-1080p`
            }
        };
    }

    /**
     * Ouvre la modale de gestion des configs Recyclarr.
     */
    openConfigModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        let currentProfile = 'radarr';
        const profile = this._defaultProfiles[currentProfile];

        const modal = new Modal({
            id: 'recyclarr-modal',
            title: '♻️ Recyclarr — Gestionnaire de Configuration TRaSH Guides',
            size: 'xl',
            content: `
                <div class="sh-recyclarr-container">
                    <div class="sh-recyclarr-toolbar">
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="sh-btn sh-btn--sm ${currentProfile === 'radarr' ? 'sh-btn--primary' : 'sh-btn--ghost'}" id="btn-rcl-radarr">🎬 Radarr</button>
                            <button class="sh-btn sh-btn--sm ${currentProfile === 'sonarr' ? 'sh-btn--primary' : 'sh-btn--ghost'}" id="btn-rcl-sonarr">📺 Sonarr</button>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-rcl-copy">📋 Copier YAML</button>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-rcl-download">⬇️ Télécharger .yml</button>
                        </div>
                    </div>

                    <div class="sh-recyclarr-info">
                        <strong>🗑️ Profil actif :</strong> <span id="rcl-profile-label">${profile.label}</span>
                        <span style="font-size:12px; color:var(--sh-text-muted); margin-left:12px;">Basé sur les <a href="https://trash-guides.info" target="_blank" style="color:var(--sh-color-primary);">TRaSH Guides</a></span>
                    </div>

                    <textarea class="sh-recyclarr-editor" id="rcl-yaml-editor" spellcheck="false">${this._defaultProfiles.radarr.yaml}</textarea>

                    <div style="font-size:12px; color:var(--sh-text-muted); margin-top:8px;">
                        💡 Injectez votre clé API Radarr/Sonarr dans la config, puis lancez <code>recyclarr sync</code> depuis votre serveur.
                    </div>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="close">Fermer</button>
            `
        });

        modal.open();
        modal._el.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.close());

        const editor = modal._el.querySelector('#rcl-yaml-editor');
        const profileLabel = modal._el.querySelector('#rcl-profile-label');

        const switchProfile = (id) => {
            currentProfile = id;
            const p = this._defaultProfiles[id];
            editor.value = p.yaml;
            profileLabel.textContent = p.label;
            modal._el.querySelectorAll('[id^="btn-rcl-radarr"], [id^="btn-rcl-sonarr"]').forEach(b => b.classList.remove('sh-btn--primary'));
            modal._el.querySelector(`#btn-rcl-${id}`)?.classList.add('sh-btn--primary');
        };

        modal._el.querySelector('#btn-rcl-radarr')?.addEventListener('click', () => switchProfile('radarr'));
        modal._el.querySelector('#btn-rcl-sonarr')?.addEventListener('click', () => switchProfile('sonarr'));

        modal._el.querySelector('#btn-rcl-copy')?.addEventListener('click', () => {
            navigator.clipboard.writeText(editor.value);
            window.SpaceHub?.ui?.components?.toaster?.success('Configuration YAML copiée dans le presse-papiers !');
        });

        modal._el.querySelector('#btn-rcl-download')?.addEventListener('click', () => {
            const blob = new Blob([editor.value], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recyclarr-${currentProfile}.yml`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}

export default RecyclarrManager;
