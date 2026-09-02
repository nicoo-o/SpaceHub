/**
 * SpaceHub — Harnais de test de navigation (exécution réelle)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * `npm run lint` vérifie que les fichiers parsent, `test:smoke` qu'ils
 * s'instancient. Aucun des deux ne peut détecter qu'un sélecteur ne correspond
 * à rien, qu'un scope est un piège à focus, ou qu'un élément focalisé sort de
 * l'écran — c'est-à-dire exactement la totalité des bugs de navigation trouvés
 * lors de l'audit. Ce harnais teste le comportement, sur l'application vivante.
 *
 * Usage (console du navigateur, application lancée et connectée) :
 *     await SpaceHub.dev.navTest.runAll()
 *
 * Ou un scope précis :
 *     await SpaceHub.dev.navTest.run('dashboard')
 *
 * Il ne modifie rien de durable : le focus initial est restauré à la fin.
 */

'use strict';

import { LAYERS, FOCUSABLES } from '../DomContracts.js';

import * as svc from '../services.js';
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function press(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function focused() {
    return document.querySelector('.sh-focus-active');
}

function describe(el) {
    if (!el) return 'aucun';
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.className || '').toString().split(' ').filter(c => c && !c.startsWith('sh-focus') && !c.startsWith('sh-tv')).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}`;
}

function isVisibleInViewport(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/** Un anneau de focus est-il réellement perceptible sur cet élément ? */
function hasVisibleFocusRing(el) {
    const s = getComputedStyle(el);
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) return true;
    if (s.boxShadow && s.boxShadow !== 'none') return true;
    // Les affiches ont leur propre effet : anneau sur la vignette interne.
    const wrap = el.querySelector?.('.sh-card__image-wrap');
    if (wrap) {
        const ws = getComputedStyle(wrap);
        if (ws.outlineStyle !== 'none' && parseFloat(ws.outlineWidth) > 0) return true;
    }
    return false;
}

class NavTestHarness {
    constructor(nav = null) {
        this._nav = nav || svc.nav();
    }

    /** Teste le scope courant : le focus se déplace-t-il, reste-t-il visible, sort-on ? */
    async run(label = null, { steps = 12, settle = 130 } = {}) {
        const nav = this._nav;
        if (!nav) return { label, ok: false, erreurs: ['SpatialNavigation introuvable'] };

        const scope = label || nav._detectCurrentScope?.() || 'inconnu';
        const start = focused();
        const erreurs = [];
        const infos = [];

        const focusables = nav.getFocusables?.(scope) || [];
        infos.push(`${focusables.length} élément(s) focalisable(s)`);
        if (focusables.length === 0) {
            erreurs.push(`Scope « ${scope} » : aucun élément focalisable — le provider renvoie une liste vide.`);
            return { label: scope, ok: false, erreurs, infos };
        }

        // Éléments annoncés mais invisibles ou de taille nulle : ils cassent la géométrie.
        const fantomes = focusables.filter(el => {
            const r = el.getBoundingClientRect();
            return r.width === 0 || r.height === 0;
        });
        if (fantomes.length) {
            erreurs.push(`${fantomes.length} élément(s) focalisable(s) de taille nulle (ex. ${describe(fantomes[0])}) — ils faussent le calcul du plus proche voisin.`);
        }

        // Conteneur déclaré focalisable : capte le focus dans toutes les directions.
        const geants = focusables.filter(el => {
            const r = el.getBoundingClientRect();
            return r.height > window.innerHeight * 0.9 && r.width > window.innerWidth * 0.9;
        });
        if (geants.length) {
            erreurs.push(`${geants.length} élément(s) de la taille de la page déclarés focalisables (ex. ${describe(geants[0])}) — piège à focus garanti.`);
        }

        if (!focused()) nav.focusFirst?.();
        await sleep(settle);

        const visites = new Set();
        let bloqueDepuis = 0;
        let sansAnneau = 0;
        let horsEcran = 0;

        for (let i = 0; i < steps; i++) {
            const avant = focused();
            const dir = [KEY.right, KEY.down, KEY.left, KEY.up][i % 4];
            press(dir);
            await sleep(settle);
            const apres = focused();

            if (!apres) { erreurs.push(`Focus perdu après « ${dir} » (étape ${i + 1}).`); break; }
            visites.add(apres);

            if (apres === avant) {
                bloqueDepuis++;
                // Bloqué sur les 4 directions consécutives = piège.
                if (bloqueDepuis >= 4) {
                    erreurs.push(`Piège à focus sur ${describe(apres)} : aucune des 4 directions ne permet d'en sortir.`);
                    break;
                }
            } else {
                bloqueDepuis = 0;
            }

            if (!isVisibleInViewport(apres)) horsEcran++;
            if (!hasVisibleFocusRing(apres)) sansAnneau++;
        }

        if (horsEcran) erreurs.push(`${horsEcran} déplacement(s) ont laissé l'élément focalisé hors de l'écran.`);
        if (sansAnneau) erreurs.push(`${sansAnneau} élément(s) focalisés sans indicateur visuel perceptible.`);
        infos.push(`${visites.size} élément(s) distinct(s) atteint(s) en ${steps} pas`);

        if (start && document.contains(start)) nav.setFocus?.(start, { reason: 'test-restore' });

        return { label: scope, ok: erreurs.length === 0, erreurs, infos };
    }

    /** Vérifie que chaque couche déclarée dans les contrats est cohérente. */
    checkContracts() {
        const erreurs = [];
        for (const [nom, sel] of Object.entries(LAYERS)) {
            try { document.querySelector(sel); }
            catch { erreurs.push(`LAYERS.${nom} : sélecteur CSS invalide « ${sel} »`); }
        }
        for (const [nom, sel] of Object.entries(FOCUSABLES)) {
            try { document.querySelectorAll(sel); }
            catch { erreurs.push(`FOCUSABLES.${nom} : sélecteur CSS invalide « ${sel} »`); }
        }
        return erreurs;
    }

    /** Parcourt les scopes accessibles sans ouvrir de couche, puis rapporte. */
    async runAll(options = {}) {
        const resultats = [];
        const erreursContrat = this.checkContracts();
        if (erreursContrat.length) {
            resultats.push({ label: 'contrats', ok: false, erreurs: erreursContrat, infos: [] });
        }

        resultats.push(await this.run(null, options));

        // Couches ouvrables sans risque, testées puis refermées.
        const couches = [
            { nom: 'sidebar', ouvrir: () => (svc.sidebar() || svc.appLayout()?._sidebarDrawer)?.open?.(),
              fermer: () => (svc.sidebar() || svc.appLayout()?._sidebarDrawer)?.close?.() },
            { nom: 'search',  ouvrir: () => svc.search()?.open?.(),
              fermer: () => svc.search()?.close?.() },
            { nom: 'settings', ouvrir: () => svc.settingsPanel()?.open?.(),
              fermer: () => svc.settingsPanel()?.close?.() },
        ];

        for (const c of couches) {
            try {
                c.ouvrir();
                await sleep(650);
                resultats.push(await this.run(c.nom, options));
            } catch (err) {
                resultats.push({ label: c.nom, ok: false, erreurs: [`Ouverture impossible : ${err.message}`], infos: [] });
            } finally {
                try { c.fermer(); } catch { /* ignoré */ }
                await sleep(450);
            }
        }

        this.report(resultats);
        return resultats;
    }

    report(resultats) {
        const ko = resultats.filter(r => !r.ok);
        console.log(`\n%c SpaceHub — test de navigation `, 'background:#111;color:#fff;padding:2px 6px;border-radius:4px');
        for (const r of resultats) {
            console.log(`${r.ok ? '✅' : '❌'} ${r.label} — ${r.infos.join(', ')}`);
            for (const e of r.erreurs) console.log(`      ${e}`);
        }
        console.log(ko.length === 0
            ? '\nTous les scopes testés sont navigables.'
            : `\n${ko.length} scope(s) en échec : ${ko.map(r => r.label).join(', ')}`);
    }
}

export default NavTestHarness;
