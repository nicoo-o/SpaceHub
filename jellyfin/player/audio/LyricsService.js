/**
 * SpaceHub — Real-Time Synchronized Lyrics Service (Karaoke Engine)
 * Version: 1.0.0
 *
 * Moteur de paroles synchronisées ligne par ligne.
 * Récupère les paroles LRC via l'API LRCLIB ou Jellyfin et affiche
 * une interface immersive de karaoké avec défilement fluide et rétro-éclairage d'album.
 */

'use strict';

import Logger from '../../../core/Logger.js';

class LyricsService {
    constructor() {
        this._log = new Logger('LyricsService');
        this._currentLyrics = []; // [{ time: number, text: string }]
        this._activeModal = null;
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère et parse les paroles d'un titre musical.
     * @param {Object} track - Média musical Jellyfin
     * @returns {Promise<Array<Object>>}
     */
    async fetchLyrics(track) {
        this._currentLyrics = [];
        if (!track) return [];

        const title = track.Name || '';
        const artist = track.Artists?.[0] || track.AlbumArtist || '';
        const album = track.Album || '';

        // 1. Essayer LRCLIB API
        try {
            const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&album_name=${encodeURIComponent(album)}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.syncedLyrics) {
                    this._currentLyrics = this._parseLRC(data.syncedLyrics);
                    this._log.info(`Paroles synchronisées trouvées pour "${title}" (LRCLIB).`);
                    return this._currentLyrics;
                } else if (data.plainLyrics) {
                    this._currentLyrics = data.plainLyrics.split('\n').map((line, i) => ({ time: i * 5, text: line }));
                    return this._currentLyrics;
                }
            }
        } catch (err) {
            this._log.warn('Erreur LRCLIB:', err.message);
        }

        // 2. Fallback Jellyfin native lyrics
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Items/${track.Id}/Lyrics`, {
                headers: this._auth?.getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                if (data.Lyrics) {
                    this._currentLyrics = data.Lyrics.map(l => ({
                        time: (l.Start || 0) / 10000000,
                        text: l.Text || ''
                    }));
                    return this._currentLyrics;
                }
            }
        } catch {
            // ignore
        }

        return [];
    }

    _parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const result = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

        for (const line of lines) {
            let match;
            timeRegex.lastIndex = 0;
            while ((match = timeRegex.exec(line)) !== null) {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const ms = parseInt(match[3].padEnd(3, '0').slice(0, 3), 10);
                const timeInSeconds = min * 60 + sec + ms / 1000;
                const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();

                if (text) {
                    result.push({ time: timeInSeconds, text });
                }
            }
        }

        return result.sort((a, b) => a.time - b.time);
    }

    /**
     * Ouvre la vue immersive de karaoké / paroles synchronisées.
     * @param {Object} track
     * @param {Object} audioPlayer
     */
    async openLyricsModal(track, audioPlayer) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const lyrics = await this.fetchLyrics(track);
        const serverUrl = this._auth?.getServerUrl();
        const token = this._auth?.getToken();
        const imgTag = track.ImageTags?.Primary || track.AlbumPrimaryImageTag;
        const coverUrl = imgTag ? `${serverUrl}/Items/${track.Id}/Images/Primary?tag=${imgTag}&maxWidth=300&api_key=${token}` : '';

        const modal = new Modal({
            id: 'lyrics-modal',
            title: `🎤 Paroles : ${track.Name} - ${track.Artists?.[0] || 'Artiste'}`,
            size: 'lg',
            content: `
                <div class="sh-lyrics-container">
                    <div class="sh-lyrics-side">
                        ${coverUrl ? `<img src="${coverUrl}" class="sh-lyrics-cover" alt="" />` : `<div class="sh-lyrics-cover-placeholder">🎵</div>`}
                        <h3>${track.Name}</h3>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin:4px 0;">${track.Artists?.join(', ') || 'Artiste inconnu'}</p>
                        <div style="font-size:12px; color:var(--sh-text-muted); margin-top:8px;">${track.Album || ''}</div>
                    </div>

                    <div class="sh-lyrics-scroll" id="sh-lyrics-scroll-box">
                        ${lyrics.length === 0 ? '<p style="color:var(--sh-text-muted); text-align:center; margin-top:60px;">Aucune parole synchronisée disponible pour ce titre.</p>' : ''}
                        ${lyrics.map((l, i) => `
                            <div class="sh-lyric-line" data-index="${i}" data-time="${l.time}">
                                ${l.text}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
        });

        modal.open();
        this._activeModal = modal;

        // Synchronisation en direct avec le lecteur audio
        const scrollBox = modal._el.querySelector('#sh-lyrics-scroll-box');
        const lines = modal._el.querySelectorAll('.sh-lyric-line');

        const updateActiveLine = (currentTime) => {
            let activeIdx = -1;
            for (let i = 0; i < lyrics.length; i++) {
                if (currentTime >= lyrics[i].time) {
                    activeIdx = i;
                } else {
                    break;
                }
            }

            lines.forEach((line, i) => {
                const isActive = i === activeIdx;
                line.classList.toggle('active', isActive);
                if (isActive) {
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        };

        const timeListener = () => {
            const state = audioPlayer?.getState();
            if (state) updateActiveLine(state.currentTime);
        };

        window.SpaceHub?.core?.eventBus?.on('audio:timeupdate', timeListener);

        modal._el.querySelector('[data-action="close"]')?.addEventListener('click', () => {
            window.SpaceHub?.core?.eventBus?.off('audio:timeupdate', timeListener);
            this._activeModal = null;
        });

        // Click on a line to seek directly to that lyric timestamp!
        lines.forEach(line => {
            line.addEventListener('click', () => {
                const t = parseFloat(line.dataset.time);
                if (audioPlayer?._audio) {
                    audioPlayer._audio.currentTime = t;
                }
            });
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-lyrics-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-lyrics-styles';
        style.textContent = `
.sh-lyrics-container {
    display: flex;
    gap: 32px;
    height: 480px;
}

.sh-lyrics-side {
    width: 200px;
    flex-shrink: 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.sh-lyrics-cover {
    width: 160px;
    height: 160px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    margin-bottom: 16px;
    animation: pulseCover 3s ease-in-out infinite alternate;
}

.sh-lyrics-cover-placeholder {
    width: 160px;
    height: 160px;
    border-radius: 12px;
    background: var(--sh-bg-surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    margin-bottom: 16px;
}

.sh-lyrics-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 40px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    scroll-behavior: smooth;
}

.sh-lyric-line {
    font-size: 18px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 6px 12px;
    border-radius: 8px;
}

.sh-lyric-line:hover {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.05);
}

.sh-lyric-line.active {
    font-size: 24px;
    font-weight: 800;
    color: var(--sh-color-primary, #7c6aff);
    text-shadow: 0 0 20px rgba(124, 106, 255, 0.6);
    transform: scale(1.04);
}

@keyframes pulseCover {
    0% { transform: scale(1); }
    100% { transform: scale(1.03); }
}
        `;
        document.head.appendChild(style);
    }
}

export default LyricsService;
