/**
 * SpaceHub — Cosmic Cinematic Intro & Sound Engine (Horizon 17)
 * Version: 1.0.0
 *
 * Moteur d'introduction cinématique style Netflix :
 * - Signature sonore "Ta-Dum Spatial" 100% synthétisée via Web Audio API (sub-bass + accord cosmique réverbéré)
 * - Animation Canvas 2D/3D Warp Speed avec traînées d'étoiles et tracé laser du logo SPACEHUB
 * - Onde de choc prismatique finale et transition fluide vers l'application
 * - Interruption immédiate (Skip) au clic ou via touche clavier
 */

'use strict';

import Logger from '../Logger.js';

class CinematicIntroEngine {
    constructor() {
        this._log = new Logger('CinematicIntroEngine');
        this._overlayEl = null;
        this._audioCtx = null;
        this._animFrame = null;
        this._isFinished = false;
        this._settings = {
            enabled: true,
            sound: true,
            oncePerSession: false
        };

        this._loadSettings();
    }

    _loadSettings() {
        const s = window.SpaceHub?.core?.settings;
        if (s) {
            this._settings.enabled = s.get('intro.enabled', true);
            this._settings.sound = s.get('intro.sound', true);
            this._settings.oncePerSession = s.get('intro.oncePerSession', false);
        }
    }

