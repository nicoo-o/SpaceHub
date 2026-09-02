/**
 * SpaceHub — Neutralisation des imports CSS pour les tests Node
 * =============================================================
 *
 * Depuis que le CSS des composants vit dans de vrais fichiers .css importés par
 * les modules (`import './Toaster.css'`), Node ne sait plus charger ces modules
 * hors de Vite : il ne connaît pas l'extension .css.
 *
 * Ce hook remplace chaque import CSS par un module vide. Les tests de fumée
 * peuvent donc continuer d'instancier les composants exactement comme avant ;
 * seule la feuille de style, hors sujet pour ces tests, est ignorée.
 *
 *   node --import ./scripts/css-stub-loader.mjs scripts/smoke-tests.mjs
 */

import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.endsWith('.css')) {
            return { url: 'data:text/javascript,export default {}', shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});
