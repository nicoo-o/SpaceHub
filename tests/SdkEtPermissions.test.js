/**
 * @vitest-environment jsdom
 *
 * SDK et permissions — la dette relevée par l'audit.
 *
 * Quatre défauts, tous de la même famille : une fonction qui renvoie quelque
 * chose de faux plutôt que rien, ou qui refuse plus large qu'elle ne devrait.
 * Aucun ne provoque d'erreur ; ils se manifestent bien plus tard, ailleurs,
 * sans lien visible avec leur cause.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SpaceHubSDK from '../core/SDK.js';
import { PluginPermissions, PluginPermissionError } from '../core/PluginPermissions.js';
import SettingsManager from '../core/SettingsManager.js';

beforeEach(() => { localStorage.clear(); window.SpaceHub = { core: {}, ui: { components: {} } }; });
afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('SDK.applyTheme', () => {
    it('ne rapporte pas un échec quand le thème est bien appliqué', () => {
        // Un gestionnaire qui applique le thème sans rien renvoyer : le
        // `|| false` transformait ce succès silencieux en échec déclaré.
        window.SpaceHub.ui.themes = { apply: () => undefined };
        expect(new SpaceHubSDK().applyTheme('spacehub-dark')).toBe(true);
    });

    it('rapporte l\'échec quand le thème est introuvable', () => {
        window.SpaceHub.ui.themes = { apply: () => false };
        expect(new SpaceHubSDK().applyTheme('inconnu')).toBe(false);
    });

    it('rapporte l\'échec quand il n\'y a pas de gestionnaire', () => {
        expect(new SpaceHubSDK().applyTheme('spacehub-dark')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SDK.registerMetadataProvider', () => {
    it('renvoie null — pas un désabonnement vide — si le service est absent', () => {
        // Une fonction de désabonnement laisse croire au plugin que son
        // enregistrement a réussi. Il découvre le contraire bien plus tard,
        // en constatant que ses métadonnées n'apparaissent jamais.
        const resultat = new SpaceHubSDK().registerMetadataProvider({ id: 'x', fetch: () => null });
        expect(resultat).toBeNull();
    });

    it('renvoie le désabonnement réel quand l\'enregistrement a eu lieu', () => {
        const desabonner = vi.fn();
        window.SpaceHub.metadata = { registerProvider: () => desabonner };
        expect(new SpaceHubSDK().registerMetadataProvider({ id: 'x' })).toBe(desabonner);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SDK.getPluginStorage', () => {
    it('ne fait pas tomber l\'écran de réglages quand le plugin est absent', () => {
        // `PluginManager.getPluginStorage` LÈVE sur un plugin inconnu, et le
        // chaînage optionnel ne protège pas d'une exception levée À
        // L'INTÉRIEUR de la fonction. L'appel se fait depuis un littéral de
        // gabarit : l'exception y emporte tout l'écran des réglages.
        window.SpaceHub.core.pluginManager = {
            getPluginStorage: () => { throw new Error('Plugin introuvable : fantome'); },
        };
        const sdk = new SpaceHubSDK();
        expect(() => sdk.getPluginStorage('fantome')).not.toThrow();
        expect(sdk.getPluginStorage('fantome')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Approbation des permissions', () => {
    function permissions({ admin }) {
        const settings = new SettingsManager();
        return new PluginPermissions({
            settings,
            userProvider: () => ({ Id: 'u1', Policy: { IsAdministrator: admin } }),
        });
    }

    it('laisse un compte ordinaire approuver ce qui ne touche pas au serveur', () => {
        // Les deux permissions du plugin de notes. Aucune n'est ADMIN_ONLY,
        // et pourtant l'approbation leur était refusée : aucun compte
        // ordinaire ne voyait jamais de note externe, alors que l'écran de
        // réglages lui réclamait sa clé API OMDb.
        const p = permissions({ admin: false });
        expect(() => p.setApproved('spacehub.ratings',
            ['network.external.read', 'jellyfin.metadata.read'])).not.toThrow();
        expect(p.can('spacehub.ratings', 'network.external.read')).toBe(true);
    });

    it('refuse toujours à un compte ordinaire ce qui agit sur le serveur', () => {
        const p = permissions({ admin: false });
        for (const sensible of ['server.plugins.configure', 'jellyfin.metadata.write', 'jellyfin.library.refresh']) {
            expect(() => p.setApproved('x', [sensible]), sensible).toThrow(PluginPermissionError);
        }
    });

    it('refuse le lot entier si UNE seule permission est sensible', () => {
        // Sans quoi il suffirait de noyer une permission serveur dans un lot
        // anodin pour la faire passer.
        const p = permissions({ admin: false });
        expect(() => p.setApproved('x',
            ['network.external.read', 'server.plugins.configure'])).toThrow(PluginPermissionError);
        expect(p.can('x', 'network.external.read'), 'le lot refusé a été partiellement appliqué').toBe(false);
    });

    it('laisse un administrateur tout approuver', () => {
        const p = permissions({ admin: true });
        expect(() => p.setApproved('x', ['server.plugins.configure'])).not.toThrow();
    });

    it('refuse toujours une permission inconnue', () => {
        expect(() => permissions({ admin: true }).setApproved('x', ['invente.moi'])).toThrow(PluginPermissionError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Manifeste du plugin de notes', () => {
    it('ne déclare plus une contribution qu\'il n\'enregistre pas', async () => {
        const { default: manifest } = await import('../plugins/ratings/spacehub-ratings-plugin.js');
        // Il alimente RatingCacheService par setProvider ; il n'est pas un
        // fournisseur de métadonnées au sens du SDK. Déclarer le contraire
        // trompait la console des plugins.
        expect(manifest.contributions).toEqual([]);
        expect(manifest.permissions).toEqual(['network.external.read', 'jellyfin.metadata.read']);
    });
});
