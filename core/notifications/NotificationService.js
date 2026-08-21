/**
 * SpaceHub — NotificationService
 * Version: 1.0.0
 *
 * Service centralisé pour l'envoi de notifications via différents canaux :
 * - Discord (Webhooks)
 * - Telegram (Bots)
 * - Navigateur (Web Notifications API)
 *
 * Écoute l'EventBus global pour réagir aux événements système (ex: film ajouté,
 * torrent terminé) et les relayer selon les réglages utilisateur.
 */

'use strict';

import Logger from '../Logger.js';

class NotificationService {
    constructor(eventBus, settings) {
        this._log = new Logger('NotificationService');
        this._eventBus = eventBus;
        this._settings = settings;

        this._registerDefaults();
        this._initListeners();
        this._log.info('Initialisé.');
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'notifications.discord.enabled': false,
            'notifications.discord.webhookUrl': '',
            'notifications.telegram.enabled': false,
            'notifications.telegram.botToken': '',
            'notifications.telegram.chatId': '',
            'notifications.browser.enabled': true,
            'notifications.events.mediaAdded': true,
            'notifications.events.downloadFinished': true
        });
    }

    _initListeners() {
        // Écoute les événements système pour déclencher les notifications
        this._eventBus.on('jellyfin:mediaAdded', (data) => this._onMediaAdded(data));
        this._eventBus.on('qbittorrent:downloadFinished', (data) => this._onDownloadFinished(data));

        // On peut ajouter d'autres événements Servarr ici
        this._eventBus.on('sonarr:seriesAdded', (data) => this._send(`📺 Série ajoutée : ${data.title}`));
        this._eventBus.on('radarr:movieAdded', (data) => this._send(`🍿 Film ajouté : ${data.title}`));
    }

    async _onMediaAdded(item) {
        if (!this._settings.get('notifications.events.mediaAdded')) return;
        const msg = `🎉 Nouveau contenu sur Jellyfin : ${item.Name}`;
        await this._send(msg);
    }

    async _onDownloadFinished(torrent) {
        if (!this._settings.get('notifications.events.downloadFinished')) return;
        const msg = `📥 Téléchargement terminé : ${torrent.name}`;
        await this._send(msg);
    }

    /**
     * Envoie une notification via tous les canaux activés.
     * @param {string} message
     */
    async _send(message) {
        this._log.debug(`Envoi notification : ${message}`);

        const promises = [];

        if (this._settings.get('notifications.browser.enabled')) {
            promises.push(this._sendBrowser(message));
        }

        if (this._settings.get('notifications.discord.enabled')) {
            promises.push(this._sendDiscord(message));
        }

        if (this._settings.get('notifications.telegram.enabled')) {
            promises.push(this._sendTelegram(message));
        }

        await Promise.allSettled(promises);
    }

    async _sendBrowser(message) {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'granted') {
            new Notification('SpaceHub', { body: message, icon: '/logo.png' });
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                new Notification('SpaceHub', { body: message, icon: '/logo.png' });
            }
        }
    }

    async _sendDiscord(message) {
        const url = this._settings.get('notifications.discord.webhookUrl');
        if (!url) return;

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message, username: 'SpaceHub' })
            });
        } catch (err) {
            this._log.error('Erreur notification Discord:', err);
        }
    }

    async _sendTelegram(message) {
        const token = this._settings.get('notifications.telegram.botToken');
        const chatId = this._settings.get('notifications.telegram.chatId');
        if (!token || !chatId) return;

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message })
            });
        } catch (err) {
            this._log.error('Erreur notification Telegram:', err);
        }
    }
}

export default NotificationService;
