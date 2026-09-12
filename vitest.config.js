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

        coverage: {
            provider: 'v8',
            reporter: ['text-summary'],
            // `all: true` compte AUSSI les modules qu'aucun test n'importe.
            // Sans lui, la couverture ne mesurerait que ce qui est déjà couvert
            // et afficherait un chiffre flatteur — le vert qui ment, encore.
            all: true,
            include: ['core/**/*.js', 'ui/**/*.js', 'jellyfin/**/*.js', 'integrations/**/*.js', 'plugins/**/*.js'],
            exclude: ['**/*.template.js', '**/*.css'],
            // PLANCHERS, pas objectifs. Ils sont calés sur la mesure du
            // 11 septembre 2026 — 21,32 / 17,60 / 20,74 / 21,72 sur cette
            // configuration exacte — et arrondis vers le bas : un plancher au
            // dixième casserait la chaîne sur un commit sans rapport, et un
            // contrôle qu'on contourne ne contrôle rien.
            // Ils ne peuvent que monter.
            thresholds: {
                statements: 21,
                branches: 17,
                functions: 20,
                lines: 21,
            },
        },
    },
});
