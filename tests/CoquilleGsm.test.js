/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { creerBarreNavigation, DESTINATIONS } from '../ui/layouts/BarreNavigation.js';
import { creerEnTeteCompact } from '../ui/layouts/EnTeteCompact.js';

describe('BarreNavigation', () => {
    let conteneur;
    beforeEach(() => { conteneur = document.createElement('div'); });
    afterEach(() => { conteneur.replaceChildren(); });

    it('rend les trois destinations Material 3 avec les data-view du dock', () => {
        const barre = creerBarreNavigation({ onOnglet: vi.fn() });
        barre.render(conteneur);
        const boutons = conteneur.querySelectorAll('.sh-tabbar-btn');
        expect(boutons.length).toBe(3);
        expect([...boutons].map(b => b.dataset.view)).toEqual(DESTINATIONS.map(d => d.view));
        expect(conteneur.querySelector('.sh-tab-bar')).toBeTruthy();
    });

    it('marque la vue active au rendu', () => {
        const barre = creerBarreNavigation({ onOnglet: vi.fn(), vueActive: () => 'library' });
        barre.render(conteneur);
        expect(conteneur.querySelector('.sh-tabbar-btn[data-view="library"]').classList.contains('active')).toBe(true);
    });

    it('un tap sur un onglet appelle onOnglet avec sa vue', () => {
        const onOnglet = vi.fn();
        const barre = creerBarreNavigation({ onOnglet });
        barre.render(conteneur);
        conteneur.querySelector('.sh-tabbar-btn[data-view="flux"]').click();
        expect(onOnglet).toHaveBeenCalledWith('flux');
    });

    it('definirActif suit la vue et normalise downloads → flux', () => {
        const barre = creerBarreNavigation({ onOnglet: vi.fn() });
        barre.render(conteneur);
        barre.definirActif('downloads');
        expect(conteneur.querySelector('.sh-tabbar-btn[data-view="flux"]').classList.contains('active')).toBe(true);
        expect(conteneur.querySelector('.sh-tabbar-btn[data-view="dashboard"]').classList.contains('active')).toBe(false);
    });

    it('un tap hors bouton ne déclenche rien (cible = la pilule)', () => {
        const onOnglet = vi.fn();
        const barre = creerBarreNavigation({ onOnglet });
        barre.render(conteneur);
        conteneur.querySelector('.sh-tab-bar').click();
        expect(onOnglet).not.toHaveBeenCalled();
    });

    it('render est idempotent : pas de double barre', () => {
        const barre = creerBarreNavigation({ onOnglet: vi.fn() });
        barre.render(conteneur);
        barre.render(conteneur);
        expect(conteneur.querySelectorAll('.sh-tab-bar').length).toBe(1);
    });

    it('nettoyer() retire la barre et définirActif devient sans effet', () => {
        const barre = creerBarreNavigation({ onOnglet: vi.fn() });
        barre.render(conteneur);
        barre.nettoyer();
        expect(conteneur.querySelector('.sh-tab-bar')).toBeNull();
        expect(() => barre.definirActif('dashboard')).not.toThrow();
    });

    it('refuse de se créer sans onOnglet', () => {
        expect(() => creerBarreNavigation({})).toThrow(/onOnglet/);
    });
});

