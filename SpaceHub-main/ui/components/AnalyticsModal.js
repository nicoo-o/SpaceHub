/**
 * SpaceHub — AnalyticsModal
 * Feuille de statistiques personnelles immersive (style Apple Wrapped & Tautulli).
 */

'use strict';

import MediaAnalyticsService from '../../jellyfin/analytics/MediaAnalyticsService.js';
import { escapeHtml } from '../../core/utils/domUtils.js';

export class AnalyticsModal {
    constructor() {
        this._service = new MediaAnalyticsService();
    }

    /**
     * Ouvre la modale des statistiques de visionnage.
     */
    async open() {
        document.getElementById('sh-analytics-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-analytics-modal';
        modal.className = 'sh-analytics-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'sh-analytics-title');
        const previousFocus = document.activeElement;
        modal.innerHTML = `
            <div class="sh-analytics-modal-card sh-scrollbar">
                <div class="sh-analytics-header">
                    <div>
                        <div class="sh-analytics-badge">
                            <span class="sh-pulse-dot"></span>
                            <span>STATISTIQUES & ACTIVITÉ PERSONNELLE</span>
                        </div>
                        <h2 class="sh-analytics-title" id="sh-analytics-title">Mes Statistiques SpaceHub</h2>
                        <p class="sh-analytics-subtitle">Analyse détaillée de vos habitudes de visionnage et de votre médiathèque.</p>
                    </div>
                    <button class="sh-analytics-close-btn" id="sh-analytics-close" aria-label="Fermer les statistiques">✕</button>
                </div>

                <div class="sh-analytics-body" id="sh-analytics-content">
                    <div style="padding: 40px; text-align: center; color: rgba(255,255,255,0.5);">
                        Calcul des statistiques en cours...
                    </div>
                </div>

                <div class="sh-analytics-footer">
                    <button class="sh-analytics-done-btn" id="sh-analytics-done">Fermer</button>
                </div>
            </div>
        `;

        this._injectStyles();
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));

        let isClosed = false;
        let closeTimer = null;
        const closeModal = () => {
            if (isClosed) return;
            isClosed = true;
            modal.classList.remove('open');
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                modal.remove();
                previousFocus?.focus?.();
            }, 260);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeAndCleanup();
                return;
            }
            if (event.key === 'Tab') {
                const focusables = Array.from(modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        requestAnimationFrame(() => modal.querySelector('#sh-analytics-close')?.focus());
        const originalCloseModal = closeModal;
        const closeAndCleanup = () => {
            document.removeEventListener('keydown', onKeyDown);
            originalCloseModal();
        };

        modal.querySelector('#sh-analytics-close')?.addEventListener('click', closeAndCleanup);

        modal.querySelector('#sh-analytics-done')?.addEventListener('click', closeAndCleanup);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAndCleanup();
        });

        await this._loadStats(modal);
        if (isClosed) return;
    }

    async _loadStats(modal) {
        const contentEl = modal.querySelector('#sh-analytics-content');
        if (!contentEl) return;

        try {
            const stats = await this._service.getStats();

            contentEl.innerHTML = `
                <!-- 1. Grands Compteurs Lumineux -->
                <div class="sh-analytics-counters-grid">
                    <div class="sh-stat-card primary">
                        <span class="sh-stat-card-icon">⏱️</span>
                        <div class="sh-stat-card-val">${escapeHtml(stats.totalWatchTimeHours)} h</div>
                        <div class="sh-stat-card-label">Temps Total Regardé (${escapeHtml(stats.totalWatchTimeDays)} jours)</div>
                    </div>
                    <div class="sh-stat-card">
                        <span class="sh-stat-card-icon">🎬</span>
                        <div class="sh-stat-card-val">${escapeHtml(stats.playedMoviesCount)}</div>
                        <div class="sh-stat-card-label">Films Visionnés</div>
                    </div>
                    <div class="sh-stat-card">
                        <span class="sh-stat-card-icon">📺</span>
                        <div class="sh-stat-card-val">${escapeHtml(stats.playedEpisodesCount)}</div>
                        <div class="sh-stat-card-label">Épisodes de Séries Vus</div>
                    </div>
                </div>

                <div class="sh-analytics-bento-row">
                    <!-- 2. Top Genres Préférés -->
                    <div class="sh-analytics-bento-box">
                        <h3 class="sh-analytics-box-title">🎭 Top Genres Favoris</h3>
                        <div class="sh-genres-bars-list">
                            ${stats.topGenres.length > 0 ? stats.topGenres.map(g => `
                                <div class="sh-genre-bar-item">
                                    <div class="sh-genre-bar-header">
                                        <span class="sh-genre-name">${escapeHtml(g.name)}</span>
                                        <span class="sh-genre-percent">${escapeHtml(g.percentage)}%</span>
                                    </div>
                                    <div class="sh-genre-progress-track">
                                        <div class="sh-genre-progress-fill" style="width: ${escapeHtml(g.percentage)}%"></div>
                                    </div>
                                </div>
                            `).join('') : '<p style="color:rgba(255,255,255,0.4); font-size:13px;">Pas encore assez de données de visionnage.</p>'}
                        </div>
                    </div>

                    <!-- 3. Répartition des Qualités & HDR -->
                    <div class="sh-analytics-bento-box">
                        <h3 class="sh-analytics-box-title">💎 Qualité & Formats Vidéo</h3>
                        <div class="sh-quality-metrics-list">
                            <div class="sh-quality-pill">
                                <span class="sh-quality-dot uhd"></span>
                                <div class="sh-quality-text">
                                    <strong>4K Ultra HD</strong>
                                    <small>${escapeHtml(stats.qualityDistribution.uhd4k)} titres (${escapeHtml(stats.resolutionPercentages.uhd4k)}%)</small>
                                </div>
                            </div>
                            <div class="sh-quality-pill">
                                <span class="sh-quality-dot fhd"></span>
                                <div class="sh-quality-text">
                                    <strong>Full HD 1080p</strong>
                                    <small>${escapeHtml(stats.qualityDistribution.fhd1080p)} titres (${escapeHtml(stats.resolutionPercentages.fhd1080p)}%)</small>
                                </div>
                            </div>
                            <div class="sh-quality-pill">
                                <span class="sh-quality-dot hdr"></span>
                                <div class="sh-quality-text">
                                    <strong>Dolby Vision / HDR10</strong>
                                    <small>${escapeHtml(stats.qualityDistribution.hdr)} titres masterisés</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            contentEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:20px;">Impossible de charger les statistiques.</p>';
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-analytics-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-analytics-modal-styles';
        style.textContent = `
.sh-analytics-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.80);
    backdrop-filter: blur(48px) saturate(180%);
    -webkit-backdrop-filter: blur(48px) saturate(180%);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
    padding: 24px;
    box-sizing: border-box;
}

