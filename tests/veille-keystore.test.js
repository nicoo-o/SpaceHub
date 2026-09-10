import { describe, it, expect } from 'vitest';
import { evaluerArtefacts, NOM_ARTEFACT } from '../scripts/verifier-amorcage-keystore.mjs';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Fabrique un artefact GitHub Actions mocké, créé il y a `ageJours` jours
 * (rétention réelle : 30 jours — donc `ageJours` 25 = 5 jours restants).
 */
function artefact({ ageJours, maintenant, id = 1, expire = false, nom = NOM_ARTEFACT }) {
    return {
        id,
        name: nom,
        expired: expire,
        created_at: new Date(maintenant - ageJours * JOUR_MS).toISOString(),
        workflow_run: { id: 1000 + id },
    };
}

describe("veille du keystore d'amorçage (rétention 30 jours, alerte à 7 jours)", () => {
    it('alerte quand il reste exactement 5 jours — l\'artefact mocké expire dans 5 jours', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [artefact({ ageJours: 25, maintenant })],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(1);
        expect(verdict.annotation).toBe('warning');
        expect(verdict.message).toContain('expire dans 5 jour(s)');
        expect(verdict.message).toContain('docs/PROMOTION_KEYSTORE.md');
        expect(verdict.lignes).toHaveLength(1);
        expect(verdict.lignes[0]).toContain('artefact #1');
        expect(verdict.lignes[0]).toContain('5 jour(s) restant(s)');
    });

    it('alerte au seuil inclus (7 jours restants)', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [artefact({ ageJours: 23, maintenant })],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(1);
        expect(verdict.annotation).toBe('warning');
        expect(verdict.message).toContain('expire dans 7 jour(s)');
    });

    it('reste silencieux au-delà du seuil (10 jours restants)', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [artefact({ ageJours: 20, maintenant })],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(0);
        expect(verdict.annotation).toBeNull();
        expect(verdict.message).toContain('10 jour(s) avant expiration');
    });

    it('passe en erreur quand le keystore est expiré', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [artefact({ ageJours: 31, maintenant })],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(1);
        expect(verdict.annotation).toBe('error');
        expect(verdict.message).toContain('EXPIRÉ');
    });

    it('ignore les artefacts marqués expirés par GitHub et les autres noms', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [
                artefact({ ageJours: 25, maintenant, expire: true }),
                artefact({ ageJours: 25, maintenant, id: 2, nom: 'autre-artefact' }),
            ],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(0);
        expect(verdict.message).toContain('Aucun keystore');
    });

    it('prend le plus proche de l\'expiration parmi plusieurs candidats', () => {
        const maintenant = Date.now();
        const verdict = evaluerArtefacts(
            [
                artefact({ ageJours: 20, maintenant, id: 1 }),
                artefact({ ageJours: 25, maintenant, id: 2 }),
            ],
            maintenant,
        );
        expect(verdict.codeSortie).toBe(1);
        expect(verdict.message).toContain('expire dans 5 jour(s)');
        expect(verdict.lignes).toHaveLength(2);
    });
});