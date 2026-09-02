/**
 * SpaceHub — Socle de compatibilité navigateur
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * La vision produit est « un client Jellyfin natif pour PC, TV et mobile ».
 * Or le bundle exigeait Chromium 92, c'est-à-dire les téléviseurs Samsung de
 * 2023 et plus récents UNIQUEMENT. Six millésimes — 2017 à 2022 — recevaient
 * un écran blanc. Le client Jellyfin officiel, lui, transpile jusqu'à
 * Chrome 27 et fonctionne sur ces appareils.
 *
 * Deux causes distinctes, deux remèdes distincts :
 *
 *   1. LA SYNTAXE (`?.`, `??`) faisait échouer l'ANALYSE du fichier. Aucun
 *      message, aucune trace : le navigateur n'exécute simplement rien. C'est
 *      corrigé par `build.target` dans vite.config.js, qui demande à esbuild de
 *      rétrograder la syntaxe.
 *
 *   2. LES API manquantes (`Array.at`, `replaceChildren`, le signal
 *      d'`addEventListener`, `Promise.allSettled`) échouent à l'exécution.
 *      esbuild ne les ajoute PAS — il ne traduit que la syntaxe. C'est l'objet
 *      de ce fichier.
 *
 * Choix assumé : un socle unique chargé en premier, plutôt que des contournements
 * dispersés sur une vingtaine d'appels. Une seule chose à lire, à tester et à
 * retirer le jour où le plancher remonte.
 *
 * Chaque correctif est conditionnel : sur un navigateur récent, ce fichier
 * n'exécute rien du tout.
 */

'use strict';

/* ── Array.prototype.at — Chromium 92 ──────────────────────────────────────
   Utilisé aussi par le code que Vite génère lui-même pour le préchargement
   des modules : sans ce correctif, le chargement échoue avant d'atteindre
   la moindre ligne de SpaceHub. */
if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
        value: function (n) {
            const i = Math.trunc(n) || 0;
            return this[i < 0 ? this.length + i : i];
        },
        writable: true, configurable: true,
    });
}
if (!String.prototype.at) {
    Object.defineProperty(String.prototype, 'at', {
        value: function (n) {
            const i = Math.trunc(n) || 0;
            return this[i < 0 ? this.length + i : i];
        },
        writable: true, configurable: true,
    });
}

/* ── Element.replaceChildren — Chromium 86 ─────────────────────────────── */
if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
    const remplacer = function (...noeuds) {
        while (this.firstChild) this.removeChild(this.firstChild);
        if (noeuds.length) this.append(...noeuds);
    };
    Element.prototype.replaceChildren = remplacer;
    if (typeof DocumentFragment !== 'undefined') DocumentFragment.prototype.replaceChildren = remplacer;
}

/* ── Promise.allSettled — Chromium 76 ──────────────────────────────────── */
if (typeof Promise !== 'undefined' && !Promise.allSettled) {
    Promise.allSettled = function (promesses) {
        return Promise.all(Array.from(promesses).map(p =>
            Promise.resolve(p).then(
                value => ({ status: 'fulfilled', value }),
                reason => ({ status: 'rejected', reason })
            )
        ));
    };
}

/* ── addEventListener({ signal }) — Chromium 90 ────────────────────────────
   Le plus sournois des quatre : sur un navigateur qui ne le connaît pas,
   l'option est ignorée SANS ERREUR. L'écouteur est bien posé, mais plus rien
   ne le retire — la fuite que l'AbortController était censé supprimer revient,
   silencieusement, exactement sur les appareils les plus fragiles. */
(function () {
    if (typeof EventTarget === 'undefined') return;
    let supporte = false;
    try {
        const ac = new AbortController();
        const cible = new EventTarget();
        cible.addEventListener('x', () => {}, { signal: ac.signal });
        ac.abort();
        // Si le signal est pris en compte, l'écouteur est déjà parti.
        let appele = false;
        cible.addEventListener('y', () => { appele = true; }, { signal: ac.signal });
        cible.dispatchEvent(new Event('y'));
        supporte = !appele;
    } catch { supporte = false; }
    if (supporte) return;

    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, ecouteur, options) {
        const signal = options && typeof options === 'object' ? options.signal : null;
        if (signal) {
            if (signal.aborted) return;              // déjà annulé : ne rien poser
            const cible = this;
            signal.addEventListener('abort', () => {
                cible.removeEventListener(type, ecouteur, options);
            }, { once: true });
        }
        return original.call(this, type, ecouteur, options);
    };
})();

export default true;
