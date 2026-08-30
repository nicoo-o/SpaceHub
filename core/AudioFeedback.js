/**
 * SpaceHub — Web Audio Feedback Synthesizer (v9.0 Industrial Core)
 * Version: 1.1.0
 *
 * Générateur de micro-sons cinématographiques purs (Web Audio API synthétisé) :
 * - Zéro fichier audio externe (MP3/WAV) à charger.
 * - Latence 0ms temps réel.
 * - Déverrouillage automatique et conforme aux politiques Autoplay Policy (Chrome, Safari, Firefox).
 * - Micro-sons : Tick de focus, Clack de sélection, Tone de retour.
 */

'use strict';

export class AudioFeedback {
    constructor() {
        this._ctx = null;
        this._isEnabled = true;
        this._unlocked = false;

        this._setupGestureUnlock();
    }

    _setupGestureUnlock() {
        const unlock = () => {
            if (this._unlocked) return;
            this._ensureContext();
            this._unlocked = true;
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('keydown', unlock, { passive: true, once: true });
        window.addEventListener('pointerdown', unlock, { passive: true, once: true });
        window.addEventListener('touchstart', unlock, { passive: true, once: true });
    }

    _ensureContext() {
        try {
            if (!this._ctx && (window.AudioContext || window.webkitAudioContext)) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this._ctx = new AudioCtx();
            }
            if (this._ctx && this._ctx.state === 'suspended') {
                this._ctx.resume().catch(() => {});
            }
        } catch (_) {}
    }

    enable() {
        this._isEnabled = true;
    }

    disable() {
        this._isEnabled = false;
    }

    /**
     * Micro-tick doux de changement de focus
     */
    playTick() {
        if (!this._isEnabled) return;
        try {
            this._ensureContext();
            if (!this._ctx || this._ctx.state === 'suspended') return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(750, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(380, this._ctx.currentTime + 0.022);

            gain.gain.setValueAtTime(0.035, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.022);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.022);
        } catch (_) {}
    }

    /**
     * Clack de sélection (Entrée / Bouton A)
     */
    playSelect() {
        if (!this._isEnabled) return;
        try {
            this._ensureContext();
            if (!this._ctx || this._ctx.state === 'suspended') return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(580, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this._ctx.currentTime + 0.038);

            gain.gain.setValueAtTime(0.05, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.04);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.04);
        } catch (_) {}
    }

    /**
     * Son de retour / fermeture (Échap / Bouton B)
     */
    playBack() {
        if (!this._isEnabled) return;
        try {
            this._ensureContext();
            if (!this._ctx || this._ctx.state === 'suspended') return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, this._ctx.currentTime + 0.045);

            gain.gain.setValueAtTime(0.045, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.05);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.05);
        } catch (_) {}
    }
}

export default AudioFeedback;
