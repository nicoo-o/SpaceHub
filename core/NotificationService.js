/**
 * SpaceHub — NotificationService
 * Service unifié de notifications : Toasts In-App, Notifications Navigateur (Web Push),
 * et Webhooks externes (Discord, Telegram).
 */

'use strict';

import Logger from './Logger.js';

export class NotificationService {
    constructor(eventBus = null, settings = null) {
        this._log = new Logger('NotificationService');
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus;
        this._settings = settings || window.SpaceHub?.core?.settings;
        this._initListeners();
    }

    /**
     * Enregistre les écouteurs sur l'EventBus global.
     */
    _initListeners() {
        if (!this._eventBus) return;

        // Événement générique SpaceHub
        this._eventBus.on('spacehub:notify', (payload) => {
            this.send(payload.title, payload.message, payload.options);
        });

        // Torrent terminé
        this._eventBus.on('qbittorrent:downloadComplete', (data) => {
            this.send(
                '📥 Téléchargement Terminé',
                `Le contenu "${data?.name || 'Torrent'}" est prêt dans votre médiathèque.`,
                { type: 'success', category: 'download' }
            );
        });

        // Demande Jellyseerr
        this._eventBus.on('jellyseerr:requestApproved', (data) => {
            this.send(
                '🍿 Demande Approuvée',
                `Votre demande pour "${data?.title || 'Média'}" a été validée.`,
                { type: 'info', category: 'request' }
            );
        });

        // Épisode Sonarr récupéré
        this._eventBus.on('sonarr:episodeGrabbed', (data) => {
            this.send(
                '📺 Nouvel Épisode en Téléchargement',
                `${data?.seriesTitle || 'Série'} — S${data?.seasonNumber}E${data?.episodeNumber}`,
                { type: 'info', category: 'sonarr' }
            );
        });

        // Film Radarr récupéré
        this._eventBus.on('radarr:movieGrabbed', (data) => {
            this.send(
                '🎬 Film en Téléchargement',
                `${data?.title || 'Film'} (${data?.year || ''})`,
                { type: 'info', category: 'radarr' }
            );
        });
    }

    /**
     * Demande la permission pour les notifications système du navigateur.
     * @returns {Promise<boolean>}
     */
    async requestBrowserPermission() {
        if (typeof window === 'undefined' || !('Notification' in window)) return false;
        try {
            const result = await Notification.requestPermission();
            return result === 'granted';
        } catch (e) {
            return false;
        }
    }

    /**
     * Émet une notification vers tous les canaux activés.
     * @param {string} title
     * @param {string} message
     * @param {Object} [options]
     */
    async send(title, message, options = {}) {
        const settings = this._settings || window.SpaceHub?.core?.settings;
        const isGlobalEnabled = settings?.get('notifications.enabled', true);
        if (!isGlobalEnabled) return;

        // 1. Toast In-App VisionOS
        const toaster = window.SpaceHub?.ui?.components?.toaster;
        if (toaster) {
            const toastType = options.type || 'info';
            if (toaster[toastType]) {
                toaster[toastType](`${title} : ${message}`);
            } else {
                toaster.info(`${title} : ${message}`);
            }
        }

        // 2. Notification Navigateur (Web Push)
        const isBrowserEnabled = settings?.get('notifications.browser', false);
        if (isBrowserEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: message,
                    icon: options.icon || '/logo.png'
                });
            } catch (e) {
                // Silencieux
            }
        }

        // 3. Webhook Discord
        const isDiscordEnabled = settings?.get('notifications.discord.enabled', false);
        const discordWebhookUrl = settings?.get('notifications.discord.webhookUrl', '');
        if (isDiscordEnabled && discordWebhookUrl) {
            this._sendDiscordWebhook(discordWebhookUrl, title, message, options);
        }

        // 4. Webhook Telegram
        const isTelegramEnabled = settings?.get('notifications.telegram.enabled', false);
        const telegramToken = settings?.get('notifications.telegram.botToken', '');
        const telegramChatId = settings?.get('notifications.telegram.chatId', '');
        if (isTelegramEnabled && telegramToken && telegramChatId) {
            this._sendTelegramMessage(telegramToken, telegramChatId, title, message);
        }
    }

    /**
     * Envoie un webhook formaté sous forme d'embed riche sur Discord.
     */
    async _sendDiscordWebhook(webhookUrl, title, message, options = {}) {
        try {
            const embed = {
                title: title,
                description: message,
                color: options.type === 'success' ? 0x30d158 : (options.type === 'error' ? 0xff453a : 0x64d2ff),
                footer: { text: 'SpaceHub Media Center' },
                timestamp: new Date().toISOString()
            };
            if (options.posterUrl) {
                embed.thumbnail = { url: options.posterUrl };
            }

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'SpaceHub Bot',
                    embeds: [embed]
                })
            });
            this._log.debug('Webhook Discord envoyé avec succès.');
        } catch (err) {
            this._log.warn('Erreur envoi webhook Discord:', err);
        }
    }

    /**
     * Envoie un message via l'API Telegram Bot.
     */
    async _sendTelegramMessage(botToken, chatId, title, message) {
        try {
            const text = `🚀 *${title}*\n${message}`;
            const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });
            this._log.debug('Message Telegram envoyé avec succès.');
        } catch (err) {
            this._log.warn('Erreur envoi message Telegram:', err);
        }
    }
}

export default NotificationService;
