/**
 * SpaceHub — Profil d'appareil et négociation de lecture
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * Le lecteur construisait son URL de flux à la main en attaquant directement
 * `/Videos/{id}/master.m3u8`, sans jamais appeler `/Items/{id}/PlaybackInfo` ni
 * envoyer de profil d'appareil. Conséquence : le serveur ne pouvait pas savoir
 * ce que la machine sait décoder, donc il ne pouvait pas choisir la lecture
 * directe — on partait en remux ou en transcodage permanent, même quand le
 * fichier était lisible tel quel. Démarrage lent, CPU serveur consommé pour
 * rien, qualité dégradée.
 *
 * Jellyfin retient le mode de plus haute priorité que le profil déclaré
 * supporte : DirectPlay (octets bruts) > DirectStream (remux) > Transcode.
 * Ce module construit ce profil à partir des capacités RÉELLES de l'appareil,
 * mesurées avec canPlayType(), au lieu d'une liste de codecs écrite en dur.
 */

'use strict';

import Logger from '../../core/Logger.js';

const log = new Logger('DeviceProfile');

/** Teste une capacité de décodage réelle sur cet appareil. */
function canPlay(video, mime) {
    try {
        const r = video.canPlayType(mime);
        return r === 'probably' || r === 'maybe';
    } catch { return false; }
}

/**
 * Sonde l'appareil et retourne ce qu'il sait réellement lire.
 * @param {HTMLVideoElement} [videoEl] élément réutilisé si fourni (évite une allocation)
 */
export function probeCapabilities(videoEl = null) {
    const v = videoEl || document.createElement('video');

    const caps = {
        h264:  canPlay(v, 'video/mp4; codecs="avc1.640029"'),
        hevc:  canPlay(v, 'video/mp4; codecs="hvc1.1.6.L153.B0"') || canPlay(v, 'video/mp4; codecs="hev1.1.6.L153.B0"'),
        vp9:   canPlay(v, 'video/webm; codecs="vp9"') || canPlay(v, 'video/mp4; codecs="vp09.00.10.08"'),
        av1:   canPlay(v, 'video/mp4; codecs="av01.0.08M.08"'),
        aac:   canPlay(v, 'video/mp4; codecs="mp4a.40.2"'),
        mp3:   canPlay(v, 'audio/mpeg'),
        opus:  canPlay(v, 'audio/ogg; codecs="opus"') || canPlay(v, 'video/webm; codecs="opus"'),
        flac:  canPlay(v, 'audio/flac'),
        ac3:   canPlay(v, 'audio/mp4; codecs="ac-3"'),
        eac3:  canPlay(v, 'audio/mp4; codecs="ec-3"'),
        mkv:   canPlay(v, 'video/x-matroska; codecs="avc1.640029"'),
        webm:  canPlay(v, 'video/webm; codecs="vp9,opus"'),
        hls:   canPlay(v, 'application/vnd.apple.mpegurl'),
    };

    // Nombre de canaux audio réellement exploitables, au lieu d'un 6 en dur qui
    // imposait un downmix 5.1 même sur un appareil stéréo.
    let maxAudioChannels = 2;
    try {
        const ctx = window.AudioContext || window.webkitAudioContext;
        if (ctx) {
            const probe = new ctx();
            maxAudioChannels = Math.max(2, Math.min(8, probe.destination.maxChannelCount || 2));
            probe.close?.();
        }
    } catch { /* valeur par défaut conservée */ }

    return { ...caps, maxAudioChannels };
}

/** Liste de codecs vidéo réellement supportés, dans l'ordre de préférence. */
function videoCodecs(caps) {
    return ['h264', 'hevc', 'vp9', 'av1'].filter(k => caps[k])
        .map(k => (k === 'hevc' ? 'hevc' : k)).join(',') || 'h264';
}

function audioCodecs(caps) {
    return ['aac', 'mp3', 'ac3', 'eac3', 'opus', 'flac'].filter(k => caps[k]).join(',') || 'aac';
}

/**
 * Construit le DeviceProfile envoyé à /Items/{id}/PlaybackInfo.
 * @param {object} caps résultat de probeCapabilities()
 * @param {number} [maxBitrate] plafond de débit en bits/s (0 = illimité)
 */
