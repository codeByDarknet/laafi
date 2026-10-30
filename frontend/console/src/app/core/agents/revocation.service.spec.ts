import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiService } from '../api/api.service';
import { ResultatOperation } from '../api/models';
import { AuthService } from '../auth/auth.service';
import { ConfirmationInvalideError, MOTIF_MIN, RevocationService } from './revocation.service';

const USERNAME = 'issa.kabore';
const MOTIF = 'Départ à la retraite au 31/10';
const resultat = (statut: ResultatOperation['statut']): ResultatOperation => ({
  username: USERNAME,
  matrixId: `@${USERNAME}:laafi.local`,
  statut,
});

describe('RevocationService', () => {
  let api: { revoquer: ReturnType<typeof vi.fn>; revoquerAppareils: ReturnType<typeof vi.fn>; reactiver: ReturnType<typeof vi.fn> };
  const superAdmin = signal(false);
  let service: RevocationService;

  beforeEach(() => {
    superAdmin.set(false);
    api = {
      revoquer: vi.fn(() => of(resultat('REVOQUE'))),
      revoquerAppareils: vi.fn(() => of(resultat('APPAREILS_REVOQUES'))),
      reactiver: vi.fn(() => of(resultat('ACTIF'))),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { estSuperAdmin: superAdmin.asReadonly() } },
      ],
    });
    service = TestBed.inject(RevocationService);
  });

  describe('verifier (confirmation forte)', () => {
    it('exige un motif d’au moins MOTIF_MIN caractères utiles', () => {
      expect(service.verifier(USERNAME, USERNAME, 'x'.repeat(MOTIF_MIN - 1)).motifValide).toBe(false);
      expect(service.verifier(USERNAME, USERNAME, `   ${'x'.repeat(MOTIF_MIN - 1)}   `).motifValide).toBe(false);
      expect(service.verifier(USERNAME, USERNAME, 'x'.repeat(MOTIF_MIN)).motifValide).toBe(true);
    });

    it('exige la saisie exacte de l’identifiant (sensible à la casse)', () => {
      expect(service.verifier(USERNAME, 'issa.kabor', MOTIF).confirmationValide).toBe(false);
      expect(service.verifier(USERNAME, 'Issa.Kabore', MOTIF).confirmationValide).toBe(false);
      expect(service.verifier(USERNAME, ` ${USERNAME} `, MOTIF).confirmationValide).toBe(true);
    });

    it('n’autorise la confirmation que si tout est valide', () => {
      expect(service.verifier(USERNAME, USERNAME, MOTIF).peutConfirmer).toBe(true);
      expect(service.verifier(USERNAME, '', MOTIF).peutConfirmer).toBe(false);
      expect(service.verifier(USERNAME, USERNAME, '').peutConfirmer).toBe(false);
      expect(service.verifier('', '', MOTIF).peutConfirmer).toBe(false);
    });
  });

  describe('revoquer', () => {
    it('n’appelle PAS l’API si le motif est absent', async () => {
      await expect(service.revoquer(USERNAME, USERNAME, '  ')).rejects.toBeInstanceOf(ConfirmationInvalideError);
      expect(api.revoquer).not.toHaveBeenCalled();
    });

    it('n’appelle PAS l’API si l’identifiant saisi ne correspond pas', async () => {
      await expect(service.revoquer(USERNAME, 'awa.sawadogo', MOTIF)).rejects.toBeInstanceOf(ConfirmationInvalideError);
      expect(api.revoquer).not.toHaveBeenCalled();
    });

    it('appelle l’API avec le motif nettoyé quand la confirmation est valide', async () => {
      const r = await service.revoquer(USERNAME, USERNAME, `  ${MOTIF}  `);
      expect(api.revoquer).toHaveBeenCalledExactlyOnceWith(USERNAME, MOTIF);
      expect(r.statut).toBe('REVOQUE');
    });
  });

  describe('revoquerAppareils (perte de téléphone)', () => {
    it('transmet le motif s’il est renseigné', async () => {
      await service.revoquerAppareils(USERNAME, ' Téléphone perdu ');
      expect(api.revoquerAppareils).toHaveBeenCalledWith(USERNAME, 'Téléphone perdu');
    });

    it('n’envoie pas de motif vide', async () => {
      const r = await service.revoquerAppareils(USERNAME, '   ');
      expect(api.revoquerAppareils).toHaveBeenCalledWith(USERNAME, undefined);
      expect(r.statut).toBe('APPAREILS_REVOQUES');
    });
  });

  describe('reactiver', () => {
    it('est refusée à un admin_ministere, sans appel réseau', async () => {
      await expect(service.reactiver(USERNAME, 'Erreur de manipulation')).rejects.toBeInstanceOf(ConfirmationInvalideError);
      expect(api.reactiver).not.toHaveBeenCalled();
    });

    it('est permise au super_admin', async () => {
      superAdmin.set(true);
      const r = await service.reactiver(USERNAME, ' Retour de mission ');
      expect(api.reactiver).toHaveBeenCalledWith(USERNAME, 'Retour de mission');
      expect(r.statut).toBe('ACTIF');
    });
  });
});