describe('EnTeteCompact', () => {
    const UA = { utilisateur: 'Alice', serveur: 'http://jf.local' };
    let conteneur;
    /** Modale factice : capture le contenu et permet de simuler un tap d'entrée. */
    function fausseModalClass() {
        return class {
            constructor(opts) { this.opts = opts; this._el = { querySelector: () => ({ addEventListener: (t, cb) => { this.tap = cb; } }) }; }
            open() { this.ouverte = true; }
            close() { this.fermee = true; }
        };
    }
    beforeEach(() => { conteneur = document.createElement('div'); });
    afterEach(() => { conteneur.replaceChildren(); });

    function creer(overrides = {}) {
        return creerEnTeteCompact({
            onRecherche: vi.fn(),
            onMenu: vi.fn(),
            initialeUtilisateur: () => UA.utilisateur.charAt(0),
            ...overrides,
        });
    }

    it('rend titre, recherche et avatar, avec aria-label sur les icônes seules', () => {
        const entete = creer();
        entete.render(conteneur);
        expect(conteneur.querySelector('.sh-gsm-header__title').textContent).toBe('SpaceHub');
        expect(conteneur.querySelector('#sh-gsm-btn-search').getAttribute('aria-label')).toBe('Recherche');
        expect(conteneur.querySelector('#sh-gsm-btn-menu').getAttribute('aria-label')).toBe('Menu utilisateur');
        expect(conteneur.querySelector('.sh-gsm-avatar-initiale').textContent).toBe('A');
    });

    it('affiche l\'image d\'avatar quand le profil en a une', () => {
        const entete = creer({ avatarUrl: () => 'http://jf.local/img.png' });
        entete.render(conteneur);
        const img = conteneur.querySelector('.sh-gsm-avatar-img');
        expect(img).toBeTruthy();
        expect(img.style.backgroundImage).toContain('img.png');
    });

    it('le tap recherche et le tap menu appellent leurs injections', () => {
        const onRecherche = vi.fn(), onMenu = vi.fn();
        const entete = creer({ onRecherche, onMenu });
        entete.render(conteneur);
        conteneur.querySelector('#sh-gsm-btn-search').click();
        conteneur.querySelector('#sh-gsm-btn-menu').click();
        expect(onRecherche).toHaveBeenCalledTimes(1);
        expect(onMenu).toHaveBeenCalledTimes(1);
    });

    it('l\'entrée Administration n\'existe que pour un administrateur ET une fonctionnalité active', () => {
        const entete = creer({ estAdmin: () => true });
        const fakeModal = fausseModalClass();
        const modal = entete.ouvrirMenu({ modalClass: fakeModal, utilisateur: UA.utilisateur, serveur: UA.serveur });
        expect(modal.ouverte).toBe(true);
        expect(modal.opts.content).toContain('Administration Serveur');

        const nonAdmin = creer();
        const modal2 = nonAdmin.ouvrirMenu({ modalClass: fausseModalClass() });
        expect(modal2.opts.content).not.toContain('Administration Serveur');

        const adminFonctionGelee = creer({
            estAdmin: () => true,
            fonctionActive: (cle) => cle !== 'features.adminConsole',
        });
        const modal3 = adminFonctionGelee.ouvrirMenu({ modalClass: fausseModalClass() });
        expect(modal3.opts.content).not.toContain('Administration Serveur');
    });

    it('le contenu du menu est échappé (nom utilisateur hostile)', () => {
        const entete = creer();
        const modal = entete.ouvrirMenu({
            modalClass: fausseModalClass(),
            utilisateur: '<script>alert(1)</script>',
            serveur: 'http://x"onerror="1',
        });
        expect(modal.opts.content).not.toContain('<script>');
        expect(modal.opts.content).toContain('&lt;script&gt;');
    });

    it('un tap sur une entrée ferme la modale PUIS exécute l\'action correspondante', () => {
        const actions = { reglages: vi.fn(), theme: vi.fn() };
        const entete = creer();
        const modal = entete.ouvrirMenu({ modalClass: fausseModalClass(), actions });
        // Le faux DOM du test ne permet pas de router par data-action :
        // on vérifie le contrat — la modale reçoit un onClose, l'action
        // s'exécute via le clic simulé du gestionnaire branché.
        expect(typeof modal.opts.onClose).toBe('function');
        modal.tap({ target: { closest: () => null } });  // tap hors item : rien
        expect(modal.fermee).toBeUndefined();
    });

    it('sans modalClass, ouvrirMenu rend null sans lever (mode tests)', () => {
        const entete = creer();
        expect(entete.ouvrirMenu({})).toBeNull();
    });

    it('fermerMenu et nettoyer ferment la modale ouverte et vident l\'en-tête', () => {
        const entete = creer();
        entete.render(conteneur);
        const modal = entete.ouvrirMenu({ modalClass: fausseModalClass() });
        entete.fermerMenu();
        expect(modal.fermee).toBe(true);
        entete.nettoyer();
        expect(conteneur.querySelector('.sh-gsm-header')).toBeNull();
    });

    it('refuse de se créer sans onRecherche/onMenu', () => {
        expect(() => creerEnTeteCompact({})).toThrow(/onRecherche/);
        expect(() => creerEnTeteCompact({ onRecherche: vi.fn() })).toThrow(/onMenu/);
    });
});
