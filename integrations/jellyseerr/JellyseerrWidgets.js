
/**
 * Ouvre le menu modal interactif de demande Jellyseerr avec profils et sélection de saisons.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} jellyseerr - Instance du service Jellyseerr
 */
function openJellyseerrRequestModal(item, jellyseerr) {
    const tmdbId = item.id || item.tmdbId;
    const type = item.mediaType || (item.firstAirDate ? 'tv' : 'movie');
    const typeLabel = type === 'tv' ? 'Série TV' : 'Long-Métrage';
    let title = item.title || item.name || 'Média';
    let poster = item.posterPath ? `https://image.tmdb.org/t/p/w400${item.posterPath}` : '';
    let year = (item.releaseDate || item.firstAirDate || '').slice(0, 4);
    let overview = item.overview || '';

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'sh-jellyseerr-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="sh-jellyseerr-modal-card">
            <button class="sh-jellyseerr-modal-close" id="sh-jellyseerr-close" title="Fermer">✕</button>
            <div class="sh-jellyseerr-modal-header">
                <div class="sh-jellyseerr-modal-poster-wrap">
                    ${poster ? `<img src="${poster}" alt="${title}" />` : '<div class="sh-jellyseerr-modal-poster-fallback">🎬</div>'}
                </div>
                <div class="sh-jellyseerr-modal-header-info">
                    <div class="sh-jellyseerr-modal-type-tag">${typeLabel} ${year ? '• ' + year : ''}</div>
                    <h3 class="sh-jellyseerr-modal-title">${title}</h3>
                    <div class="sh-jellyseerr-modal-status-badge" id="sh-req-status-badge">
                        <span class="sh-status-dot"></span>
                        <span class="sh-status-text">Chargement du statut...</span>
                    </div>
                </div>
            </div>

            <div class="sh-jellyseerr-modal-body">
                <p class="sh-jellyseerr-modal-desc" id="sh-jellyseerr-desc">${overview || 'Récupération du synopsis officiel...'}</p>

                <div class="sh-jellyseerr-form-row">
                    <label class="sh-jellyseerr-form-label">Profil de Qualité</label>
                    <select class="sh-jellyseerr-form-select" id="sh-jellyseerr-profile-select">
                        <option value="default">Chargement des profils du serveur...</option>
                    </select>
                </div>

                <div class="sh-jellyseerr-form-row" id="sh-jellyseerr-folder-row">
                    <label class="sh-jellyseerr-form-label">Dossier de Destination (Serveur)</label>
                    <select class="sh-jellyseerr-form-select" id="sh-jellyseerr-folder-select">
                        <option value="default">Dossier par défaut du serveur</option>
                    </select>
                </div>

                ${type === 'tv' ? `
                    <div class="sh-jellyseerr-form-row" id="sh-jellyseerr-seasons-row">
                        <label class="sh-jellyseerr-form-label">Saisons à demander</label>
                        <div class="sh-jellyseerr-seasons-container" id="sh-jellyseerr-seasons-box">
                            <label class="sh-checkbox-pill"><input type="checkbox" id="sh-season-all" value="all" checked /> <span>Toutes les saisons</span></label>
                        </div>
                    </div>
                ` : ''}

                <div class="sh-jellyseerr-modal-actions">
                    <button class="sh-jellyseerr-btn-submit" id="sh-btn-submit-request">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Confirmer la demande</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    requestAnimationFrame(() => modalOverlay.classList.add('open'));

    const closeModal = () => {
        modalOverlay.classList.remove('open');
        setTimeout(() => modalOverlay.remove(), 240);
    };

    modalOverlay.querySelector('#sh-jellyseerr-close')?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // ── CHARGEMENT ASYNCHRONE DES VRAIES DONNÉES SERVEUR & TMDB ──
    (async () => {
        const api = jellyseerr?.api || window.SpaceHub?.core?.api?.getClient('jellyseerr');
        if (!api) return;

        // 1. Récupérer les détails TMDB réels (synopsis complet, saisons)
        try {
            const details = await api.getMediaDetails?.(type, tmdbId);
            if (details) {
                if (details.overview) {
                    const descEl = modalOverlay.querySelector('#sh-jellyseerr-desc');
                    if (descEl) descEl.textContent = details.overview;
                }
                const badge = modalOverlay.querySelector('#sh-req-status-badge');
                if (badge) {
                    const mediaStatus = details.mediaInfo?.status;
                    if (mediaStatus === 5) {
                        badge.className = 'sh-jellyseerr-modal-status-badge status-available';
                        badge.querySelector('.sh-status-text').textContent = 'Disponible sur Jellyfin';
                    } else if (mediaStatus === 3 || mediaStatus === 4) {
                        badge.className = 'sh-jellyseerr-modal-status-badge status-requested';
                        badge.querySelector('.sh-status-text').textContent = 'En cours de téléchargement';
                    } else if (mediaStatus === 2) {
                        badge.className = 'sh-jellyseerr-modal-status-badge status-requested';
                        badge.querySelector('.sh-status-text').textContent = 'Demandé • En attente';
                    } else {
                        badge.className = 'sh-jellyseerr-modal-status-badge';
                        badge.querySelector('.sh-status-text').textContent = 'Prêt pour la demande';
                    }
                }

                // Saisons détaillées
                if (type === 'tv' && details.seasons && details.seasons.length > 0) {
                    const seasonsBox = modalOverlay.querySelector('#sh-jellyseerr-seasons-box');
                    if (seasonsBox) {
                        const regularSeasons = details.seasons.filter(s => s.seasonNumber > 0);
                        if (regularSeasons.length > 0) {
                            seasonsBox.innerHTML = regularSeasons.map(s => `
                                <label class="sh-checkbox-pill">
                                    <input type="checkbox" class="sh-season-chk" value="${s.seasonNumber}" checked />
                                    <span>Saison ${s.seasonNumber} (${s.episodeCount || 0} ép.)</span>
                                </label>
                            `).join('');
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[JellyseerrModal] Erreur détails média:', e);
        }

        // 2. Récupérer les VRAIS Profils Qualité et Dossiers depuis Radarr / Sonarr
        try {
            const servers = type === 'tv' ? await api.getSonarrServers?.() : await api.getRadarrServers?.();
            const server = (Array.isArray(servers) && servers.length > 0) ? servers[0] : null;

            const profileSelect = modalOverlay.querySelector('#sh-jellyseerr-profile-select');
            const folderSelect = modalOverlay.querySelector('#sh-jellyseerr-folder-select');

            if (server && profileSelect) {
                if (server.profiles && server.profiles.length > 0) {
                    profileSelect.innerHTML = server.profiles.map(p => `
                        <option value="${p.id}" ${p.id === server.activeProfileId ? 'selected' : ''}>${p.name}</option>
                    `).join('');
                } else {
                    profileSelect.innerHTML = `
                        <option value="1" selected>4K UHD • Dolby Vision & HDR</option>
                        <option value="2">1080p HD • Qualité Standard</option>
                        <option value="3">720p • Économie d'espace</option>
                    `;
                }

                if (server.rootFolders && server.rootFolders.length > 0 && folderSelect) {
                    folderSelect.innerHTML = server.rootFolders.map(rf => `
                        <option value="${rf.path}" ${rf.path === server.activeDirectory ? 'selected' : ''}>${rf.path}</option>
                    `).join('');
                }
            } else if (profileSelect) {
                profileSelect.innerHTML = `
                    <option value="1" selected>4K UHD • Dolby Vision & HDR</option>
                    <option value="2">1080p HD • Qualité Standard</option>
                    <option value="3">720p • Économie d'espace</option>
                `;
            }
        } catch (e) {
            console.warn('[JellyseerrModal] Erreur récupération serveurs Radarr/Sonarr:', e);
        }
    })();

    // ── GESTION DE LA SOUMISSION AVANCÉE ──
    const submitBtn = modalOverlay.querySelector('#sh-btn-submit-request');
    submitBtn?.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="sh-spinner-inline"></span><span>Transmission à Jellyseerr...</span>';
        
        const profileSelect = modalOverlay.querySelector('#sh-jellyseerr-profile-select');
        const folderSelect = modalOverlay.querySelector('#sh-jellyseerr-folder-select');
        
        const profileId = profileSelect && profileSelect.value !== 'default' ? parseInt(profileSelect.value, 10) : undefined;
        const rootFolder = folderSelect && folderSelect.value !== 'default' ? folderSelect.value : undefined;

        let selectedSeasons = null;
        if (type === 'tv') {
            const checkedBoxes = modalOverlay.querySelectorAll('.sh-season-chk:checked');
            if (checkedBoxes.length > 0) {
                selectedSeasons = Array.from(checkedBoxes).map(b => parseInt(b.value, 10));
            } else {
                selectedSeasons = 'all';
            }
        }

        const payload = {
            mediaType: type === 'tv' ? 'tv' : 'movie',
            mediaId: Number(tmdbId)
        };
        if (profileId) payload.profileId = profileId;
        if (rootFolder) payload.rootFolder = rootFolder;
        if (selectedSeasons) payload.seasons = selectedSeasons;

        try {
            const api = jellyseerr?.api || window.SpaceHub?.core?.api?.getClient('jellyseerr');
            await api.createRequest(payload);

            submitBtn.classList.add('success');
            submitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demande validée !</span>';
            const badge = modalOverlay.querySelector('#sh-req-status-badge');
            if (badge) {
                badge.className = 'sh-jellyseerr-modal-status-badge status-requested';
                badge.querySelector('.sh-status-text').textContent = 'Demandé • En attente';
            }
            window.SpaceHub?.ui?.components?.toaster?.success(`Demande transmise avec succès pour "${title}" !`);
            setTimeout(closeModal, 1200);
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Réessayer</span>';
            window.SpaceHub?.ui?.components?.toaster?.error(`Erreur: ${err.message || 'Impossible d envoyer la demande'}`);
        }
    });
}


/**
 * SpaceHub — Jellyseerr Dashboard & Discovery Widgets
 * Version: 1.0.0 (Apple VisionOS Glass Bento)
 *
 * Widgets multimédias connectés à l'API Jellyseerr / Overseerr :
 * 1. JellyseerrTrendingWidget : Tendances & Découvertes globales (Films & Séries)
 * 2. JellyseerrPopularMoviesWidget : Films Populaires en streaming
 * 3. JellyseerrPopularSeriesWidget : Séries & Nouveautés TV populaires
 * 4. JellyseerrUpcomingWidget : Sorties très attendues prochainement
 * 5. JellyseerrRequestsWidget : Hub d'approbation et gestion des demandes
 */

'use strict';

/**
 * Génère le balisage HTML d'une carte média Jellyseerr avec design VisionOS.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @returns {string} HTML string
 */
function renderJellyseerrMediaCard(item) {
    const title = item.title || item.name || 'Média';
    const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : '';
    const type = item.mediaType || (item.firstAirDate ? 'tv' : 'movie');
    const typeLabel = type === 'tv' ? 'Série' : 'Film';
    const dateStr = item.releaseDate || item.firstAirDate;
    const year = dateStr ? new Date(dateStr).getFullYear() : '';
    const rating = item.voteAverage ? Number(item.voteAverage).toFixed(1) : null;

    return `
        <div class="sh-jellyseerr-bento-card" data-media-id="${item.id}" data-media-type="${type}">
            <div class="sh-jellyseerr-bento-card__poster-wrap">
                ${poster 
                    ? `<img class="sh-jellyseerr-bento-card__img" src="${poster}" alt="${title}" loading="lazy" />` 
                    : `<div class="sh-jellyseerr-bento-card__placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                       </div>`}
                
                <div class="sh-jellyseerr-bento-card__floating-badges">
                    <span class="sh-jellyseerr-pill-badge sh-jellyseerr-pill-badge--type">${typeLabel}</span>
                    ${rating ? `<span class="sh-jellyseerr-pill-badge sh-jellyseerr-pill-badge--rating">⭐ ${rating}</span>` : ''}
                </div>
            </div>

            <div class="sh-jellyseerr-bento-card__body">
                <div class="sh-jellyseerr-bento-card__meta">
                    <h4 class="sh-jellyseerr-bento-card__title sh-truncate" title="${title}">${title}</h4>
                    <span class="sh-jellyseerr-bento-card__year">${year ? year : typeLabel}</span>
                </div>
                <button class="sh-jellyseerr-req-action-btn" data-type="${type}" data-id="${item.id}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Demander</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Attache les écouteurs de demande rapide sur les boutons d'un conteneur.
 * @param {HTMLElement} container
 * @param {Object} jellyseerr
 */
function bindJellyseerrRequestButtons(container, jellyseerr) {
    // 1. Clic sur la carte globale pour ouvrir la modal de demande complète
    container.querySelectorAll('.sh-jellyseerr-bento-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.sh-jellyseerr-req-action-btn')) return;
            const mediaId = card.dataset.mediaId;
            const mediaType = card.dataset.mediaType;
            const title = card.querySelector('.sh-jellyseerr-bento-card__title')?.textContent || 'Média';
            const posterImg = card.querySelector('.sh-jellyseerr-bento-card__img')?.src || '';
            const year = card.querySelector('.sh-jellyseerr-bento-card__year')?.textContent || '';

            openJellyseerrRequestModal({
                id: mediaId,
                title,
                mediaType,
                posterPath: posterImg ? posterImg.replace('https://image.tmdb.org/t/p/w300', '') : '',
                releaseDate: year
            }, jellyseerr);
        });
    });

    // 2. Clic sur le bouton de demande rapide
    container.querySelectorAll('.sh-jellyseerr-req-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            const id = btn.dataset.id;
            btn.disabled = true;
            btn.innerHTML = `<span class="sh-spinner-inline"></span><span>Envoi...</span>`;
            
            try {
                await jellyseerr.requestMedia(type, id);
                btn.classList.add('requested');
                btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demandé</span>`;
                window.SpaceHub?.ui?.components?.toaster?.success(`Demande transmise à Jellyseerr !`);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = `<span>Réessayer</span>`;
                window.SpaceHub?.ui?.components?.toaster?.error(`Erreur: ${err.message || 'Impossible de faire la demande'}`);
            }
        });
    });
}

function injectJellyseerrSharedStyles() {
    if (document.getElementById('sh-jellyseerr-shared-styles')) return;
    const style = document.createElement('style');
    style.id = 'sh-jellyseerr-shared-styles';
    style.textContent = `

/* ── Modale de Demande Jellyseerr Ultra-Glass ── */
.sh-jellyseerr-modal-overlay {
    position: fixed !important;
    inset: 0 !important;
    background: rgba(0, 0, 0, 0.65) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    z-index: 999999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: opacity 240ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.sh-jellyseerr-modal-overlay.open {
    opacity: 1 !important;
    pointer-events: auto !important;
}
.sh-jellyseerr-modal-card {
    width: 480px !important;
    max-width: 92vw !important;
    background: rgba(20, 20, 28, 0.88) !important;
    backdrop-filter: blur(40px) saturate(190%) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 24px !important;
    padding: 24px !important;
    box-shadow: 0 30px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06) inset !important;
    position: relative !important;
    transform: scale(0.94) translateY(12px) !important;
    transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.sh-jellyseerr-modal-overlay.open .sh-jellyseerr-modal-card {
    transform: scale(1) translateY(0) !important;
}
.sh-jellyseerr-modal-close {
    position: absolute !important;
    top: 18px !important;
    right: 18px !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: #fff !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s !important;
}
.sh-jellyseerr-modal-close:hover {
    background: rgba(255, 255, 255, 0.18) !important;
    transform: scale(1.08) !important;
}
.sh-jellyseerr-modal-header {
    display: flex !important;
    gap: 18px !important;
    margin-bottom: 20px !important;
}
.sh-jellyseerr-modal-poster-wrap {
    width: 100px !important;
    height: 145px !important;
    border-radius: 14px !important;
    overflow: hidden !important;
    background: #111 !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
    flex-shrink: 0 !important;
}
.sh-jellyseerr-modal-poster-wrap img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
}
.sh-jellyseerr-modal-header-info {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
}
.sh-jellyseerr-modal-type-tag {
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
    color: #a1a1aa !important;
    margin-bottom: 4px !important;
}
.sh-jellyseerr-modal-title {
    font-size: 20px !important;
    font-weight: 700 !important;
    color: #fff !important;
    margin: 0 0 10px 0 !important;
    line-height: 1.25 !important;
}
.sh-jellyseerr-modal-status-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 4px 10px !important;
    background: rgba(99, 102, 241, 0.14) !important;
    border: 1px solid rgba(99, 102, 241, 0.28) !important;
    border-radius: 20px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #a5b4fc !important;
    width: fit-content !important;
}
.sh-jellyseerr-modal-status-badge.status-requested {
    background: rgba(34, 197, 94, 0.14) !important;
    border-color: rgba(34, 197, 94, 0.3) !important;
    color: #86efac !important;
}
.sh-status-dot {
    width: 6px !important;
    height: 6px !important;
    border-radius: 50% !important;
    background: currentColor !important;
}
.sh-jellyseerr-modal-desc {
    font-size: 13px !important;
    line-height: 1.5 !important;
    color: rgba(255, 255, 255, 0.72) !important;
    margin-bottom: 18px !important;
    max-height: 72px !important;
    overflow-y: auto !important;
}
.sh-jellyseerr-form-row {
    margin-bottom: 16px !important;
}
.sh-jellyseerr-form-label {
    display: block !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #e4e4e7 !important;
    margin-bottom: 6px !important;
}

.sh-jellyseerr-form-select {
    width: 100% !important;
    padding: 10px 14px !important;
    border-radius: 12px !important;
    background: #181824 !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    color: #ffffff !important;
    font-size: 13px !important;
    outline: none !important;
    cursor: pointer !important;
    color-scheme: dark !important;
}
.sh-jellyseerr-form-select option {
    background: #181824 !important;
    color: #ffffff !important;
    padding: 8px !important;
}
.sh-jellyseerr-seasons-container {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    max-height: 110px !important;
    overflow-y: auto !important;
    padding: 4px 0 !important;
}
.sh-checkbox-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 6px 12px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 20px !important;
    font-size: 12px !important;
    color: #e4e4e7 !important;
    cursor: pointer !important;
}
.sh-checkbox-pill input {
    accent-color: #6366f1 !important;
    cursor: pointer !important;
}

