/**
 * SpaceHub — Scheduled Tasks & Maintenance Controller (Admin Suite)
 * Version: 1.0.0
 *
 * Permet à l'administrateur de surveiller, lancer et interrompre
 * les tâches planifiées de Jellyfin (Scan médiathèque, Trickplay, Sous-titres, Cache).
 */

'use strict';

import Logger from '../../core/Logger.js';

class ServerTaskController {
    constructor() {
        this._log = new Logger('ServerTaskController');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère la liste de toutes les tâches planifiées Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getTasks() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/ScheduledTasks`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];

            const tasks = await res.json();
            return tasks.map(t => ({
                id: t.Id,
                name: t.Name,
                description: t.Description || 'Tâche système',
                category: t.Category || 'Maintenance',
                state: t.State, // 'Idle', 'Running', 'Cancelling'
                currentProgressPercentage: t.CurrentProgressPercentage || 0,
                lastExecutionResult: t.LastExecutionResult ? {
                    status: t.LastExecutionResult.Status,
                    startTime: t.LastExecutionResult.StartTimeUtc,
                    endTime: t.LastExecutionResult.EndTimeUtc,
                    errorMessage: t.LastExecutionResult.ErrorMessage
                } : null
            }));
        } catch (err) {
            this._log.warn('Erreur récupération tâches planifiées:', err.message);
            return [];
        }
    }

    /**
     * Démarre une tâche planifiée Jellyfin.
     * @param {string} taskId
     */
    async startTask(taskId) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/ScheduledTasks/Running/${taskId}`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders()
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur démarrage tâche ${taskId}:`, err);
            return false;
        }
    }

    /**
     * Interrompt une tâche en cours d'exécution.
     * @param {string} taskId
     */
    async stopTask(taskId) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/ScheduledTasks/Running/${taskId}`, {
                method: 'DELETE',
                headers: this._auth?.getAuthHeaders()
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur arrêt tâche ${taskId}:`, err);
            return false;
        }
    }
}

export default ServerTaskController;
