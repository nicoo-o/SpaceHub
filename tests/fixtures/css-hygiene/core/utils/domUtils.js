// Fixture d'exception — le chemin reproduit l'exception DOCUMENTÉE
// « core/utils/domUtils.js » : helper générique dont le CSS est un paramètre.
// Ce fichier doit donc rester licite malgré son bloc <style>.
export function injecterCss(css) {
    const feuille = document.createElement('style');
    feuille.textContent = css;
    document.head.appendChild(feuille);
    return feuille;
}