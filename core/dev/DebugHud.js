/**
 * SpaceHub — HUD de diagnostic de navigation
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit externe du 7 septembre 2026 le résume mieux que je ne le ferais :
 * l'application accumule des systèmes complexes — navigation spatiale,
 * lecteur, virtualisation, routeur d'entrée, conteneurs déclarés — et il
 * n'existait aucun moyen de voir ce qu'ils décident.
 *
 * Tant qu'on développe sur un PC, ce n'est pas bloquant : la console suffit.
 * Sur un téléviseur, il n'y a pas de console. Quand le focus part au mauvais
 * endroit après un appui sur la télécommande, on dispose de trois
 * informations : ce qu'on a appuyé, ce qui était sélectionné avant, et ce qui
 * l'est après. Impossible de savoir POURQUOI — quel scope était actif, combien
 * de candidats ont été examinés, quelle voie a tranché, avec quel score.
 *
 * Ce HUD répond à cette question, et à elle seule.
 *
 * CE QU'IL NE FAIT PAS : recalculer. Il n'a aucune logique de navigation. Le
 * moteur consigne sa décision dans `_diagnostic` ; le HUD la lit et l'affiche.
 * Un HUD qui recalculerait montrerait SA version du raisonnement, et
 * divergerait précisément le jour où l'on aurait besoin de lui.
 *
 * COÛT QUAND IL EST ÉTEINT : nul. Le module n'est chargé que sur demande
 * explicite (`?debug=1`), et la consignation dans le moteur est gardée par un
 * `if (this._diagnostic)` qui vaut `null` par défaut.
 *
 * Activation :
 *   • ajouter `?debug=1` à l'URL ;
 *   • ou, depuis la console : `SpaceHub.dev.hud.basculer()`.
 */

'use strict';

import Logger from '../Logger.js';
import * as svc from '../services.js';

/** Rafraîchissements par seconde. 10 suffit à l'œil et laisse le CPU tranquille. */
const CADENCE_MS = 100;

export class DebugHud {
    constructor() {
        this._log = new Logger('DebugHud');
        this._el = null;
        this._minuteur = null;
        this._actif = false;
        /** Historique court des dernières décisions, pour voir un enchaînement. */
        this._journal = [];
        this._onFocusChange = this._onFocusChange.bind(this);
        this._desabonner = null;
    }

    /** Allume ou éteint le HUD. */
    basculer() {
        return this._actif ? this.eteindre() : this.allumer();
    }

    allumer() {
        if (this._actif) return true;
        const nav = svc.nav();
        if (!nav?.activerDiagnostic) {
            this._log.warn('Moteur de navigation indisponible : HUD non activé.');
            return false;
        }
        nav.activerDiagnostic(true);
        this._construire();
        this._desabonner = svc.eventBus()?.on?.('navigation:focusChanged', this._onFocusChange) || null;
        this._minuteur = setInterval(() => this._rafraichir(), CADENCE_MS);
        this._actif = true;
        this._log.info('HUD de diagnostic actif. `SpaceHub.dev.hud.eteindre()` pour l\'arrêter.');
        return true;
    }

    eteindre() {
        if (!this._actif) return false;
        svc.nav()?.activerDiagnostic?.(false);
        if (this._minuteur) { clearInterval(this._minuteur); this._minuteur = null; }
        if (typeof this._desabonner === 'function') this._desabonner();
        this._desabonner = null;
        this._el?.remove();
        this._el = null;
        this._actif = false;
        return true;
    }

    // ─── Interne ────────────────────────────────────────────────────────────

    _construire() {
        const el = document.createElement('div');
        el.id = 'sh-debug-hud';
        // `inert` : le HUD ne doit JAMAIS devenir une cible de navigation.
        // Un outil de diagnostic qui capte le focus fausse ce qu'il mesure.
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
            'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
            'min-width:280px', 'max-width:380px', 'padding:11px 13px',
            'border-radius:10px', 'border:1px solid rgba(255,255,255,0.16)',
            'background:rgba(10,10,14,0.92)', 'color:#e8e8ee',
            'font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
            'white-space:pre-wrap', 'pointer-events:none',
            'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
        ].join(';');
        document.body.appendChild(el);
        this._el = el;
    }

    _onFocusChange({ current, reason } = {}) {
        const diag = svc.nav()?.dernierDiagnostic?.();
        this._journal.unshift({
            cible: this._nommer(current),
            voie: diag?.voie || reason || '—',
            score: diag?.score,
        });
        if (this._journal.length > 4) this._journal.length = 4;
    }

    /**
     * Nom court et lisible d'un élément : ce qu'on veut voir à trois mètres,
     * pas un sélecteur CSS complet.
     * @param {Element|null} el
     * @returns {string}
     */
    _nommer(el) {
        if (!el) return '—';
        if (el.id && !el.id.startsWith('sh-nav-')) return `#${el.id}`;
        const classe = [...el.classList].find(c => c.startsWith('sh-') && !c.includes('focus'));
        const texte = (el.textContent || '').trim().slice(0, 18);
        return classe ? `.${classe}${texte ? ` « ${texte} »` : ''}` : (texte || el.tagName.toLowerCase());
    }

    _rafraichir() {
        if (!this._el) return;
        const nav = svc.nav();
        const diag = nav?.dernierDiagnostic?.();
        const focalise = nav?.getFocusedElement?.();
        const racine = document.documentElement;

        const modalite = racine.classList.contains('sh-entree-pointeur') ? 'souris'
            : racine.classList.contains('sh-entree-directionnelle') ? 'directionnel' : '—';
        const conteneur = focalise?.closest?.('[data-nav-container]');

        const lignes = [
            '── SpaceHub · diagnostic navigation ──',
            `focus     ${this._nommer(focalise)}`,
            `scope     ${diag?.scope || nav?._state?.scope || '—'}`,
            `conteneur ${conteneur ? `${conteneur.dataset.navContainer} · ${this._nommer(conteneur)}` : '—'}`,
            `entrée    ${modalite}`,
            '',
            `direction ${diag?.direction || '—'}`,
            `voie      ${diag?.voie || '—'}`,
            `candidats ${diag?.candidats ?? '—'}`,
            `score     ${diag?.score ?? '—'}`,
            `latence   ${diag?.latence != null ? `${diag.latence.toFixed(2)} ms` : '—'}`,
        ];

        if (this._journal.length) {
            lignes.push('', '── derniers déplacements ──');
            for (const e of this._journal) {
                lignes.push(`  ${e.cible}  [${e.voie}${e.score != null ? ` ${e.score}` : ''}]`);
            }
        }

        // textContent, jamais innerHTML : ces valeurs contiennent des libellés
        // venus du serveur (titres de médias).
        this._el.textContent = lignes.join('\n');
    }
}

/**
 * Installe le HUD si l'URL le demande, et l'expose toujours pour la console.
 *
 * @param {Object} spaceHub  Le namespace global, pour y poser `dev.hud`.
 * @returns {DebugHud}
 */
export function installerHud(spaceHub) {
    const hud = new DebugHud();
    spaceHub.dev = spaceHub.dev || {};
    spaceHub.dev.hud = hud;
    try {
        if (new URLSearchParams(location.search).get('debug') === '1') hud.allumer();
    } catch { /* URL exotique : le HUD reste disponible à la main */ }
    return hud;
}

export default DebugHud;
