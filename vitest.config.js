/**
 * SpaceHub — Configuration des tests unitaires
 *
 * Deux environnements coexistent volontairement :
 *   - `node` par défaut, pour les modules purs (InputMapper, PluginManager) :
 *     ils n'ont pas besoin d'un DOM, et s'en passer rend les tests plus rapides
 *     et plus honnêtes — si un test échoue, ce n'est pas la faute de jsdom.
 *   - `jsdom` là où le module touche réellement au DOM, déclaré par le
 *     commentaire `@vitest-environment jsdom` en tête du fichier concerné.
 *
 * Les imports CSS sont neutralisés : depuis l'extraction du CSS hors du JS,
 * les modules importent des feuilles que Vite injecte à la construction. En
 * test unitaire elles n'apportent rien et casseraient la résolution.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        css: false,
        globals: false,
        // Un test unitaire qui dépasse cinq secondes ne teste plus une unité.
        testTimeout: 5000,
    },
});