.sh-jellyseerr-modal-actions {
    margin-top: 24px !important;
}
.sh-jellyseerr-btn-submit {
    width: 100% !important;
    padding: 12px 18px !important;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 14px !important;
    color: #fff !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    cursor: pointer !important;
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4) !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.sh-jellyseerr-btn-submit:hover:not(:disabled) {
    transform: translateY(-2px) !important;
    box-shadow: 0 12px 30px rgba(99, 102, 241, 0.6) !important;
}
.sh-jellyseerr-btn-submit.success {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
    box-shadow: 0 8px 24px rgba(34, 197, 94, 0.4) !important;
}


.sh-jellyseerr-carousel {
    display: flex !important;
    flex-direction: row !important;
    overflow-x: auto !important;
    gap: 20px !important;
    padding: 14px 8px 28px 8px !important;
    scroll-behavior: smooth !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
    scroll-snap-type: x mandatory !important;
    width: 100% !important;
    -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
    mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
    transition: mask-image 300ms ease, -webkit-mask-image 300ms ease;
}

.sh-jellyseerr-carousel::-webkit-scrollbar {
    display: none !important;
}

.sh-jellyseerr-carousel.sh-grid-scrolled-middle {
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 48px, #000 calc(100% - 48px), transparent 100%) !important;
    mask-image: linear-gradient(to right, transparent 0%, #000 48px, #000 calc(100% - 48px), transparent 100%) !important;
}

.sh-jellyseerr-carousel.sh-grid-scrolled-end {
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 64px, #000 100%) !important;
    mask-image: linear-gradient(to right, transparent 0%, #000 64px, #000 100%) !important;
}

.sh-jellyseerr-bento-card {
    flex: 0 0 auto !important;
    width: 196px !important;
    scroll-snap-align: start !important;
    scroll-snap-stop: normal !important;
    display: flex !important;
    flex-direction: column !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px !important;
    padding: 8px !important;
    transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
    position: relative !important;
    cursor: default !important;
}

@media (max-width: 768px) {
    .sh-jellyseerr-carousel {
        gap: 16px !important;
    }
    .sh-jellyseerr-bento-card {
        width: 150px !important;
    }
}

.sh-jellyseerr-bento-card:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    border-color: rgba(255, 255, 255, 0.20) !important;
    transform: translateY(-4px) !important;
    box-shadow: 0 14px 35px rgba(0, 0, 0, 0.65) !important;
}

.sh-jellyseerr-bento-card__poster-wrap {
    position: relative !important;
    aspect-ratio: 2/3 !important;
    border-radius: 12px !important;
    overflow: hidden !important;
    background: rgba(0, 0, 0, 0.5) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
}

.sh-jellyseerr-bento-card__img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    display: block !important;
    transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
}

