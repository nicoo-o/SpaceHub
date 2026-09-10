// Fixture fautive — un bloc <style> réintroduit dans une chaîne JavaScript.
export function monterWidget() {
    const feuille = document.createElement('style');
    feuille.textContent = `.sh-coupable { color: red; }`;
    document.head.appendChild(feuille);
}