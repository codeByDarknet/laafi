import { describe, expect, it, vi } from 'vitest';
import { BASES_CONNUES, EnvironnementEffacement, effacerDonneesLocales, motifDeRevocation } from './revocation';

describe('Révocation — détection', () => {
  it('reconnaît un appareil supprimé (M_UNKNOWN_TOKEN)', () => {
    expect(motifDeRevocation({ errcode: 'M_UNKNOWN_TOKEN', httpStatus: 401 })).toBe('jeton-invalide');
    expect(motifDeRevocation({ data: { errcode: 'M_UNKNOWN_TOKEN' } })).toBe('jeton-invalide');
  });

  it('distingue la déconnexion distante « douce » (soft_logout)', () => {
    expect(motifDeRevocation({ errcode: 'M_UNKNOWN_TOKEN', data: { soft_logout: true } })).toBe('deconnexion-distante');
  });

  it('reconnaît un compte désactivé par l\'administration', () => {
    expect(motifDeRevocation({ errcode: 'M_USER_DEACTIVATED', httpStatus: 403 })).toBe('compte-desactive');
  });

  it('ignore les erreurs ordinaires (réseau, limitation, droits)', () => {
    expect(motifDeRevocation(new TypeError('Failed to fetch'))).toBeNull();
    expect(motifDeRevocation({ errcode: 'M_LIMIT_EXCEEDED', httpStatus: 429 })).toBeNull();
    expect(motifDeRevocation({ errcode: 'M_FORBIDDEN', httpStatus: 403 })).toBeNull();
    expect(motifDeRevocation(null)).toBeNull();
    expect(motifDeRevocation('M_UNKNOWN_TOKEN')).toBeNull();
  });
});

/** Faux navigateur : IndexedDB, stockages et caches en mémoire, pour observer l'effacement. */
function fauxNavigateur(options: { echecArret?: boolean } = {}) {
  const bases = new Set(['laafi::matrix-sdk-crypto', 'laafi::matrix-sdk-crypto-meta', 'matrix-js-sdk:laafi-sync', 'autre-base']);
  const local = new Map([['laafi.session', '{"accessToken":"syt_fictif"}'], ['laafi.theme', 'sombre']]);
  const session = new Map([['kc', 'jeton']]);
  const caches = new Set(['ngsw:/:db:control', 'ngsw:/:1:assets:app:cache']);
  const ordre: string[] = [];

  const env: EnvironnementEffacement = {
    arreterClientMatrix: vi.fn(async () => {
      ordre.push('arret');
      if (options.echecArret) throw new Error('client déjà arrêté');
    }),
    libererMemoire: vi.fn(() => void ordre.push('memoire')),
    indexedDB: {
      databases: async () => [...bases].map((name) => ({ name, version: 1 })),
      deleteDatabase: (nom: string) => {
        ordre.push(`idb:${nom}`);
        const req = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          bases.delete(nom);
          req.onsuccess?.call(req, new Event('success'));
        });
        return req;
      },
    },
    localStorage: { clear: () => local.clear() },
    sessionStorage: { clear: () => session.clear() },
    caches: {
      keys: async () => [...caches],
      delete: async (cle: string) => caches.delete(cle),
    },
  };
  return { env, bases, local, session, caches, ordre };
}

describe('Révocation — effacement local complet', () => {
  it('efface les clés de chiffrement, la session, les préférences et les caches', async () => {
    const f = fauxNavigateur();
    const rapport = await effacerDonneesLocales(f.env);

    expect(f.bases.size).toBe(0);
    expect(f.local.size).toBe(0);
    expect(f.session.size).toBe(0);
    expect(f.caches.size).toBe(0);
    expect(rapport.basesSupprimees).toEqual(expect.arrayContaining([...BASES_CONNUES, 'autre-base']));
    expect(rapport.cachesSupprimes).toHaveLength(2);
    expect(rapport.erreurs).toEqual([]);
  });

  it('arrête le client Matrix AVANT de supprimer les bases (plus aucune écriture possible)', async () => {
    const f = fauxNavigateur();
    await effacerDonneesLocales(f.env);
    expect(f.ordre[0]).toBe('arret');
    expect(f.ordre[1]).toBe('memoire');
    expect(f.ordre.findIndex((e) => e.startsWith('idb:'))).toBeGreaterThan(1);
  });

  it("continue l'effacement même si une étape échoue (mieux vaut trop effacer que pas assez)", async () => {
    const f = fauxNavigateur({ echecArret: true });
    const rapport = await effacerDonneesLocales(f.env);
    expect(rapport.erreurs).toHaveLength(1);
    expect(rapport.erreurs[0]).toContain('client');
    expect(f.bases.size).toBe(0);
    expect(f.local.size).toBe(0);
  });

  it("supprime les bases connues même si le navigateur ne sait pas les énumérer", async () => {
    const supprimees: string[] = [];
    const rapport = await effacerDonneesLocales({
      indexedDB: {
        deleteDatabase: (nom: string) => {
          supprimees.push(nom);
          const req = {} as IDBOpenDBRequest;
          queueMicrotask(() => req.onblocked?.call(req, new Event('blocked') as IDBVersionChangeEvent));
          return req;
        },
      },
    });
    expect(supprimees).toEqual(BASES_CONNUES);
    expect(rapport.basesSupprimees).toEqual(BASES_CONNUES);
  });
});
