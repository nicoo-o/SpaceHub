/**
 * SpaceHub — Web Audio Feedback Synthesizer (v9.0)
 * Version: 1.0.0
 *
 * Générateur de micro-sons cinématographiques purs (Web Audio API synthétisé) :
 * - Zéro fichier audio externe (MP3/WAV) à charger.
 * - Latence 0ms temps réel.
 * - Micro-sons : Tick de focus, Clack de sélection, Tone de retour, Glissement de modale.
 * - Activable / désactivable dynamiquement.
 */

'use strict';

export class AudioFeedback {
    constructor() {
        this._ctx = null;
        this._isEnabled = true; // Actif par défaut en mode TV
    }

    _ensureContext() {
        if (!this._ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this._ctx = new AudioCtx();
        }
        if (this._ctx && this._ctx.state === 'suspended') {
            this._ctx.resume().catch(() => {});
        }
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
            if (!this._ctx) return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(750, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(380, this._ctx.currentTime + 0.025);

            gain.gain.setValueAtTime(0.04, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.025);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.025);
        } catch (_) {}
    }

    /**
     * Clack de sélection (Entrée / Bouton A)
     */
    playSelect() {
        if (!this._isEnabled) return;
        try {
            this._ensureContext();
            if (!this._ctx) return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(580, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this._ctx.currentTime + 0.04);

            gain.gain.setValueAtTime(0.06, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.045);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.045);
        } catch (_) {}
    }

    /**
     * Son de retour / fermeture (Échap / Bouton B)
     */
    playBack() {
        if (!this._isEnabled) return;
        try {
            this._ensureContext();
            if (!this._ctx) return;

            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this._ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, this._ctx.currentTime + 0.05);

            gain.gain.setValueAtTime(0.05, this._ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.055);

            osc.connect(gain);
            gain.connect(this._ctx.destination);

            osc.start();
            osc.stop(this._ctx.currentTime + 0.055);
        } catch (_) {}
    }
}

export default AudioFeedback;
