/**
 * SpaceHub — 10-Band Audio Equalizer & DSP Service (Hi-Fi Engine)
 * Version: 1.0.0
 *
 * Égaliseur paramétrique 10 bandes basé sur Web Audio API (BiquadFilterNodes).
 * Propose des préréglages audio professionnels et une interface visuelle de réglage en direct.
 */

'use strict';

import Logger from '../../../core/Logger.js';

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS = {
    'flat': { name: 'Neutre (Flat)', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    'bass-boost': { name: 'Basses Profondes (Bass Boost)', gains: [6, 5, 4, 2, 0, 0, 0, 0, 1, 2] },
    'vocal-boost': { name: 'Clarté Vocale / Podcasts', gains: [-2, -1, 0, 2, 4, 5, 4, 2, 0, -1] },
    'electronic': { name: 'Électro & Club', gains: [5, 4, 2, 0, -1, 2, 3, 4, 5, 4] },
    'rock': { name: 'Rock & Guitare', gains: [4, 3, 1, 0, -1, 1, 3, 4, 4, 3] },
    'night': { name: 'Mode Nuit / Écoute Douce', gains: [-4, -3, -1, 0, 1, 2, 1, 0, -2, -4] }
};

class AudioDSPService {
    constructor() {
        this._log = new Logger('AudioDSPService');
        this._audioCtx = null;
        this._filters = [];
        this._currentGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this._isAttached = false;
    }

    /**
     * Attache le processeur DSP à l'élément Audio HTML5.
     * @param {HTMLAudioElement} audioElement
     */
    attachAudio(audioElement) {
        if (this._isAttached || !audioElement) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this._audioCtx = new AudioContext();

            const source = this._audioCtx.createMediaElementSource(audioElement);

            // Créer la chaîne de 10 filtres Biquad Peaking
            this._filters = FREQUENCIES.map((freq, i) => {
                const filter = this._audioCtx.createBiquadFilter();
                filter.type = i === 0 ? 'lowshelf' : (i === FREQUENCIES.length - 1 ? 'highshelf' : 'peaking');
                filter.frequency.value = freq;
                filter.gain.value = this._currentGains[i];
                filter.Q.value = 1.4;
                return filter;
            });

            // Chaîner les filtres : source -> f[0] -> f[1] ... -> destination
            source.connect(this._filters[0]);
            for (let i = 0; i < this._filters.length - 1; i++) {
                this._filters[i].connect(this._filters[i + 1]);
            }
            this._filters[this._filters.length - 1].connect(this._audioCtx.destination);

            this._isAttached = true;
            this._log.info('DSP 10-band Equalizer raccordé avec succès au flux audio.');
        } catch (err) {
            this._log.warn('Initialisation DSP Audio reportée:', err.message);
        }
    }

    /**
     * Modifie le gain d'une bande spécifique.
     * @param {number} bandIndex - Index de 0 à 9
     * @param {number} gainDb - Gain en dB (-12 à +12)
     */
    setGain(bandIndex, gainDb) {
        if (bandIndex < 0 || bandIndex >= FREQUENCIES.length) return;
        this._currentGains[bandIndex] = gainDb;

        if (this._filters[bandIndex] && this._audioCtx) {
            this._filters[bandIndex].gain.setValueAtTime(gainDb, this._audioCtx.currentTime);
        }
    }

    /**
     * Applique un préréglage complet d'égalisation.
     * @param {string} presetId
     */
    applyPreset(presetId) {
        const p = PRESETS[presetId];
        if (!p) return;

        p.gains.forEach((g, idx) => {
            this.setGain(idx, g);
        });
        this._log.info(`Preset DSP appliqué : ${p.name}`);
    }

    /**
     * Ouvre la modale interactive de l'égaliseur 10 bandes.
     */
    openEqualizerModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const modal = new Modal({
            id: 'equalizer-modal',
            title: '🎛️ Égaliseur Audio Paramétrique 10 Bandes (Hi-Fi)',
            size: 'lg',
            content: `
                <div class="sh-eq-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <label style="font-size:12px; font-weight:700; color:var(--sh-text-secondary);">Préréglages d'écoute</label>
                        <select class="sh-select" id="sh-eq-preset-select" style="max-width:220px;">
                            ${Object.entries(PRESETS).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('')}
                        </select>
                    </div>

                    <div class="sh-eq-sliders-grid" style="display:flex; justify-content:space-between; gap:12px; height:240px; align-items:center; background:var(--sh-bg-surface-3); padding:20px; border-radius:12px;">
                        ${FREQUENCIES.map((freq, i) => `
                            <div class="sh-eq-band-col" style="display:flex; flex-direction:column; align-items:center; height:100%; justify-content:space-between;">
                                <span style="font-size:10px; color:var(--sh-text-muted);" id="eq-val-${i}">${this._currentGains[i]} dB</span>
                                <input type="range" class="sh-eq-slider" data-index="${i}" min="-12" max="12" step="1" value="${this._currentGains[i]}" orient="vertical" style="writing-mode: vertical-lr; direction: rtl; width:16px; height:140px; cursor:pointer;" />
                                <strong style="font-size:11px; color:var(--sh-text-primary); margin-top:8px;">${freq >= 1000 ? `${freq/1000}k` : `${freq}`}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" id="btn-reset-eq">Réinitialiser (0 dB)</button>
                <button class="sh-btn sh-btn--primary" data-action="close">Fermer</button>
            `
        });

        modal.open();
        modal._el.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.close());

        modal._el.querySelector('#sh-eq-preset-select')?.addEventListener('change', (e) => {
            const pId = e.target.value;
            this.applyPreset(pId);
            FREQUENCIES.forEach((_, i) => {
                const slider = modal._el.querySelector(`.sh-eq-slider[data-index="${i}"]`);
                const valLabel = modal._el.querySelector(`#eq-val-${i}`);
                if (slider) slider.value = this._currentGains[i];
                if (valLabel) valLabel.textContent = `${this._currentGains[i]} dB`;
            });
            window.SpaceHub?.ui?.components?.toaster?.info(`Preset "${PRESETS[pId].name}" appliqué !`);
        });

        modal._el.querySelectorAll('.sh-eq-slider').forEach(sl => {
            sl.addEventListener('input', (e) => {
                const idx = parseInt(sl.dataset.index);
                const val = parseInt(sl.value);
                this.setGain(idx, val);
                modal._el.querySelector(`#eq-val-${idx}`).textContent = `${val} dB`;
            });
        });

        modal._el.querySelector('#btn-reset-eq')?.addEventListener('click', () => {
            this.applyPreset('flat');
            FREQUENCIES.forEach((_, i) => {
                const slider = modal._el.querySelector(`.sh-eq-slider[data-index="${i}"]`);
                const valLabel = modal._el.querySelector(`#eq-val-${i}`);
                if (slider) slider.value = 0;
                if (valLabel) valLabel.textContent = '0 dB';
            });
            window.SpaceHub?.ui?.components?.toaster?.info('Égaliseur réinitialisé.');
        });
    }
}

export default AudioDSPService;
