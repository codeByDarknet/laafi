import { describe, expect, it } from 'vitest';
import {
  CHAMP_CLASSIFICATION,
  CHAMP_EXPIRATION,
  CHAMP_INSTRUCTION,
  POLITIQUES_PAR_DEFAUT,
  champsLaafi,
  dureesProposees,
  estExpire,
  estInstruction,
  expirationDuContenu,
  expirationParDefaut,
  fusionnerPolitiques,
  niveauDuContenu,
  niveauMax,
  reglesPour,
  texteFiligrane,
  transfertAutorise,
} from './classification';

const JOUR = 24 * 60 * 60 * 1000;

describe('Classification — lecture des champs bf.laafi.* du contenu chiffré', () => {
  it('lit le niveau, et traite une valeur absente ou inconnue comme NORMAL', () => {
    expect(niveauDuContenu({ [CHAMP_CLASSIFICATION]: 'CONFIDENTIEL' })).toBe('CONFIDENTIEL');
    expect(niveauDuContenu({ [CHAMP_CLASSIFICATION]: 'DIFFUSION_RESTREINTE' })).toBe('DIFFUSION_RESTREINTE');
    expect(niveauDuContenu({ body: 'bonjour' })).toBe('NORMAL');
    expect(niveauDuContenu({ [CHAMP_CLASSIFICATION]: 'SECRET_DEFENSE' })).toBe('NORMAL');
    expect(niveauDuContenu(null)).toBe('NORMAL');
  });

  it("n'accepte qu'une date d'expiration numérique positive", () => {
    expect(expirationDuContenu({ [CHAMP_EXPIRATION]: 1_800_000_000_000 })).toBe(1_800_000_000_000);
    expect(expirationDuContenu({ [CHAMP_EXPIRATION]: '1800000000000' })).toBeNull();
    expect(expirationDuContenu({ [CHAMP_EXPIRATION]: -5 })).toBeNull();
    expect(expirationDuContenu({})).toBeNull();
  });

  it("reconnaît une instruction uniquement si le drapeau vaut exactement true", () => {
    expect(estInstruction({ [CHAMP_INSTRUCTION]: true })).toBe(true);
    expect(estInstruction({ [CHAMP_INSTRUCTION]: 'true' })).toBe(false);
    expect(estInstruction(undefined)).toBe(false);
  });

  it('produit les champs à fusionner dans le contenu avant chiffrement', () => {
    expect(champsLaafi('NORMAL', null, false)).toEqual({ [CHAMP_CLASSIFICATION]: 'NORMAL' });
    expect(champsLaafi('CONFIDENTIEL', 42, true)).toEqual({
      [CHAMP_CLASSIFICATION]: 'CONFIDENTIEL',
      [CHAMP_EXPIRATION]: 42,
      [CHAMP_INSTRUCTION]: true,
    });
  });

  it('affiche le niveau le plus sensible d\'une conversation', () => {
    expect(niveauMax([])).toBe('NORMAL');
    expect(niveauMax(['NORMAL', 'CONFIDENTIEL', 'DIFFUSION_RESTREINTE'])).toBe('CONFIDENTIEL');
  });
});