.sh-analytics-modal-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

.sh-analytics-modal-card {
    width: 100%;
    max-width: 820px;
    max-height: 88vh;
    background: rgba(14, 14, 18, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 28px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    padding: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 24px;
    transform: scale(0.96) translateY(12px);
    transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
    overflow-y: auto;
}

.sh-analytics-modal-overlay.open .sh-analytics-modal-card {
    transform: scale(1) translateY(0);
}

.sh-analytics-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 20px;
}

.sh-analytics-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 100px;
    font-size: 10px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
}

.sh-analytics-title {
    font-size: 24px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.5px;
}

.sh-analytics-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    margin: 4px 0 0 0;
}

.sh-analytics-close-btn {
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #ffffff;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 15px;
    transition: all 160ms ease;
}

.sh-analytics-close-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.08);
}

.sh-analytics-counters-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
}

@media (max-width: 600px) {
    .sh-analytics-counters-grid {
        grid-template-columns: 1fr;
    }
}

.sh-stat-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    backdrop-filter: blur(20px);
}

.sh-stat-card.primary {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.20);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.sh-stat-card-icon {
    font-size: 22px;
}

.sh-stat-card-val {
    font-size: 28px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.5px;
}

.sh-stat-card-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
    font-weight: 500;
}

.sh-analytics-bento-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-top: 16px;
}

@media (max-width: 600px) {
    .sh-analytics-bento-row {
        grid-template-columns: 1fr;
    }
}

.sh-analytics-bento-box {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 20px;
}

.sh-analytics-box-title {
    font-size: 15px;
    font-weight: 600;
    color: #ffffff;
    margin: 0 0 16px 0;
}

.sh-genres-bars-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sh-genre-bar-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sh-genre-bar-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
}

.sh-genre-name {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
}

.sh-genre-percent {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
}

.sh-genre-progress-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 100px;
    overflow: hidden;
}

.sh-genre-progress-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 100px;
}

.sh-quality-metrics-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sh-quality-pill {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 12px;
}

.sh-quality-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.sh-quality-dot.uhd {
    background: #64d2ff;
    box-shadow: 0 0 8px #64d2ff;
}

.sh-quality-dot.fhd {
    background: #30d158;
    box-shadow: 0 0 8px #30d158;
}

.sh-quality-dot.hdr {
    background: #ffd60a;
    box-shadow: 0 0 8px #ffd60a;
}

.sh-quality-text strong {
    display: block;
    font-size: 13px;
    color: #ffffff;
}

.sh-quality-text small {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-analytics-footer {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 20px;
}

.sh-analytics-done-btn {
    background: #ffffff;
    border: none;
    color: #000000;
    padding: 10px 24px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 180ms ease;
}

.sh-analytics-done-btn:hover {
    transform: scale(1.04);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.35);
}
        `;
        document.head.appendChild(style);
    }
}

export default AnalyticsModal;
