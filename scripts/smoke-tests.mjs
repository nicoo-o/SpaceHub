import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NavAction, mapKeyboardEvent } from '../core/InputMapper.js';
import { Router } from '../core/Router.js';
import { ApiError } from '../core/ApiClient.js';
import PluginManager from '../core/PluginManager.js';
import PluginPermissions from '../core/PluginPermissions.js';
import PluginCatalog from '../core/PluginCatalog.js';
import MetadataService from '../jellyfin/metadata/MetadataService.js';
import OnboardingWizard from '../ui/components/OnboardingWizard.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    location: { origin: 'http://localhost:3000' },
    SpaceHub: {}
};
globalThis.document = { activeElement: null };

try {
    assert.equal(mapKeyboardEvent({ key: 'ArrowLeft' }), NavAction.LEFT);
    assert.equal(mapKeyboardEvent({ key: 'Enter' }), NavAction.SELECT);
    assert.equal(mapKeyboardEvent({ key: 'Unknown' }), null);

    const router = new Router();
    for (let i = 0; i < 125; i++) await router.navigate('dashboard', { index: i });
    assert.equal(router._history.length, 100);
    router.destroy();
    assert.equal(router._history.length, 0);

    const settingsData = {};
    const deepGet = (key, fallback = null) => key.split('.').reduce((value, part) => value?.[part], settingsData) ?? fallback;
    const deepSet = (key, value) => {
        const parts = key.split('.');
        const last = parts.pop();
        const target = parts.reduce((value, part) => (value[part] ||= {}), settingsData);
        target[last] = value;
    };
    const settingsStub = {
        get: deepGet,
        set: deepSet,
        delete: key => {
            const parts = key.split('.');
            const last = parts.pop();
            const target = parts.reduce((value, part) => value?.[part], settingsData);
            if (target) delete target[last];
        }
    };
    const permissions = new PluginPermissions({ settings: settingsStub, userProvider: () => ({ Policy: { IsAdministrator: true } }) });
    assert.equal(permissions.validate(['jellyfin.items.read']).valid, true);
    assert.equal(permissions.validate(['unknown.permission']).valid, false);
    assert.equal(permissions.can('smoke-plugin', 'jellyfin.items.read'), false);
    permissions.setApproved('smoke-plugin', ['jellyfin.items.read']);
    assert.equal(permissions.can('smoke-plugin', 'jellyfin.items.read'), true);

    const pluginManager = new PluginManager({ settings: settingsStub, userProvider: () => ({ Policy: { IsAdministrator: true } }) });
    assert.equal(await pluginManager.registerPlugin({ id: 'invalid id', name: 'Invalid' }), false);
    let loaded = 0;
    let enabled = 0;
    assert.equal(await pluginManager.registerPlugin({
        id: 'smoke-plugin',
        name: 'Smoke plugin',
        isDefault: true,
        onLoad: async () => { loaded++; },
        onEnable: async () => { enabled++; }
    }), true);
    assert.equal(loaded, 1);
    assert.equal(enabled, 1);
    assert.equal(pluginManager.getPlugins()[0].state, 'enabled');

    assert.equal(await pluginManager.registerPlugin({ id: 'manual-plugin', name: 'Manual plugin' }), true);
    assert.equal(pluginManager.getPlugins().find(plugin => plugin.id === 'manual-plugin').state, 'registered');

    let cleaned = 0;
    assert.equal(await pluginManager.registerPlugin({
        id: 'permission-plugin',
        name: 'Permission plugin',
        permissions: ['jellyfin.items.read', 'ui.dashboard.write'],
        onLoad: async context => {
            context.sdk.on('test', () => {});
            context.sdk.registerContribution('action', { id: 'permission-action' });
        }
    }), true);
    assert.equal(await pluginManager.enablePlugin('permission-plugin'), false);
    pluginManager.approvePermissions('permission-plugin', ['jellyfin.items.read', 'ui.dashboard.write']);
    assert.equal(await pluginManager.enablePlugin('permission-plugin'), true);
    assert.equal(pluginManager.getContributions('action').length, 1);
    await pluginManager.disablePlugin('permission-plugin');
    assert.equal(pluginManager.getContributions('action').length, 0);

    assert.equal(await pluginManager.registerPlugin({
        id: 'dependent-plugin',
        dependencies: ['manual-plugin'],
        onEnable: async () => { cleaned++; }
    }), true);
    assert.equal(await pluginManager.enablePlugin('dependent-plugin'), true);
    assert.equal(cleaned, 1);

    const metadata = new MetadataService({
        settings: settingsStub,
        jellyfinApi: { getItem: async () => ({ Id: 'item-1', Name: 'Serveur', Overview: 'Résumé serveur' }) }
    });
    metadata.registerProvider({ id: 'external', name: 'Externe', fetch: async () => ({ Name: 'Titre externe' }) });
    metadata.setPolicy('default', { defaultOrder: ['external', 'jellyfin'], fields: {} });
    const merged = await metadata.get('item-1');
    assert.equal(merged.values.Name.sourceId, 'external');
    assert.equal(merged.values.Overview.sourceId, 'jellyfin');

    const catalog = new PluginCatalog({
        settings: settingsStub,
        requireSigned: false,
        userProvider: () => ({ Policy: { IsAdministrator: true } }),
        fetchImpl: async () => ({ ok: true, text: async () => 'plugin-source' })
    });
    assert.equal(catalog.validate({ id: 'catalog-plugin', version: '1.0.0', manifest: {}, permissions: [] }).valid, true);
    catalog.register({ id: 'catalog-plugin', version: '1.0.0', manifest: {}, permissions: [], entrypoint: 'https://example.test/plugin.js', integrity: 'sha256-invalid' });
    assert.equal(catalog.isApproved('catalog-plugin'), false);
    catalog.approve('catalog-plugin', []);
    assert.equal(catalog.isApproved('catalog-plugin'), true);
    assert.equal(catalog.isInstalled('catalog-plugin'), false);
    assert.deepEqual(await catalog.load('https://example.test/catalog.json').catch(() => []), []);

    const packageSource = 'export default { id: \'installable-plugin\', permissions: [], isDefault: false };';
    const packageIntegrity = `sha256-${createHash('sha256').update(packageSource).digest('base64')}`;
    const installCatalog = new PluginCatalog({
        settings: settingsStub,
        requireSigned: false,
        userProvider: () => ({ Policy: { IsAdministrator: true } }),
        fetchImpl: async () => ({ ok: true, text: async () => packageSource })
    });
    installCatalog.register({
        id: 'installable-plugin',
        version: '1.0.0',
        manifest: { id: 'installable-plugin', permissions: [] },
        permissions: [],
        entrypoint: 'https://example.test/installable.js',
        integrity: packageIntegrity
    });
    installCatalog.approve('installable-plugin', []);
    assert.equal((await installCatalog.install('installable-plugin', {
        pluginManager,
        loader: async () => ({ default: { id: 'installable-plugin', permissions: [] } })
    })).installed, true);
    assert.equal(installCatalog.isInstalled('installable-plugin'), true);
    assert.throws(() => new PluginCatalog({ settings: settingsStub, requireSigned: false, userProvider: () => ({ Policy: {} }) }).approve('catalog-plugin'), /administrateur/);

    const onboardingSettingsData = {};
    const onboardingSettings = {
        get: (key, fallback = null) => key.split('.').reduce((current, part) => current?.[part], onboardingSettingsData) ?? fallback,
        set: (key, value) => {
            const parts = key.split('.');
            const last = parts.pop();
            const target = parts.reduce((current, part) => (current[part] ||= {}), onboardingSettingsData);
            target[last] = value;
        },
        delete: key => {
            const parts = key.split('.');
            const last = parts.pop();
            const parent = parts.reduce((current, part) => current?.[part], onboardingSettingsData);
            if (parent) delete parent[last];
        }
    };
    const onboardingAuth = {
        isAuthenticated: () => true,
        getServerUrl: () => 'https://jellyfin.example.test',
        getUserId: () => 'user-1',
        getUser: () => ({ Id: 'user-1', Policy: { IsAdministrator: false } })
    };
    const onboarding = new OnboardingWizard({ settings: onboardingSettings, auth: onboardingAuth });
    assert.equal(onboarding.isCompleted('user'), false);
    assert.equal(onboarding.open('admin'), false);
    assert.equal(onboarding.getStorageKey('user').startsWith('onboarding.'), true);
    onboardingSettings.set(onboarding.getStorageKey('user'), true);
    onboardingSettings.set(onboarding.getStorageKey('user', 'version'), 1);
    assert.equal(onboarding.isCompleted('user'), true);

    const apiError = new ApiError(401, 'Unauthorized', '', '/test');
    assert.equal(apiError.status, 401);

    assert.equal(await pluginManager.registerPlugin({ id: 'bad-hook', name: 'Bad hook', onEnable: true }), false);

    // ─── RatingCacheService : cache, débounce, filtre fournisseurs, parsing OMDb ──
    const { default: RatingCacheService } = await import('../core/RatingCacheService.js');
    const ratingCache = new RatingCacheService({ settings: settingsStub });

    // Filtre fournisseurs : défaut sans config (tmdb inclus pour les textes)
    assert.deepEqual(ratingCache.getProviderFilter(), ['jellyfin', 'rt', 'imdb', 'tmdb']);

    // Filtre fournisseurs : config utilisateur (ordre et contenu préservés, inconnus filtrés)
    settingsData['ratings'] = { display: { providers: ['rt', 'metacritic', 'bogus'] } };
    assert.deepEqual(ratingCache.getProviderFilter(), ['rt', 'metacritic']);
    settingsData['ratings'] = { display: { providers: [] } };
    assert.deepEqual(ratingCache.getProviderFilter(), ['jellyfin', 'rt', 'imdb', 'tmdb']);
    delete settingsData['ratings'];

    // Sans provider enregistré : seulement la note Jellyfin, aucun appel externe
    let omdbCalls = 0;
    const jellyfinItem = {
        Id: 'jf-item-1',
        CommunityRating: 8.46,
        ProviderIds: { Imdb: 'tt0111161' }
    };
    const noProviderRatings = await ratingCache.get(jellyfinItem);
    assert.equal(noProviderRatings.jellyfin, 8.5);
    assert.equal(noProviderRatings.imdb, undefined);
    assert.equal(noProviderRatings.rt, undefined);

    // Provider enregistré : parsing OMDb + cache (un seul appel pour deux requêtes)
    ratingCache.setProvider(async (imdbId) => {
        omdbCalls++;
        assert.equal(imdbId, 'tt0111161');
        return { imdb: 9.3, rt: 91, metacritic: 80 };
    });
    const [r1, r2] = await Promise.all([ratingCache.get(jellyfinItem), ratingCache.get(jellyfinItem)]);
    assert.equal(omdbCalls, 1); // déduplication : deux requêtes simultanées → un seul appel
    assert.equal(r1.jellyfin, 8.5);
    assert.equal(r1.imdb, 9.3);
    assert.equal(r1.rt, 91);
    assert.equal(r1.metacritic, undefined); // filtré : metacritic pas dans le filtre par défaut
    assert.deepEqual(r2, r1);

    // Cache hit : troisième requête sans nouvel appel
    const r3 = await ratingCache.get(jellyfinItem);
    assert.equal(omdbCalls, 1);
    assert.equal(r3.rt, 91);

    // Item sans imdbId : aucun appel externe
    await ratingCache.get({ Id: 'jf-item-2', CommunityRating: 6, ProviderIds: {} });
    assert.equal(omdbCalls, 1);

    // Échec provider : silencieux, la note Jellyfin reste
    ratingCache.setProvider(async () => { throw new Error('OMDb down'); });
    ratingCache.invalidate('tt0111161');
    const r4 = await ratingCache.get(jellyfinItem);
    assert.equal(r4.jellyfin, 8.5);
    assert.equal(r4.rt, undefined);

    // clearProvider coupe la source externe
    ratingCache.clearProvider();
    assert.equal(ratingCache.hasProvider(), false);

    const originalFetch = globalThis.fetch;
    let capturedRequest = null;
    globalThis.fetch = async (url, config) => {
        capturedRequest = { url, config };
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ ok: true })
        };
    };
    try {
        const { BaseApiClient } = await import('../core/ApiClient.js');
        const client = new BaseApiClient('http://localhost:8096');
        await client.post('/Items', { Name: 'smoke' });
        assert.equal(capturedRequest.config.method, 'POST');
        assert.equal(capturedRequest.config.body, JSON.stringify({ Name: 'smoke' }));
    } finally {
        globalThis.fetch = originalFetch;
    }

    // ─── AuthManager : persistance de session (localStorage) + validation tolérante ──
    const makeWebStorage = () => {
        const map = new Map();
        return {
            getItem: k => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, String(v)),
            removeItem: k => map.delete(k),
            clear: () => map.clear()
        };
    };
    globalThis.localStorage = makeWebStorage();
    globalThis.sessionStorage = makeWebStorage();
    const originalAuthFetch = globalThis.fetch;
    try {
        const { default: AuthManager } = await import('../jellyfin/auth/AuthManager.js');

        // 1. Connexion → session persistée dans localStorage
        globalThis.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ AccessToken: 'tok-smoke', User: { Id: 'user-smoke', Name: 'nico' }, SessionInfo: {} })
        });
        const auth = new AuthManager();
        const loginRes = await auth.login('http://192.168.1.18:8096', 'nico', 'secret');
        assert.equal(loginRes.success, true);
        assert.equal(auth.isAuthenticated(), true);
        assert.ok(globalThis.localStorage.getItem('SpaceHub_jellyfin_auth'), 'session persistée dans localStorage');
        assert.equal(globalThis.sessionStorage.getItem('SpaceHub_jellyfin_auth'), null, 'plus de copie sessionStorage');

        // 2. Rechargement simulé : nouvelle instance → session restaurée
        const authReloaded = new AuthManager();
        assert.equal(authReloaded.isAuthenticated(), true);
        assert.equal(authReloaded.getUserId(), 'user-smoke');

        // 3. Migration depuis l'ancienne copie sessionStorage (hardening v1)
        globalThis.localStorage.removeItem('SpaceHub_jellyfin_auth');
        globalThis.sessionStorage.setItem('SpaceHub_jellyfin_auth', JSON.stringify({
            ServerUrl: 'http://192.168.1.18:8096', AccessToken: 'tok-legacy', User: { Id: 'user-legacy', Name: 'nico' }
        }));
        const authMigrated = new AuthManager();
        assert.equal(authMigrated.getToken(), 'tok-legacy');
        assert.ok(globalThis.localStorage.getItem('SpaceHub_jellyfin_auth'), 'migration vers localStorage');
        assert.equal(globalThis.sessionStorage.getItem('SpaceHub_jellyfin_auth'), null, 'copie legacy nettoyée');

        // 4. init() : erreur temporaire (504) → session préservée
        globalThis.fetch = async () => ({ ok: false, status: 504 });
        assert.equal(await authMigrated.init(), true);
        assert.equal(authMigrated.isAuthenticated(), true);

        // 5. init() : token révoqué (401) → session effacée proprement
        globalThis.fetch = async () => ({ ok: false, status: 401 });
        assert.equal(await authMigrated.init(), false);
        assert.equal(authMigrated.isAuthenticated(), false);
        assert.equal(globalThis.localStorage.getItem('SpaceHub_jellyfin_auth'), null, 'session effacée après 401');
    } finally {
        globalThis.fetch = originalAuthFetch;
        delete globalThis.localStorage;
        delete globalThis.sessionStorage;
    }

    // ─── RatingCacheService : fallback épisode → série + textes critiques (TMDB) ──
    window.SpaceHub.auth = {
        getServerUrl: () => 'http://192.168.1.18:8096',
        getUserId: () => 'user-smoke',
        getAuthHeaders: () => ({})
    };
    const originalEpisodeFetch = globalThis.fetch;
    try {
        globalThis.fetch = async (url) => {
            if (String(url).includes('/Items/series-smoke')) {
                return { ok: true, status: 200, json: async () => ({ Id: 'series-smoke', ProviderIds: { Imdb: 'tt0903747' } }) };
            }
            throw new Error('URL inattendue : ' + url);
        };
        const epCache = new RatingCacheService({ settings: settingsStub });
        const episodeCalls = [];
        epCache.setProvider(async (imdbId, opts) => {
            episodeCalls.push({ imdbId, opts });
            return { imdb: 8.7, rt: 78 };
        });
        const epRatings = await epCache.get({
            Id: 'ep-smoke',
            Type: 'Episode',
            SeriesId: 'series-smoke',
            ParentIndexNumber: 2,
            IndexNumber: 5
        });
        assert.equal(episodeCalls.length, 1);
        assert.equal(episodeCalls[0].imdbId, 'tt0903747', 'fallback : IMDb de la série utilisé');
        assert.equal(episodeCalls[0].opts.isSeriesFallback, true, 'flag série transmis au provider');
        assert.equal(epRatings.imdb, 8.7);
        assert.equal(epRatings.isSeriesFallback, true, 'flag note de la série posé');
    } finally {
        globalThis.fetch = originalEpisodeFetch;
        delete window.SpaceHub.auth;
    }

    // Texte critique réel (TMDB) : jamais inventé, source explicite
    const textCache = new RatingCacheService({ settings: settingsStub });
    textCache.setTextProvider(async (imdbId) => {
        assert.equal(imdbId, 'tt1234567');
        return { text: 'Une critique réelle et sourcée.', author: 'Critique Press', source: 'TMDB' };
    });
    const textRes = await textCache.getText({ Id: 'm-text', ProviderIds: { Imdb: 'tt1234567' } });
    assert.equal(textRes.source, 'TMDB');
    assert.ok(textRes.text.includes('sourcée'));
    // Sans provider texte → null (la carte sera masquée, aucun texte fabriqué)
    const noTextCache = new RatingCacheService({ settings: settingsStub });
    assert.equal(await noTextCache.getText({ Id: 'm-text', ProviderIds: { Imdb: 'tt1234567' } }), null);

    // ─── TrailerService : extraction YouTube + résolution multi-sources ──
    globalThis.document = Object.assign(globalThis.document, {
        createElement: () => ({ id: '', className: '', style: {}, textContent: '', innerHTML: '', appendChild() {}, setAttribute() {} }),
        getElementById: () => null,
        head: { appendChild() {} },
        addEventListener() {},
        removeEventListener() {}
    });
    const { default: TrailerService } = await import('../core/TrailerService.js');
    const trailers = new TrailerService();
    assert.equal(trailers.extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(trailers.extractYoutubeId('https://youtu.be/abc123XY_89'), 'abc123XY_89');
    assert.equal(trailers.extractYoutubeId('https://www.youtube.com/embed/ZXyZWv12345'), 'ZXyZWv12345');
    assert.equal(trailers.extractYoutubeId('https://vimeo.com/12345'), null);
    assert.equal(trailers.extractYoutubeId(null), null);
    // Résolution : RemoteTrailers YouTube + pas de serveur → source youtube extraite
    window.SpaceHub.auth = { getServerUrl: () => '', getUserId: () => '', getAuthHeaders: () => ({}) };
    try {
        const src = await trailers.resolve({
            Id: 'm-trailer',
            Name: 'Test Trailer',
            RemoteTrailers: [{ Url: 'https://www.youtube.com/watch?v=aBcDeFgHiJk' }]
        });
        assert.equal(src.length, 1);
        assert.equal(src[0].type, 'youtube');
        assert.equal(src[0].videoId, 'aBcDeFgHiJk');
    } finally {
        delete window.SpaceHub.auth;
    }

    console.log('Smoke tests passed.');
} finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
}
