/**
 * SpaceHub — Web Worker Dedicated Thread Pool
 * Version: 1.0.0
 *
 * Décharge le thread principal de l'UI pour exécuter les calculs lourds :
 * - Indexation et filtrage flou / recherche sémantique en mémoire
 * - Parsing des fichiers de sous-titres et paroles LRC avec interpolation
 * - Calculs FFT audio et groupement géographique des photos
 */

'use strict';

import Logger from '../Logger.js';

class WorkerThreadPool {
    constructor(poolSize = 2) {
        this._log = new Logger('WorkerThreadPool');
        this._poolSize = Math.min(navigator.hardwareConcurrency || 2, poolSize);
        this._workers = [];
        this._taskQueue = [];
        this._activeTasks = new Map();
        this._taskIdCounter = 0;

        this._initWorkerPool();
    }

    _initWorkerPool() {
        const workerCode = `
            self.onmessage = function(e) {
                const { taskId, type, payload } = e.data;
                try {
                    let result;
                    if (type === 'parse_lrc') {
                        result = parseLrc(payload);
                    } else if (type === 'filter_search') {
                        result = fuzzySearch(payload.items, payload.query);
                    } else if (type === 'cluster_geo') {
                        result = clusterPhotos(payload);
                    } else {
                        result = payload;
                    }
                    self.postMessage({ taskId, success: true, result });
                } catch(err) {
                    self.postMessage({ taskId, success: false, error: err.message });
                }
            };

            function parseLrc(text) {
                if (!text) return [];
                const lines = text.split('\\n');
                const result = [];
                const regex = /\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})\\]/g;
                for (const line of lines) {
                    let match;
                    regex.lastIndex = 0;
                    while ((match = regex.exec(line)) !== null) {
                        const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3].padEnd(3, '0').slice(0,3)) / 1000;
                        const lText = line.replace(/\\[\\d{2}:\\d{2}\\.\\d{2,3}\\]/g, '').trim();
                        if (lText) result.push({ time, text: lText });
                    }
                }
                return result.sort((a,b) => a.time - b.time);
            }

            function fuzzySearch(items, query) {
                if (!query || !items) return items || [];
                const q = query.toLowerCase();
                return items.filter(item => {
                    const name = (item.Name || item.title || '').toLowerCase();
                    const overview = (item.Overview || '').toLowerCase();
                    return name.includes(q) || overview.includes(q);
                });
            }

            function clusterPhotos(photos) {
                return (photos || []).filter(p => p.latitude && p.longitude);
            }
        `;

        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);

            for (let i = 0; i < this._poolSize; i++) {
                const worker = new Worker(workerUrl);
                worker.busy = false;

                worker.onmessage = (e) => {
                    const { taskId, success, result, error } = e.data;
                    const task = this._activeTasks.get(taskId);
                    if (task) {
                        this._activeTasks.delete(taskId);
                        worker.busy = false;
                        if (success) task.resolve(result);
                        else task.reject(new Error(error));
                        this._processNext();
                    }
                };

                this._workers.push(worker);
            }
            this._log.info(`Pool de ${this._poolSize} Web Workers initialisé avec succès.`);
        } catch (err) {
            this._log.warn('Web Workers non supportés, mode synchrone activé:', err.message);
        }
    }

    /**
     * Exécute une tâche sur un Web Worker disponible.
     * @param {string} type - 'parse_lrc' | 'filter_search' | 'cluster_geo'
     * @param {*} payload
     * @returns {Promise<*>}
     */
    runTask(type, payload) {
        return new Promise((resolve, reject) => {
            const taskId = ++this._taskIdCounter;
            this._taskQueue.push({ taskId, type, payload, resolve, reject });
            this._processNext();
        });
    }

    _processNext() {
        if (this._taskQueue.length === 0) return;

        const availableWorker = this._workers.find(w => !w.busy);
        if (!availableWorker) return;

        const task = this._taskQueue.shift();
        availableWorker.busy = true;
        this._activeTasks.set(task.taskId, task);

        availableWorker.postMessage({
            taskId: task.taskId,
            type: task.type,
            payload: task.payload
        });
    }
}

export default WorkerThreadPool;
