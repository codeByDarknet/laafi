import { describe, expect, it } from 'vitest';

import { genererUsername } from './enroler-agent';

describe('genererUsername (même règle que le backend)', () => {
  it('retire accents, espaces et ponctuation', () => {
    expect(genererUsername('Aïcha', 'Ouédraogo')).toBe('aicha.ouedraogo');
    expect(genererUsername('Jean-Baptiste', "N'Diaye Koné")).toBe('jeanbaptiste.ndiayekone');
  });

  it('renvoie une chaîne vide tant que le prénom ou le nom manque', () => {
    expect(genererUsername('Awa', '')).toBe('');
    expect(genererUsername('', 'Sawadogo')).toBe('');
  });
});
