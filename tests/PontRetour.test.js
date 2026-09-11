/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SpatialNavigation from '../core/SpatialNavigation.js';

/**
 * La couche « search » est la plus simple à fabriquer dans un test :
 * LAYERS.search = `.sh-spotlight-overlay.open`, et son closer appelle
 * svc.search()?.close ?? retire la classe — dans un test sans services,
 * le repli retire les classes d'ouverture. On vérifie le CONTRAT de
 * demandeRetour (vrai = couche vivante fermée), pas les closers réels.
 */
describe('SpatialNavigation.demandeRetour (API publique pour le pont Android)', () => {
    let nav;
    beforeEach(() => { nav = new SpatialNavigation(); });
    afterEach(() => { nav.destroy?.(); });

    function ouvrirRecherche() {
        const el = document.createElement('div');
        el.className = 'sh-spotlight-overlay open';
        document.body.appendChild(el);
        return el;
    }

    it('une couche ouverte est fermée → true', () => {
        ouvrirRecherche();
        nav.pushLayer('search');
        expect(nav.demandeRetour()).toBe(true);
        // Le closer de repli a retiré les classes d'ouverture.
        expect(document.querySelector('.sh-spotlight-overlay.open')).toBeNull();
    });

    it('aucune couche ouverte → false (le pont affichera sa confirmation)', () => {
        expect(nav.demandeRetour()).toBe(false);
    });

    it('une couche dans la pile mais fermée autrement → false (nettoyage, pas fermeture)', () => {
        // pushLayer sans rendre l'élément : la pile contient un fantôme.
        nav.pushLayer('search');
        expect(nav.demandeRetour()).toBe(false);
    });

    it('le retour vide la pile fantôme puis rend false au suivant', () => {
        nav.pushLayer('search');   // fantôme
        nav.pushLayer('search');   // fantôme
        expect(nav.demandeRetour()).toBe(false);
        expect(nav.demandeRetour()).toBe(false);
    });
});
