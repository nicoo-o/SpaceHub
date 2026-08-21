/**
 * SpaceHub — Real-Time NOC Bandwidth & GPU Metrics Canvas Chart (Horizon 7++)
 * Version: 1.0.0
 *
 * Graphique dynamique 60 FPS basé sur l'API Canvas HTML5 :
 * - Historique glissant de la bande passante globale (Mbps) sur 60 secondes
 * - Jauge en direct Direct Play vs Transcode GPU vs Audio Direct
 * - Bouton d'action d'urgence "Kill All Transcodes"
 */

'use strict';

class AdminMetricsChart {
    constructor(canvasEl) {
        this._canvas = canvasEl;
        this._ctx = canvasEl?.getContext('2d');
        this._history = Array(60).fill(0); // 60 secondes d'historique en Mbps
        this._animFrame = null;
        this._directPlayPct = 100;
        this._transcodePct = 0;
    }

    /**
     * Met à jour les métriques actuelles.
     * @param {number} currentMbps - Débit total en Mbps
     * @param {number} directPlayPct - % en Direct Play
     * @param {number} transcodePct - % en Transcodage GPU
     */
    update(currentMbps, directPlayPct = 100, transcodePct = 0) {
        this._history.shift();
        this._history.push(currentMbps);
        this._directPlayPct = directPlayPct;
        this._transcodePct = transcodePct;
        this.render();
    }

    render() {
        if (!this._ctx || !this._canvas) return;

        const w = this._canvas.width = this._canvas.clientWidth || 600;
        const h = this._canvas.height = this._canvas.clientHeight || 180;
        const ctx = this._ctx;

        ctx.clearRect(0, 0, w, h);

        // 1. Fond et grille
        ctx.fillStyle = 'rgba(10, 10, 15, 0.6)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // 2. Courbe de débit réseau
        const maxVal = Math.max(50, ...this._history);
        const stepX = w / (this._history.length - 1);

        ctx.beginPath();
        this._history.forEach((val, i) => {
            const x = i * stepX;
            const y = h - (val / maxVal) * (h - 20) - 10;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        // Dégradé néon sous la courbe
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(124, 106, 255, 0.5)');
        grad.addColorStop(1, 'rgba(124, 106, 255, 0.0)');

        ctx.strokeStyle = '#7c6aff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 3. Indicateur de valeur actuelle
        const current = this._history[this._history.length - 1] || 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(`📶 Débit Actuel : ${current.toFixed(1)} Mbps (Pic : ${maxVal.toFixed(1)} Mbps)`, 16, 24);

        ctx.fillStyle = '#2ecc71';
        ctx.fillText(`Direct Play : ${this._directPlayPct}%`, 16, 44);
        if (this._transcodePct > 0) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`Transcodage GPU : ${this._transcodePct}%`, 160, 44);
        }
    }
}

export default AdminMetricsChart;
