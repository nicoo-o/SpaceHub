/**
 * SpaceHub — Parental Control
 * Version: 1.0.0
 *
 * Contrôle parental et gestion des profils enfants.
 * Filtrage de contenu par classification d'âge, limites de temps d'écran,
 * et rapports hebdomadaires.
 */

'use strict';

import Logger from '../Logger.js';

class ParentalControl {
    constructor(eventBus, settings, permissions) {
        this._log = new Logger('ParentalControl');
        this._eventBus = eventBus;
        this._settings = settings;
        this._permissions = permissions;

        this._registerDefaults();
        this._initListeners();
        this._log.info('Parental Control initialisé.');
    }

    _registerDefaults() {
        this._settings.registerDefaults({
            'parental.enabled': false,
            'parental.defaultMaxAgeRating': 18,
            'parental.blockUnrated': false,
            'parental.dailyTimeLimit': 0, // 0 = illimité
            'parental.weeklyTimeLimit': 0,
            'parental.reportEnabled': true,
            'parental.reportDay': 'sunday',
            'parental.reportTime': '20:00'
        });
    }

    _initListeners() {
        this._eventBus.on('player:played', (item) => this._onPlaybackStart(item));
        this._eventBus.on('player:stopped', (item) => this._onPlaybackStop(item));
        this._eventBus.on('auth:login', (user) => this._onUserLogin(user));
    }

    /**
     * Appelé lors de la connexion d'un utilisateur.
     * @private
     */
    _onUserLogin(user) {
        const parentalSettings = this._getUserParentalSettings(user.Id);
        
        if (parentalSettings && parentalSettings.enabled) {
            this._log.info(`Contrôle parental activé pour ${user.Name}`);
            this._checkTimeLimits(user.Id);
        }
    }

    /**
     * Appelé au démarrage de la lecture.
     * @private
     */
    _onPlaybackStart(item) {
        const user = window.SpaceHub?.auth?.getUser();
        if (!user) return;

        const parentalSettings = this._getUserParentalSettings(user.Id);
        if (!parentalSettings || !parentalSettings.enabled) return;

        // Vérifier la classification
        if (!this._isContentAllowed(item, parentalSettings)) {
            this._log.warn(`Contenu bloqué pour ${user.Name}: ${item.Name}`);
            window.SpaceHub?.ui?.components?.toaster?.error('Ce contenu n\'est pas autorisé par le contrôle parental');
            window.SpaceHub?.player?.close();
            return;
        }

        // Enregistrer le début de lecture pour le suivi du temps
        this._startTrackingTime(user.Id);
    }

    /**
     * Appelé à l'arrêt de la lecture.
     * @private
     */
    _onPlaybackStop(item) {
        const user = window.SpaceHub?.auth?.getUser();
        if (!user) return;

        this._stopTrackingTime(user.Id);
    }

    /**
     * Récupère les réglages parentaux d'un utilisateur.
     * @private
     */
    _getUserParentalSettings(userId) {
        const userSettings = this._settings.get(`parental.users.${userId}`);
        
        if (userSettings) {
            return userSettings;
        }

        // Utiliser les réglages globaux si pas de config spécifique
        if (this._settings.get('parental.enabled')) {
            return {
                enabled: true,
                maxAgeRating: this._settings.get('parental.defaultMaxAgeRating', 18),
                blockUnrated: this._settings.get('parental.blockUnrated', false),
                dailyTimeLimit: this._settings.get('parental.dailyTimeLimit', 0),
                weeklyTimeLimit: this._settings.get('parental.weeklyTimeLimit', 0)
            };
        }

        return null;
    }