export function buildDeviceProfile(caps, maxBitrate = 0) {
    const vCodecs = videoCodecs(caps);
    const aCodecs = audioCodecs(caps);

    const directPlay = [];
    // On ne déclare DirectPlay que pour des conteneurs réellement lisibles ici.
    if (caps.h264 || caps.hevc) {
        directPlay.push({ Container: 'mp4,m4v', Type: 'Video', VideoCodec: vCodecs, AudioCodec: aCodecs });
    }
    if (caps.mkv) {
        directPlay.push({ Container: 'mkv', Type: 'Video', VideoCodec: vCodecs, AudioCodec: aCodecs });
    }
    if (caps.webm) {
        directPlay.push({ Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' });
    }

    const profile = {
        MaxStreamingBitrate: maxBitrate || undefined,
        MaxStaticBitrate: maxBitrate || undefined,
        MusicStreamingTranscodingBitrate: 384000,
        DirectPlayProfiles: directPlay,
        TranscodingProfiles: [
            {
                Container: 'ts', Type: 'Video', Protocol: 'hls',
                VideoCodec: vCodecs, AudioCodec: aCodecs,
                Context: 'Streaming', MaxAudioChannels: String(caps.maxAudioChannels),
                MinSegments: 1, BreakOnNonKeyFrames: true,
            },
            {
                Container: 'mp4', Type: 'Video', Protocol: 'http',
                VideoCodec: vCodecs, AudioCodec: aCodecs, Context: 'Static',
            },
        ],
        CodecProfiles: [],
        SubtitleProfiles: [
            { Format: 'vtt', Method: 'External' },
            { Format: 'ass', Method: 'Encode' },
            { Format: 'ssa', Method: 'Encode' },
            { Format: 'pgssub', Method: 'Encode' },
            { Format: 'subrip', Method: 'External' },
        ],
        ResponseProfiles: [],
        ContainerProfiles: [],
    };

    log.debug('Profil construit', { vCodecs, aCodecs, channels: caps.maxAudioChannels, maxBitrate });
    return profile;
}

/**
 * Négocie la lecture avec le serveur et retourne comment lire réellement.
 *
 * @returns {Promise<{url:string, playMethod:string, mediaSourceId:string,
 *                    playSessionId:string, isHls:boolean, source:object|null,
 *                    transcodeReasons:string[]}|null>}
 */
export async function negotiatePlayback({ serverUrl, token, userId, deviceId, itemId,
                                          startPositionTicks = 0, maxBitrate = 0,
                                          audioStreamIndex = null, subtitleStreamIndex = null,
                                          videoEl = null }) {
    if (!serverUrl || !itemId) return null;

    const caps = probeCapabilities(videoEl);
    const body = {
        UserId: userId || undefined,
        DeviceProfile: buildDeviceProfile(caps, maxBitrate),
        StartTimeTicks: startPositionTicks,
        AutoOpenLiveStream: true,
        // On autorise les trois modes : c'est le serveur qui tranche selon le profil.
        EnableDirectPlay: true,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        MaxStreamingBitrate: maxBitrate || undefined,
    };
    if (Number.isInteger(audioStreamIndex) && audioStreamIndex >= 0) body.AudioStreamIndex = audioStreamIndex;
    if (Number.isInteger(subtitleStreamIndex) && subtitleStreamIndex >= -1) body.SubtitleStreamIndex = subtitleStreamIndex;

    let data;
    try {
        const res = await fetch(`${serverUrl}/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Emby-Token': token,
                'X-Emby-Authorization': `MediaBrowser Client="SpaceHub", Device="SpaceHub Web", DeviceId="${deviceId || 'sh_web'}", Version="1.0.0", Token="${token}"`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
    } catch (err) {
        log.warn(`Négociation impossible (${err.message}) — repli sur le flux HLS générique.`);
        return null;
    }

    const source = data?.MediaSources?.[0];
    if (!source) {
        log.warn('Aucune MediaSource retournée par le serveur — repli.');
        return null;
    }

    const playSessionId = data.PlaySessionId || '';
    // Le MediaSourceId doit venir de la source retournée, PAS de l'id de l'item :
    // ils diffèrent dès qu'un média a plusieurs versions.
    const mediaSourceId = source.Id || itemId;
    const reasons = source.TranscodeReasons || [];

    // Cas 1 : le serveur fournit une URL de transcodage/remux prête à l'emploi.
    if (source.TranscodingUrl) {
        const url = source.TranscodingUrl.startsWith('http')
            ? source.TranscodingUrl
            : `${serverUrl}${source.TranscodingUrl}`;
        log.info(`Lecture négociée : ${source.TranscodingSubProtocol === 'hls' ? 'HLS' : 'flux'} (${reasons.join(', ') || 'raison non précisée'})`);
        return {
            url, playMethod: 'Transcode', mediaSourceId, playSessionId,
            isHls: (source.TranscodingSubProtocol || 'hls') === 'hls',
            source, transcodeReasons: reasons,
        };
    }

    // Cas 2 : lecture directe — le meilleur cas, coût serveur quasi nul.
    const params = new URLSearchParams({
        Static: 'true',
        MediaSourceId: mediaSourceId,
        DeviceId: deviceId || 'sh_web',
    });
    if (playSessionId) params.set('PlaySessionId', playSessionId);
    if (source.ETag) params.set('Tag', source.ETag);
    log.info('Lecture directe (DirectPlay) : aucun transcodage nécessaire.');
    return {
        url: `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?${params}`,
        playMethod: source.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream',
        mediaSourceId, playSessionId, isHls: false, source, transcodeReasons: reasons,
    };
}

export default { probeCapabilities, buildDeviceProfile, negotiatePlayback };