.sh-jellyseerr-bento-card:hover .sh-jellyseerr-bento-card__img {
    transform: scale(1.06) !important;
}

.sh-jellyseerr-bento-card__placeholder {
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(255, 255, 255, 0.02) !important;
}

.sh-jellyseerr-bento-card__floating-badges {
    position: absolute !important;
    top: 6px !important;
    left: 6px !important;
    right: 6px !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    pointer-events: none !important;
}

.sh-jellyseerr-pill-badge {
    padding: 3px 7px !important;
    border-radius: 6px !important;
    font-size: 10.5px !important;
    font-weight: 750 !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    letter-spacing: 0.02em !important;
}

.sh-jellyseerr-pill-badge--type {
    background: rgba(0, 0, 0, 0.75) !important;
    color: #64d2ff !important;
    border: 1px solid rgba(100, 210, 255, 0.3) !important;
}

.sh-jellyseerr-pill-badge--rating {
    background: rgba(0, 0, 0, 0.75) !important;
    color: #ffd60a !important;
    border: 1px solid rgba(255, 214, 10, 0.3) !important;
}

.sh-jellyseerr-bento-card__body {
    padding: 10px 4px 4px 4px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    flex: 1 !important;
    justify-content: space-between !important;
}

.sh-jellyseerr-bento-card__title {
    font-size: 13.5px !important;
    font-weight: 650 !important;
    color: #ffffff !important;
    margin: 0 0 3px 0 !important;
    line-height: 1.3 !important;
}

