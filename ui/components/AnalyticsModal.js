/**
 * SpaceHub — AnalyticsModal
 * Feuille de statistiques personnelles immersive (style Apple Wrapped & Tautulli).
 */

'use strict';

import MediaAnalyticsService from '../../jellyfin/analytics/MediaAnalyticsService.js';
import { escapeHtml } from '../../core/utils/domUtils.js';

import './AnalyticsModal.css';
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
                    <div style="padding: 40px; text-align: center; color: rgba(var(--sh-ink, 255, 255, 255), 0.5);">
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
                            `).join('') : '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); font-size:13px;">Pas encore assez de données de visionnage.</p>'}
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
            contentEl.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:20px;">Impossible de charger les statistiques.</p>';
        }
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans AnalyticsModal.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default AnalyticsModal;