    /**
     * Vérifie si un contenu est autorisé.
     * @private
     */
    _isContentAllowed(item, parentalSettings) {
        // Récupérer la classification d'âge
        const ageRating = this._parseAgeRating(item.OfficialRating || item.CommunityRating);
        
        if (ageRating === null && parentalSettings.blockUnrated) {
            return false;
        }

        if (ageRating !== null && ageRating > parentalSettings.maxAgeRating) {
            return false;
        }

        // Vérifier les genres bloqués
        const blockedGenres = parentalSettings.blockedGenres || [];
        if (item.Genres && item.Genres.some(g => blockedGenres.includes(g))) {
            return false;
        }

        return true;
    }

    /**
     * Parse la classification d'âge.
     * @private
     */
    _parseAgeRating(rating) {
        if (!rating) return null;

        // Classifications courantes
        const ratingMap = {
            'TV-Y': 0,
            'TV-Y7': 7,
            'TV-G': 0,
            'TV-PG': 10,
            'TV-14': 14,
            'TV-MA': 17,
            'G': 0,
            'PG': 10,
            'PG-13': 13,
            'R': 17,
            'NC-17': 17,
            'NR': null,
            'UR': null
        };

        // Essayer le mapping direct
        if (ratingMap[rating] !== undefined) {
            return ratingMap[rating];
        }

        // Essayer de parser comme nombre
        const numRating = parseInt(rating);
        if (!isNaN(numRating)) {
            return numRating;
        }

        // Classification par pays (ex: FR-12, DE-12)
        const match = rating.match(/(\d+)/);
        if (match) {
            return parseInt(match[1]);
        }

        return null;
    }

    /**
     * Commence le suivi du temps de visionnage.
     * @private
     */
    _startTrackingTime(userId) {
        if (!this._trackingSessions) {
            this._trackingSessions = new Map();
        }

        this._trackingSessions.set(userId, {
            startTime: Date.now(),
            accumulatedTime: 0
        });
    }

    /**
     * Arrête le suivi du temps de visionnage.
     * @private
     */
    _stopTrackingTime(userId) {
        const session = this._trackingSessions?.get(userId);
        if (!session) return;

        const duration = Date.now() - session.startTime;
        this._trackingSessions.delete(userId);

        // Enregistrer dans les stats
        this._recordViewingTime(userId, duration);
    }

    /**
     * Enregistre le temps de visionnage.
     * @private
     */
    _recordViewingTime(userId, durationMs) {
        const today = new Date().toISOString().split('T')[0];
        const weekStart = this._getWeekStart();

        // Stats journalières
        const dailyKey = `parental.stats.${userId}.daily.${today}`;
        const dailyTime = this._settings.get(dailyKey, 0);
        this._settings.set(dailyKey, dailyTime + durationMs);

        // Stats hebdomadaires
        const weeklyKey = `parental.stats.${userId}.weekly.${weekStart}`;
        const weeklyTime = this._settings.get(weeklyKey, 0);
        this._settings.set(weeklyKey, weeklyTime + durationMs);
    }

    /**
     * Vérifie les limites de temps.
     * @private
     */
    _checkTimeLimits(userId) {
        const parentalSettings = this._getUserParentalSettings(userId);
        if (!parentalSettings) return;

        const today = new Date().toISOString().split('T')[0];
        const weekStart = this._getWeekStart();

        // Limite journalière
        if (parentalSettings.dailyTimeLimit > 0) {
            const dailyKey = `parental.stats.${userId}.daily.${today}`;
            const dailyTime = this._settings.get(dailyKey, 0);
            const dailyLimitMs = parentalSettings.dailyTimeLimit * 60 * 1000; // minutes -> ms

            if (dailyTime >= dailyLimitMs) {
                this._log.warn(`Limite journalière atteinte pour ${userId}`);
                window.SpaceHub?.ui?.components?.toaster?.warn('Limite de temps journalière atteinte');
                return false;
            }
        }

        // Limite hebdomadaire
        if (parentalSettings.weeklyTimeLimit > 0) {
            const weeklyKey = `parental.stats.${userId}.weekly.${weekStart}`;
            const weeklyTime = this._settings.get(weeklyKey, 0);
            const weeklyLimitMs = parentalSettings.weeklyTimeLimit * 60 * 1000; // minutes -> ms

            if (weeklyTime >= weeklyLimitMs) {
                this._log.warn(`Limite hebdomadaire atteinte pour ${userId}`);
                window.SpaceHub?.ui?.components?.toaster?.warn('Limite de temps hebdomadaire atteinte');
                return false;
            }
        }

        return true;
    }