.sh-jellyseerr-bento-card__year {
    font-size: 11px !important;
    font-weight: 600 !important;
    color: rgba(255, 255, 255, 0.45) !important;
}

.sh-jellyseerr-req-action-btn {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 7px 10px !important;
    border-radius: 10px !important;
    background: rgba(100, 210, 255, 0.12) !important;
    border: 1px solid rgba(100, 210, 255, 0.28) !important;
    color: #64d2ff !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-jellyseerr-req-action-btn:hover:not(:disabled) {
    background: #64d2ff !important;
    color: #000000 !important;
    box-shadow: 0 4px 14px rgba(100, 210, 255, 0.4) !important;
    transform: translateY(-1px) !important;
}

.sh-jellyseerr-req-action-btn.requested {
    background: rgba(50, 215, 75, 0.15) !important;
    border-color: rgba(50, 215, 75, 0.35) !important;
    color: #32d74b !important;
    cursor: default !important;
}

.sh-widget__refresh-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.65) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
}

.sh-widget__refresh-btn:hover {
    background: rgba(255, 255, 255, 0.14) !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
    transform: rotate(45deg) scale(1.08) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

.sh-widget__refresh-btn:active {
    transform: rotate(180deg) scale(0.92) !important;
    background: rgba(255, 255, 255, 0.20) !important;
}

.sh-widget__refresh-btn svg {
    width: 14px !important;
    height: 14px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
    pointer-events: none !important;
}

.sh-spinner-inline {
    width: 11px;
    height: 11px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: shSpin 0.8s linear infinite;
}
    `;
    document.head.appendChild(style);
}

// ─── 1. Widget Tendances & Découverte ─────────────────────────────────────────
class JellyseerrTrendingWidget {
    constructor() {
        this.id = 'jellyseerr-trending';
        this.title = 'Tendances & Découverte (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-trending">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les tendances">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(255,255,255,0.4); padding: 14px 8px;">Chargement des tendances...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getTrendingMedia();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucun média tendance disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && window.SpaceHub?.ui?.gooeyScroller) {
                    window.SpaceHub.ui.gooeyScroller.attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${err.message}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 2. Widget Films Populaires ───────────────────────────────────────────────
class JellyseerrPopularMoviesWidget {
    constructor() {
        this.id = 'jellyseerr-popular-movies';
        this.title = 'Films Populaires (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-popular-movies">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les films populaires">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(255,255,255,0.4); padding: 14px 8px;">Chargement des films populaires...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getPopularMoviesList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucun film populaire disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && window.SpaceHub?.ui?.gooeyScroller) {
                    window.SpaceHub.ui.gooeyScroller.attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${err.message}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 3. Widget Séries Populaires ──────────────────────────────────────────────
class JellyseerrPopularSeriesWidget {
    constructor() {
        this.id = 'jellyseerr-popular-series';
        this.title = 'Séries Populaires & Nouveautés TV (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-popular-series">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les séries populaires">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(255,255,255,0.4); padding: 14px 8px;">Chargement des séries populaires...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getPopularSeriesList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucune série populaire disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && window.SpaceHub?.ui?.gooeyScroller) {
                    window.SpaceHub.ui.gooeyScroller.attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${err.message}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 4. Widget Sorties Très Attendues ─────────────────────────────────────────
class JellyseerrUpcomingWidget {
    constructor() {
        this.id = 'jellyseerr-upcoming';
        this.title = 'Sorties Très Attendues (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-upcoming">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les sorties à venir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(255,255,255,0.4); padding: 14px 8px;">Chargement des prochaines sorties...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getUpcomingMediaList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucune sortie prévue disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && window.SpaceHub?.ui?.gooeyScroller) {
                    window.SpaceHub.ui.gooeyScroller.attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${err.message}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 5. Widget Demandes de Médias (Requests) ──────────────────────────────────
class JellyseerrRequestsWidget {
    constructor() {
        this.id = 'jellyseerr-requests';
        this.title = 'Demandes de Médias (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-requests">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les demandes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des demandes...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <p>Jellyseerr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const res = await jellyseerr.getRequests(20, 0, 'pending');
            const requests = res?.results || [];

            if (!requests || requests.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <p>Aucune demande en attente. Vos utilisateurs sont comblés !</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${requests.map(req => {
                        const media = req.media || {};
                        const user = req.requestedBy || {};
                        const title = media.title || media.name || `Média #${req.id}`;
                        const poster = media.posterPath ? `https://image.tmdb.org/t/p/w200${media.posterPath}` : '';

                        return `
                            <div class="sh-jellyseerr-request-card" data-request-id="${req.id}" style="display: flex; align-items: center; gap: 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 14px; padding: 10px 14px;">
                                <div class="sh-jellyseerr-request-card__poster" style="width: 44px; height: 66px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.3);">
                                    ${poster ? `<img src="${poster}" alt="${title}" style="width:100%; height:100%; object-fit:cover;" loading="lazy"/>` : '<div class="sh-placeholder" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>'}
                                </div>
                                <div class="sh-jellyseerr-request-card__details" style="flex:1;">
                                    <h4 class="sh-jellyseerr-request-card__title sh-truncate" style="margin:0 0 4px 0; color:#fff; font-size:14px;">${title}</h4>
                                    <p class="sh-jellyseerr-request-card__user" style="margin:0; font-size:11.5px; color:rgba(255,255,255,0.5);">Demandé par <strong style="color:rgba(255,255,255,0.85);">${user.displayName || user.email || 'Utilisateur'}</strong></p>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button class="sh-btn sh-btn--primary sh-btn--sm" data-action="approve" data-id="${req.id}">Approuver</button>
                                    <button class="sh-btn sh-btn--ghost sh-btn--sm" data-action="decline" data-id="${req.id}">Refuser</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            contentEl.querySelectorAll('[data-action="approve"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    await jellyseerr.approveRequest(id);
                    await this.loadData(container);
                });
            });

            contentEl.querySelectorAll('[data-action="decline"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    await jellyseerr.declineRequest(id);
                    await this.loadData(container);
                });
            });

        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${err.message}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { 
    JellyseerrRequestsWidget, 
    JellyseerrTrendingWidget, 
    JellyseerrPopularMoviesWidget, 
    JellyseerrPopularSeriesWidget, 
    JellyseerrUpcomingWidget 
};
