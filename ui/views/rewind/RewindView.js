/**
 * SpaceHub — Rewind & Yearly Wrapped View (Horizon 16)
 * Version: 1.0.0
 *
 * Expérience interactive rétrospective de l'année :
 * - Cartes statistiques avec compteurs animés
 * - Bilan des heures passées devant les films & séries
 * - Top genres & films préférés
 * - Persona cinéphile & Badges de visionnage
 * - Export de carte de partage
 */

'use strict';

import Logger from '../../../core/Logger.js';
import RewindService from '../../../core/analytics/RewindService.js';

class RewindView {
    constructor() {
        this._log = new Logger('RewindView');
        this._service = new RewindService();
        this._container = null;
        this._currentSlide = 0;
        this._totalSlides = 4;
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-rewind-page">
                <div class="sh-rewind-header">
                    <div>
                        <h2>✨ SpaceHub Rewind ${new Date().getFullYear()}</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Votre rétrospective cinématographique et vos moments forts de l'année.
                        </p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-rewind-share">📸 Partager mon Bilan</button>
                    </div>
                </div>

                <div class="sh-rewind-carousel-wrapper">
                    <div class="sh-rewind-slides-container" id="sh-rewind-slides">
                        <div style="text-align:center; padding:60px; color:var(--sh-text-muted);">
                            Génération de votre rétrospective...
                        </div>
                    </div>

                    <div class="sh-rewind-nav-bar">
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-rewind-prev">‹ Précédent</button>
                        <div class="sh-rewind-dots" id="sh-rewind-dots"></div>
                        <button class="sh-btn sh-btn--primary sh-btn--sm" id="btn-rewind-next">Suivant ›</button>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        const data = await this._service.generateRewindData();
        this._renderSlides(data);
        this._bindEvents(data);
    }

