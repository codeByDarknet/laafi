/**
 * Révocation : détection et effacement local (contrat §5, épreuve « Révocation »).
 *
 * Côté serveur, la révocation (console d'administration) désactive le compte Keycloak et
 * SUPPRIME tous les appareils Synapse de l'agent : ses jetons d'accès deviennent invalides et
 * il quitte tous les salons, ce qui force les autres membres à créer une NOUVELLE session
 * Megolm à laquelle il n'aura jamais accès (rotation des clés).
 *
 * Côté client, il reste deux choses à faire, codées ici sans dépendance à Angular pour être
 * testées unitairement (revocation.spec.ts) :
 *  1. reconnaître qu'une erreur du serveur signifie « vous êtes révoqué » ;
 *  2. effacer TOUT ce que l'appareil sait : clés Olm/Megolm (IndexedDB de la crypto Rust),
 *     cache de synchronisation, jeton d'accès, préférences, caches du service worker.
 */

/** Forme minimale d'une erreur Matrix (MatrixError de matrix-js-sdk). */
export interface ErreurMatrixLike {
  errcode?: string;
  httpStatus?: number;
  data?: { errcode?: string; soft_logout?: boolean };
}

export type MotifRevocation = 'jeton-invalide' | 'compte-desactive' | 'deconnexion-distante' | 'urgence';

/**
 * Codes d'erreur Matrix qui signifient que cet appareil n'a plus le droit d'accéder au compte :
 *  - M_UNKNOWN_TOKEN : jeton inconnu → appareil supprimé (révocation, perte de téléphone,
 *    bouton d'urgence) ; s'il porte `soft_logout: true`, c'est une déconnexion « douce » :
 *    on efface quand même, car un agent révoqué ne doit garder aucune donnée ;
 *  - M_USER_DEACTIVATED : compte désactivé par l'administration.
 */
export function motifDeRevocation(err: unknown): MotifRevocation | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as ErreurMatrixLike;
  const code = e.errcode ?? e.data?.errcode;
  if (code === 'M_USER_DEACTIVATED') return 'compte-desactive';
  if (code === 'M_UNKNOWN_TOKEN') return e.data?.soft_logout ? 'deconnexion-distante' : 'jeton-invalide';
  return null;
}

/** Dépendances de l'effacement : injectées pour pouvoir tester sans navigateur réel. */
export interface EnvironnementEffacement {
  /** Arrête la synchro et vide les stores du SDK (dont la base crypto Rust). */
  arreterClientMatrix?: () => Promise<void> | void;
  indexedDB?: Pick<IDBFactory, 'deleteDatabase'> & { databases?: () => Promise<IDBDatabaseInfo[]> };
  localStorage?: Pick<Storage, 'clear'>;
  sessionStorage?: Pick<Storage, 'clear'>;
  caches?: Pick<CacheStorage, 'keys' | 'delete'>;
  /** Révoque les URL blob: des pièces jointes déchiffrées encore en mémoire. */
  libererMemoire?: () => void;
}

/** Bases IndexedDB connues (si le navigateur ne sait pas les énumérer). */
export const BASES_CONNUES = [
  'laafi::matrix-sdk-crypto',
  'laafi::matrix-sdk-crypto-meta',
  'matrix-js-sdk:laafi-sync',
];

export interface RapportEffacement {
  basesSupprimees: string[];
  cachesSupprimes: string[];
  erreurs: string[];
}

function supprimerBase(idb: Pick<IDBFactory, 'deleteDatabase'>, nom: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = idb.deleteDatabase(nom);
      // « blocked » : une connexion est encore ouverte ; la suppression aura lieu à sa fermeture.
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Efface toutes les données locales. Chaque étape est isolée : une erreur n'empêche
 * jamais les suivantes (mieux vaut trop effacer que pas assez).
 */
export async function effacerDonneesLocales(env: EnvironnementEffacement): Promise<RapportEffacement> {
  const rapport: RapportEffacement = { basesSupprimees: [], cachesSupprimes: [], erreurs: [] };
  const etape = async (nom: string, action: () => Promise<void> | void) => {
    try {
      await action();
    } catch (e) {
      rapport.erreurs.push(`${nom}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  await etape('client', () => env.arreterClientMatrix?.());
  await etape('memoire', () => env.libererMemoire?.());

  await etape('indexeddb', async () => {
    const idb = env.indexedDB;
    if (!idb) return;
    const noms = new Set(BASES_CONNUES);
    if (typeof idb.databases === 'function') {
      for (const info of await idb.databases()) if (info.name) noms.add(info.name);
    }
    for (const nom of noms) {
      await supprimerBase(idb, nom);
      rapport.basesSupprimees.push(nom);
    }
  });

  await etape('localStorage', () => env.localStorage?.clear());
  await etape('sessionStorage', () => env.sessionStorage?.clear());

  await etape('caches', async () => {
    if (!env.caches) return;
    for (const cle of await env.caches.keys()) {
      await env.caches.delete(cle);
      rapport.cachesSupprimes.push(cle);
    }
  });

  return rapport;
}
