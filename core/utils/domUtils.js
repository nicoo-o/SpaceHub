/**
 * SpaceHub — DOM Utilities
 *
 * Fonctions utilitaires partagées pour la manipulation du DOM.
 * Centralise les helpers utilisés dans plusieurs modules.
 */

'use strict';

/**
 * Échappe une chaîne pour l'insertion sécurisée dans le HTML.
 * Utilise textContent pour éviter les attaques XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const el = document.createElement('div');
    el.textContent = String(str);
    return el.innerHTML;
}

/**
 * Crée un élément DOM avec des attributs et du contenu texte sécurisé.
 * @param {string} tag - Nom de la balise HTML
 * @param {Object} [attrs] - Attributs à appliquer
 * @param {string} [textContent] - Contenu texte (échappé automatiquement)
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, textContent = '') {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
        if (key === 'class') {
            el.className = val;
        } else if (key === 'style' && typeof val === 'object') {
            Object.assign(el.style, val);
        } else {
            el.setAttribute(key, val);
        }
    }
    if (textContent) el.textContent = textContent;
    return el;
}

/**
 * Injecte un bloc de CSS de façon idempotente (ne le réinjecte pas si déjà présent).
 * @param {string} id - Identifiant unique du bloc de styles
 * @param {string} css - Contenu CSS à injecter
 */
export function injectStyles(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}

/**
 * Attend qu'un élément DOM appraisse dans le DOM via MutationObserver.
 * @param {string} selector - Sélecteur CSS
 * @param {number} [timeout=10000] - Timeout en ms
 * @param {Element} [root=document.body] - Élément racine à observer
 * @returns {Promise<Element>}
 */
export function waitForElement(selector, timeout = 10000, root = document.body) {
    return new Promise((resolve, reject) => {
        const existing = root.querySelector(selector);
        if (existing) return resolve(existing);

        const observer = new MutationObserver(() => {
            const el = root.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(root, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`waitForElement: "${selector}" introuvable après ${timeout}ms`));
        }, timeout);
    });
}

/**
 * Contexte à passer à un module de gabarit (`*.template.js`).
 *
 * POURQUOI CETTE FONCTION EXISTE. Les gabarits extraits appellent
 * `ctx._escape(…)` — une MÉTHODE du composant, donc portée par son prototype.
 * Les sites d'appel passaient `{ ...this, …locales }`, et la décomposition ne
 * copie que les propriétés PROPRES et énumérables : `_escape` disparaissait,
 * et l'ouverture d'une fiche média plantait sur
 * « TypeError: _escape is not a function ».
 *
 * `Object.create(instance)` fabrique au contraire un objet dont le PROTOTYPE
 * est l'instance : toutes ses méthodes restent résolubles, et les valeurs
 * locales viennent par-dessus en propriétés propres. Le gabarit voit
 * exactement ce qu'il verrait avec `this`, plus ce qu'on lui ajoute.
 *
 * @param {Object} instance  le composant appelant (`this`)
 * @param {Object} [locales] valeurs calculées dans la méthode appelante
 */
export function contexteGabarit(instance, locales = null) {
    const ctx = Object.create(instance);
    if (locales) Object.assign(ctx, locales);
    return ctx;
}

/**
 * Lit une durée déclarée en jeton CSS, en millisecondes.
 *
 * Les durées d'animation vivent dans `public/design-system/tokens.css`. Le JS,
 * lui, les recopiait à la main : `setTimeout(… , 240)` pendant que la feuille
 * disait `--sh-dur-3` = 260 ms. Chaque fermeture de modale, de tiroir ou de
 * bande-annonce retirait donc le nœud à 92 % du fondu — l'élément disparaissait
 * d'un coup au lieu de s'éteindre. Quatre sites étaient dans ce cas, et ils
 * s'écarteront de nouveau au prochain ajustement des jetons si on continue à
 * écrire les valeurs en dur.
 *
 * @param {string} nom  ex. '--sh-dur-3'
 * @param {number} repli valeur si le jeton est introuvable (feuille non chargée)
 * @returns {number} millisecondes
 */
export function dureeJeton(nom, repli = 300) {
    if (typeof window === 'undefined' || !window.getComputedStyle) return repli;
    try {
        const brut = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
        if (!brut) return repli;
        const n = parseFloat(brut);
        if (!Number.isFinite(n)) return repli;
        return brut.endsWith('ms') ? n : n * 1000;
    } catch {
        return repli;
    }
}

/**
 * Exécute une action une fois l'animation de sortie réellement terminée.
 *
 * La marge couvre l'écart entre la frame où la classe est retirée et le début
 * effectif de la transition ; sans elle, on retire encore le nœud une ou deux
 * frames trop tôt sur une machine chargée.
 */
export function apresSortie(action, jeton = '--sh-dur-3', marge = 40) {
    return setTimeout(action, dureeJeton(jeton) + marge);
}

/**
 * L'utilisateur a-t-il demandé moins de mouvement ?
 *
 * `tokens.css` respecte bien `prefers-reduced-motion` pour les animations et
 * les transitions, et pose même `scroll-behavior: auto !important`. Mais cette
 * propriété CSS n'a AUCUN effet sur un `element.scrollTo({ behavior: 'smooth' })`
 * : l'option JavaScript l'emporte. Dix-huit défilements de l'application
 * restaient donc animés — dont ceux du carrousel et celui qui suit le focus,
 * les deux plus susceptibles de gêner quelqu'un de sensible au mouvement.
 *
 * @returns {boolean}
 */
export function mouvementReduit() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/** `'auto'` si l'utilisateur demande moins de mouvement, `'smooth'` sinon. */
export function comportementDefilement() {
    return mouvementReduit() ? 'auto' : 'smooth';
}

/**
 * Rend une URL saisie par l'utilisateur sûre à placer dans un `href`.
 *
 * `escapeHtml` échappe le HTML — il ne regarde PAS le schéma. Une valeur
 * `javascript:alert(1)` traversait donc intacte jusqu'à l'attribut, et un clic
 * exécutait du script dans le contexte de l'application. Ce n'est pas
 * théorique : l'URL de qBittorrent est saisie dans les réglages, et les
 * réglages peuvent être IMPORTÉS depuis un JSON collé.
 *
 * Seuls `http:` et `https:` passent. Tout le reste devient la chaîne vide,
 * c'est-à-dire un lien qui ne mène nulle part plutôt qu'un lien qui exécute.
 *
 * @param {string} valeur
 * @param {string} [repli]
 * @returns {string} URL sûre, ou chaîne vide
 */
export function urlSure(valeur, repli = '') {
    const brut = String(valeur ?? '').trim();
    if (!brut) return repli;
    try {
        const u = new URL(brut, typeof location !== 'undefined' ? location.href : 'http://localhost');
        return ['http:', 'https:'].includes(u.protocol) ? u.href : repli;
    } catch {
        return repli;
    }
}
