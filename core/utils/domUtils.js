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
