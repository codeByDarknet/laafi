import { describe, expect, it } from 'vitest';
import { empreinteInstruction, jsonCanonique, sha256Hex } from './empreinte';

describe('Empreinte — JSON canonique', () => {
  it("trie les clés et supprime les espaces : l'ordre des clés ne change pas le résultat", () => {
    const a = jsonCanonique({ b: 1, a: { d: [1, 2], c: 'é' } });
    const b = jsonCanonique({ a: { c: 'é', d: [1, 2] }, b: 1 });
    expect(a).toBe('{"a":{"c":"é","d":[1,2]},"b":1}');
    expect(a).toBe(b);
  });

  it('refuse les nombres non entiers et les valeurs non sérialisables', () => {
    expect(() => jsonCanonique({ x: 1.5 })).toThrow();
    expect(() => jsonCanonique(() => 0)).toThrow();
  });

  it('ignore les clés de valeur undefined', () => {
    expect(jsonCanonique({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('Empreinte — SHA-256 (WebCrypto)', () => {
  it('correspond aux vecteurs de test publiés (FIPS 180-2)', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it("calcule la même empreinte pour la même instruction, quel que soit l'ordre des champs", async () => {
    const contenu = {
      msgtype: 'm.text',
      body: 'Réunion de coordination demain à 8 h, salle B.',
      'bf.laafi.classification': 'DIFFUSION_RESTREINTE',
      'bf.laafi.instruction': true,
    };
    const inverse = Object.fromEntries(Object.entries(contenu).reverse());
    const e1 = await empreinteInstruction(contenu);
    expect(e1).toMatch(/^[0-9a-f]{64}$/);
    expect(await empreinteInstruction(inverse)).toBe(e1);
    expect(e1).toBe(await sha256Hex(jsonCanonique(contenu)));
  });

  it('exclut les relations ajoutées par le SDK, mais détecte toute modification du texte', async () => {
    const contenu = { msgtype: 'm.text', body: 'Instruction n° 12', 'bf.laafi.instruction': true };
    const reference = await empreinteInstruction(contenu);
    expect(await empreinteInstruction({ ...contenu, 'm.relates_to': { rel_type: 'm.thread', event_id: '$x' } })).toBe(
      reference,
    );
    expect(await empreinteInstruction({ ...contenu, body: 'Instruction n° 13' })).not.toBe(reference);
  });
});