    /**
     * Retourne le début de la semaine (dimanche).
     * @private
     */
    _getWeekStart() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day;
        const weekStart = new Date(now.setDate(diff));
        return weekStart.toISOString().split('T')[0];
    }

    /**
     * Définit les réglages parentaux pour un utilisateur.
     * @param {string} userId
     * @param {Object} settings
     */
    setUserParentalSettings(userId, settings) {
        this._settings.set(`parental.users.${userId}`, settings);
        this._log.info(`Réglages parentaux mis à jour pour ${userId}`);
    }

    /**
     * Récupère les stats de temps pour un utilisateur.
     * @param {string} userId
     * @returns {Object}
     */
    getUserTimeStats(userId) {
        const today = new Date().toISOString().split('T')[0];
        const weekStart = this._getWeekStart();

        const dailyKey = `parental.stats.${userId}.daily.${today}`;
        const weeklyKey = `parental.stats.${userId}.weekly.${weekStart}`;

        return {
            todayMinutes: Math.round((this._settings.get(dailyKey, 0) / 1000) / 60),
            weekMinutes: Math.round((this._settings.get(weeklyKey, 0) / 1000) / 60),
            todayDate: today,
            weekStart: weekStart
        };
    }

    /**
     * Génère un rapport hebdomadaire pour un utilisateur.
     * @param {string} userId
     * @returns {Object}
     */
    generateWeeklyReport(userId) {
        const stats = this.getUserTimeStats(userId);
        const parentalSettings = this._getUserParentalSettings(userId);

        return {
            userId,
            weekStart: stats.weekStart,
            totalMinutes: stats.weekMinutes,
            dailyAverage: Math.round(stats.weekMinutes / 7),
            limits: {
                daily: parentalSettings?.dailyTimeLimit || 0,
                weekly: parentalSettings?.weeklyTimeLimit || 0
            },
            percentage: parentalSettings?.weeklyTimeLimit > 0 
                ? Math.round((stats.weekMinutes / parentalSettings.weeklyTimeLimit) * 100)
                : null
        };
    }

    /**
     * Crée un profil enfant avec réglages par défaut.
     * @param {string} userId
     * @param {number} maxAge
     */
    createChildProfile(userId, maxAge = 12) {
        const settings = {
            enabled: true,
            maxAgeRating: maxAge,
            blockUnrated: true,
            dailyTimeLimit: 120, // 2 heures par défaut
            weeklyTimeLimit: 840, // 14 heures par défaut
            blockedGenres: ['Horror', 'Thriller']
        };

        this.setUserParentalSettings(userId, settings);
        
        // Appliquer les permissions correspondantes
        this._permissions.setUserSections(userId, ['home', 'libraries']);
        this._permissions.setUserWidgets(userId, ['continueWatching', 'latestAdditions']);

        this._log.info(`Profil enfant créé pour ${userId} (max ${maxAge}+)`);
    }

    /**
     * Réinitialise les stats de temps pour une nouvelle semaine.
     * @param {string} userId
     */
    resetWeeklyStats(userId) {
        const weekStart = this._getWeekStart();
        const weeklyKey = `parental.stats.${userId}.weekly.${weekStart}`;
        this._settings.set(weeklyKey, 0);
    }

    /**
     * Vérifie si le contrôle parental est actif pour l'utilisateur actuel.
     * @returns {boolean}
     */
    isParentalControlActive() {
        const user = window.SpaceHub?.auth?.getUser();
        if (!user) return false;

        const settings = this._getUserParentalSettings(user.Id);
        return settings?.enabled || false;
    }
}

export default ParentalControl;