describe('Classification — politiques', () => {
  it('applique les règles du contrat pour CONFIDENTIEL : ni copie, ni transfert, filigrane nominatif, flou', () => {
    const r = reglesPour('CONFIDENTIEL', POLITIQUES_PAR_DEFAUT);
    expect(r).toEqual({
      copieAutorisee: false,
      transfert: 'INTERDIT',
      filigrane: true,
      filigraneNominatif: true,
      flouHorsFocus: true,
    });
  });

  it('ne relâche jamais une règle quand la réponse du backend est incomplète ou invalide', () => {
    const fusion = fusionnerPolitiques([
      { niveau: 'CONFIDENTIEL', copie: 'oui', transfert: 'PARTOUT', expirationJours: -1 },
      { niveau: 'INCONNU', copie: true },
      null,
    ]);
    expect(fusion.CONFIDENTIEL.copie).toBe(false);
    expect(fusion.CONFIDENTIEL.transfert).toBe('INTERDIT');
    expect(fusion.CONFIDENTIEL.expirationJours).toBe(7);
    expect(fusionnerPolitiques('pas un tableau')).toEqual(POLITIQUES_PAR_DEFAUT);
  });

  it('prend en compte une politique valide reçue du backend', () => {
    const fusion = fusionnerPolitiques([{ niveau: 'DIFFUSION_RESTREINTE', expirationJours: 14, copie: false }]);
    expect(fusion.DIFFUSION_RESTREINTE.expirationJours).toBe(14);
    expect(fusion.DIFFUSION_RESTREINTE.copie).toBe(false);
    expect(fusion.DIFFUSION_RESTREINTE.transfert).toBe('INTERNE_MINISTERE');
  });
});

describe('Classification — expiration', () => {
  const maintenant = Date.UTC(2026, 10, 2, 8, 0, 0);

  it("fixe l'expiration par défaut à la durée maximale du niveau", () => {
    expect(expirationParDefaut(POLITIQUES_PAR_DEFAUT.CONFIDENTIEL, maintenant)).toBe(maintenant + 7 * JOUR);
    expect(expirationParDefaut(POLITIQUES_PAR_DEFAUT.NORMAL, maintenant)).toBeNull();
  });

  it("ne propose jamais une durée plus longue que la politique", () => {
    expect(dureesProposees(POLITIQUES_PAR_DEFAUT.CONFIDENTIEL)).toEqual([JOUR / 24, JOUR, 7 * JOUR]);
    expect(dureesProposees(POLITIQUES_PAR_DEFAUT.NORMAL)[0]).toBe(0);
  });

  it("masque un message dès que sa date d'expiration est atteinte", () => {
    expect(estExpire(null, maintenant)).toBe(false);
    expect(estExpire(maintenant + 1, maintenant)).toBe(false);
    expect(estExpire(maintenant, maintenant)).toBe(true);
    expect(estExpire(maintenant - JOUR, maintenant)).toBe(true);
  });
});

describe('Classification — transfert et filigrane', () => {
  it('limite la diffusion restreinte au ministère de l\'émetteur', () => {
    expect(transfertAutorise('INTERNE_MINISTERE', 'MSANTE', ['MSANTE', 'MSANTE'])).toBe(true);
    expect(transfertAutorise('INTERNE_MINISTERE', 'MSANTE', ['MSANTE', 'MEDUC'])).toBe(false);
    expect(transfertAutorise('INTERNE_MINISTERE', 'MSANTE', ['MSANTE', null])).toBe(false);
    expect(transfertAutorise('INTERNE_MINISTERE', 'MSANTE', [])).toBe(false);
    expect(transfertAutorise('INTERNE_MINISTERE', null, ['MSANTE'])).toBe(false);
  });

  it('interdit tout transfert confidentiel et autorise tout transfert normal', () => {
    expect(transfertAutorise('INTERDIT', 'MSANTE', ['MSANTE'])).toBe(false);
    expect(transfertAutorise('AUTORISE', null, ['MEDUC'])).toBe(true);
  });

  it('compose un filigrane nominatif (nom · matricule · date)', () => {
    const date = new Date(Date.UTC(2026, 10, 2, 9, 30));
    expect(texteFiligrane(true, { nom: 'Awa Ouédraogo', matricule: 'A-0001-F' }, 'Confidentiel', date)).toBe(
      'Awa Ouédraogo · A-0001-F · 2026-11-02',
    );
    expect(texteFiligrane(true, { nom: 'Awa Ouédraogo' }, 'Confidentiel', date)).toBe('Awa Ouédraogo · 2026-11-02');
    expect(texteFiligrane(false, { nom: 'Awa Ouédraogo' }, 'Diffusion restreinte', date)).toBe(
      'Diffusion restreinte · 2026-11-02',
    );
  });
});