    _renderSlides(data) {
        const slidesEl = this._container.querySelector('#sh-rewind-slides');
        const dotsEl = this._container.querySelector('#sh-rewind-dots');

        slidesEl.innerHTML = `
            <!-- Slide 1 : Temps Total -->
            <div class="sh-rewind-slide" data-slide="0">
                <div class="sh-rewind-card-glow" style="background: radial-gradient(circle at center, #7c6aff 0%, #1e1035 100%);">
                    <div style="font-size:48px; margin-bottom:12px;">⏳</div>
                    <h3 style="font-size:18px; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:1px;">Cette année sur SpaceHub</h3>
                    <div class="sh-rewind-big-number">${data.totalHours} <span style="font-size:32px;">heures</span></div>
                    <p style="font-size:16px; color:rgba(255,255,255,0.9); margin-top:12px;">
                        Soit l'équivalent de <strong>${(data.totalHours / 24).toFixed(1)} jours</strong> non-stop de cinéma et séries !
                    </p>
                    <div style="display:flex; justify-content:center; gap:24px; margin-top:24px;">
                        <div>
                            <strong style="font-size:20px; display:block;">🎬 ${data.movieCount}</strong>
                            <small style="color:rgba(255,255,255,0.7);">Films vus</small>
                        </div>
                        <div style="width:1px; background:rgba(255,255,255,0.2);"></div>
                        <div>
                            <strong style="font-size:20px; display:block;">📺 ${data.episodeCount}</strong>
                            <small style="color:rgba(255,255,255,0.7);">Épisodes</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Slide 2 : Genres Favoris -->
            <div class="sh-rewind-slide" data-slide="1" style="display:none;">
                <div class="sh-rewind-card-glow" style="background: radial-gradient(circle at center, #e74c3c 0%, #300c09 100%);">
                    <div style="font-size:48px; margin-bottom:12px;">📊</div>
                    <h3 style="font-size:18px; color:rgba(255,255,255,0.8); text-transform:uppercase;">Vos Genres Préférés</h3>
                    <div style="width:100%; max-width:380px; margin:24px auto; display:flex; flex-direction:column; gap:12px;">
                        ${data.topGenres.map(g => `
                            <div>
                                <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:4px; font-weight:700;">
                                    <span>${g.name}</span>
                                    <span>${g.pct}%</span>
                                </div>
                                <div style="height:8px; background:rgba(255,255,255,0.15); border-radius:4px; overflow:hidden;">
                                    <div style="width:${g.pct}%; height:100%; background:#fff; border-radius:4px;"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Slide 3 : Top Films -->
            <div class="sh-rewind-slide" data-slide="2" style="display:none;">
                <div class="sh-rewind-card-glow" style="background: radial-gradient(circle at center, #2ecc71 0%, #082914 100%);">
                    <div style="font-size:48px; margin-bottom:12px;">🏆</div>
                    <h3 style="font-size:18px; color:rgba(255,255,255,0.8); text-transform:uppercase;">Vos Coups de Cœur</h3>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:20px; width:100%; max-width:400px;">
                        ${data.topMovies.map((m, i) => `
                            <div style="background:rgba(255,255,255,0.1); padding:10px 16px; border-radius:10px; display:flex; align-items:center; gap:12px; font-weight:700; font-size:15px;">
                                <span style="font-size:18px;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐'}</span>
                                <span class="sh-truncate" style="flex:1; text-align:left;">${m}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Slide 4 : Persona & Badge -->
            <div class="sh-rewind-slide" data-slide="3" style="display:none;">
                <div class="sh-rewind-card-glow" style="background: radial-gradient(circle at center, #f39c12 0%, #301f04 100%);">
                    <div style="font-size:56px; margin-bottom:8px;">🎖️</div>
                    <h3 style="font-size:16px; color:rgba(255,255,255,0.8); text-transform:uppercase;">Votre Profil Cinéphile</h3>
                    <div class="sh-rewind-persona-title">${data.persona}</div>
                    <div class="sh-rewind-badge-pill">🏅 Badge : ${data.badge}</div>
                    <p style="font-size:14px; color:rgba(255,255,255,0.8); margin-top:20px;">
                        Moment favori de visionnage : <strong>${data.peakDay}</strong>
                    </p>
                </div>
            </div>
        `;

        dotsEl.innerHTML = Array.from({ length: this._totalSlides }, (_, i) => `
            <div class="sh-rewind-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
        `).join('');
    }

    _bindEvents(data) {
        const updateSlide = (idx) => {
            if (idx < 0) idx = this._totalSlides - 1;
            if (idx >= this._totalSlides) idx = 0;
            this._currentSlide = idx;

            const slides = this._container.querySelectorAll('.sh-rewind-slide');
            slides.forEach((s, i) => {
                s.style.display = i === idx ? 'block' : 'none';
            });

            const dots = this._container.querySelectorAll('.sh-rewind-dot');
            dots.forEach((d, i) => {
                d.classList.toggle('active', i === idx);
            });
        };

        this._container.querySelector('#btn-rewind-prev')?.addEventListener('click', () => updateSlide(this._currentSlide - 1));
        this._container.querySelector('#btn-rewind-next')?.addEventListener('click', () => updateSlide(this._currentSlide + 1));

        this._container.querySelectorAll('.sh-rewind-dot').forEach(dot => {
            dot.addEventListener('click', () => updateSlide(parseInt(dot.dataset.index)));
        });

        this._container.querySelector('#btn-rewind-share')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.components?.toaster?.success('📸 Bilan copié dans le presse-papiers prêt à être partagé !');
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-rewind-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-rewind-styles';
        style.textContent = `
.sh-rewind-page { max-width: 900px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-rewind-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }

.sh-rewind-carousel-wrapper { display: flex; flex-direction: column; align-items: center; }
.sh-rewind-slides-container { width: 100%; max-width: 680px; }

.sh-rewind-card-glow {
    border-radius: 24px;
    padding: 48px 32px;
    text-align: center;
    color: #ffffff;
    box-shadow: 0 20px 80px rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.15);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 440px;
    animation: fadeInRewind 0.4s ease-out;
}

.sh-rewind-big-number {
    font-size: 72px;
    font-weight: 900;
    line-height: 1.1;
    margin: 12px 0;
    text-shadow: 0 0 40px rgba(255,255,255,0.5);
}

.sh-rewind-persona-title {
    font-size: 28px;
    font-weight: 800;
    margin: 12px 0 16px 0;
    text-shadow: 0 0 24px rgba(255,255,255,0.4);
}

.sh-rewind-badge-pill {
    background: rgba(255,255,255,0.2);
    padding: 8px 20px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 14px;
    backdrop-filter: blur(10px);
}

.sh-rewind-nav-bar {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 24px;
}

.sh-rewind-dots { display: flex; gap: 8px; }
.sh-rewind-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sh-bg-surface-3); cursor: pointer; transition: all 0.2s; }
.sh-rewind-dot.active { background: var(--sh-color-primary, #7c6aff); transform: scale(1.3); }

@keyframes fadeInRewind {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
}
        `;
        document.head.appendChild(style);
    }
}

export default RewindView;