    /**
     * Lance l'introduction cinématique au démarrage de l'application.
     * @returns {Promise<void>}
     */
    async play() {
        if (!this._settings.enabled) return;

        if (this._settings.oncePerSession && sessionStorage.getItem('sh_intro_played')) {
            return;
        }

        return new Promise((resolve) => {
            this._createDOM();
            this._startStarfield();

            if (this._settings.sound) {
                this._playCosmicSound();
            }

            const finish = () => {
                if (this._isFinished) return;
                this._isFinished = true;
                sessionStorage.setItem('sh_intro_played', 'true');

                if (this._overlayEl) {
                    this._overlayEl.classList.add('sh-intro-fadeout');
                    setTimeout(() => {
                        this._cleanup();
                        resolve();
                    }, 600);
                } else {
                    this._cleanup();
                    resolve();
                }
            };

            // Écouteurs pour passer l'intro (Skip)
            this._overlayEl.addEventListener('click', finish);
            const keyHandler = (e) => {
                if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
                    window.removeEventListener('keydown', keyHandler);
                    finish();
                }
            };
            window.addEventListener('keydown', keyHandler);

            // Timer de fin automatique après 3.2 secondes
            setTimeout(() => {
                window.removeEventListener('keydown', keyHandler);
                finish();
            }, 3200);
        });
    }

    _createDOM() {
        this._overlayEl = document.createElement('div');
        this._overlayEl.id = 'sh-cinematic-intro';
        this._overlayEl.className = 'sh-cinematic-intro-overlay';

        this._overlayEl.innerHTML = `
            <canvas id="sh-intro-canvas"></canvas>
            <div class="sh-intro-center-logo">
                <div class="sh-intro-icon-wrap">
                    <svg viewBox="0 0 100 100" class="sh-intro-svg-logo">
                        <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" class="sh-intro-hex" />
                        <path d="M30,50 L50,20 L70,50 L50,80 Z" class="sh-intro-diamond" />
                        <circle cx="50" cy="50" r="10" class="sh-intro-core" />
                    </svg>
                </div>
                <h1 class="sh-intro-title">SPACE<span>HUB</span></h1>
                <div class="sh-intro-tagline">YOUR ENTERTAINMENT GALAXY</div>
            </div>
            <div class="sh-intro-skip-hint">Cliquez ou appuyez sur une touche pour passer</div>
        `;

        document.body.appendChild(this._overlayEl);
        this._injectStyles();
    }

    _startStarfield() {
        const canvas = document.getElementById('sh-intro-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const stars = Array.from({ length: 400 }, () => ({
            x: (Math.random() - 0.5) * width,
            y: (Math.random() - 0.5) * height,
            z: Math.random() * width,
            color: Math.random() > 0.3 ? '#7c6aff' : (Math.random() > 0.5 ? '#00f2fe' : '#ffffff')
        }));

        let speed = 2;
        const startTime = performance.now();

        const render = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed < 1200) {
                speed += 0.15; // Accélération Warp Speed
            } else if (elapsed < 2400) {
                speed = Math.max(1, speed - 0.1); // Décélération
            }

            ctx.fillStyle = 'rgba(5, 5, 8, 0.3)';
            ctx.fillRect(0, 0, width, height);

            const cx = width / 2;
            const cy = height / 2;

            for (const s of stars) {
                s.z -= speed;
                if (s.z <= 0) {
                    s.z = width;
                    s.x = (Math.random() - 0.5) * width;
                    s.y = (Math.random() - 0.5) * height;
                }

                const k = 250 / s.z;
                const px = s.x * k + cx;
                const py = s.y * k + cy;

                if (px >= 0 && px <= width && py >= 0 && py <= height) {
                    const size = (1 - s.z / width) * 3.5;
                    ctx.fillStyle = s.color;
                    ctx.beginPath();
                    ctx.arc(px, py, Math.max(0.8, size), 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (!this._isFinished) {
                this._animFrame = requestAnimationFrame(render);
            }
        };

        this._animFrame = requestAnimationFrame(render);
    }

    /**
     * Synthétise la signature sonore "Ta-Dum Spatial" via Web Audio API.
     */
    _playCosmicSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this._audioCtx = new AudioContext();
            const now = this._audioCtx.currentTime;

            // 1. Coup de basse Sub-Bass "Ta" (45Hz -> 30Hz)
            const subOsc = this._audioCtx.createOscillator();
            const subGain = this._audioCtx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(65, now);
            subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.9);

            subGain.gain.setValueAtTime(0.8, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            subOsc.connect(subGain);
            subGain.connect(this._audioCtx.destination);
            subOsc.start(now);
            subOsc.stop(now + 1.3);

            // 2. Deuxième impact orchestral "Dum" (à +0.22s)
            const impactOsc = this._audioCtx.createOscillator();
            const impactGain = this._audioCtx.createGain();
            impactOsc.type = 'triangle';
            impactOsc.frequency.setValueAtTime(120, now + 0.22);
            impactOsc.frequency.exponentialRampToValueAtTime(40, now + 1.4);

            impactGain.gain.setValueAtTime(0.001, now);
            impactGain.gain.setValueAtTime(0.9, now + 0.22);
            impactGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

            impactOsc.connect(impactGain);
            impactGain.connect(this._audioCtx.destination);
            impactOsc.start(now + 0.22);
            impactOsc.stop(now + 2.3);

            // 3. Nappe céleste et harmonique cosmique réverbérée
            const shimmerFreqs = [220, 329.63, 440, 659.25, 880];
            shimmerFreqs.forEach((freq, i) => {
                const sOsc = this._audioCtx.createOscillator();
                const sGain = this._audioCtx.createGain();
                sOsc.type = 'sine';
                sOsc.frequency.setValueAtTime(freq, now + 0.3);

                sGain.gain.setValueAtTime(0.001, now);
                sGain.gain.setValueAtTime(0.08 / (i + 1), now + 0.4);
                sGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

                sOsc.connect(sGain);
                sGain.connect(this._audioCtx.destination);
                sOsc.start(now + 0.3);
                sOsc.stop(now + 2.9);
            });

        } catch (err) {
            this._log.warn('Lecture audio intro restreinte par le navigateur:', err.message);
        }
    }

    _cleanup() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        if (this._audioCtx) {
            this._audioCtx.close().catch(() => {});
            this._audioCtx = null;
        }
        if (this._overlayEl) {
            this._overlayEl.remove();
            this._overlayEl = null;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-cinematic-intro-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-cinematic-intro-styles';
        style.textContent = `
.sh-cinematic-intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: #050508;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
    transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s ease;
}

.sh-intro-fadeout {
    opacity: 0 !important;
    transform: scale(1.06);
    pointer-events: none;
}

#sh-intro-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
}

.sh-intro-center-logo {
    position: relative;
    z-index: 2;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: introZoomLogo 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.sh-intro-icon-wrap {
    width: 110px;
    height: 110px;
    margin-bottom: 20px;
    filter: drop-shadow(0 0 35px rgba(124, 106, 255, 0.8));
    animation: pulseIconGlow 2s ease-in-out infinite alternate;
}

.sh-intro-svg-logo {
    width: 100%;
    height: 100%;
}

.sh-intro-hex {
    fill: none;
    stroke: #7c6aff;
    stroke-width: 4;
    stroke-dasharray: 300;
    stroke-dashoffset: 300;
    animation: drawLaser 1.4s ease-out forwards;
}

.sh-intro-diamond {
    fill: none;
    stroke: #00f2fe;
    stroke-width: 4;
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
    animation: drawLaser 1.6s 0.2s ease-out forwards;
}

.sh-intro-core {
    fill: #ffffff;
    filter: drop-shadow(0 0 12px #ffffff);
    animation: glowCore 1.8s 0.4s ease-in-out infinite alternate;
}

.sh-intro-title {
    font-size: 54px;
    font-weight: 900;
    letter-spacing: 12px;
    color: #ffffff;
    margin: 0;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.6), 0 0 60px rgba(124, 106, 255, 0.5);
}

.sh-intro-title span {
    color: #7c6aff;
    text-shadow: 0 0 35px #7c6aff;
}

.sh-intro-tagline {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 6px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 10px;
    text-transform: uppercase;
}

.sh-intro-skip-hint {
    position: absolute;
    bottom: 28px;
    left: 0;
    right: 0;
    text-align: center;
    z-index: 3;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 1px;
}

@keyframes drawLaser {
    to { stroke-dashoffset: 0; }
}

@keyframes glowCore {
    0% { transform: scale(0.8); opacity: 0.7; }
    100% { transform: scale(1.2); opacity: 1; filter: drop-shadow(0 0 24px #00f2fe); }
}

@keyframes pulseIconGlow {
    0% { transform: scale(0.96); filter: drop-shadow(0 0 25px rgba(124, 106, 255, 0.6)); }
    100% { transform: scale(1.04); filter: drop-shadow(0 0 50px rgba(0, 242, 254, 0.9)); }
}

@keyframes introZoomLogo {
    0% { transform: scale(0.7); opacity: 0; }
    30% { opacity: 1; }
    80% { transform: scale(1.02); opacity: 1; }
    100% { transform: scale(1.08); opacity: 1; }
}
        `;
        document.head.appendChild(style);
    }
}

export default CinematicIntroEngine;
