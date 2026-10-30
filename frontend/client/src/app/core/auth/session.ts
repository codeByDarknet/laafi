/**
 * Session Matrix persistée localement.
 *
 * Après la connexion SSO, Synapse nous remet un jeton d'accès LIÉ À CET APPAREIL (deviceId).
 * On le garde en localStorage pour survivre au rechargement de la page, comme tous les
 * clients Matrix web. Il ne donne accès qu'à des messages chiffrés : les clés pour les
 * lire sont dans la base IndexedDB de la crypto Rust, propre à cet appareil.
 * Tout est effacé à la révocation (voir security/revocation.ts).
 */
export interface SessionMatrix {
  userId: string;
  deviceId: string;
  accessToken: string;
  homeserverUrl: string;
}

const CLE = 'laafi.session';

export function lireSession(stockage: Storage = localStorage): SessionMatrix | null {
  try {
    const brut = stockage.getItem(CLE);
    if (!brut) return null;
    const s = JSON.parse(brut) as Partial<SessionMatrix>;
    if (s.userId && s.deviceId && s.accessToken && s.homeserverUrl) return s as SessionMatrix;
  } catch {
    /* session illisible : on repart de zéro */
  }
  return null;
}

export function ecrireSession(session: SessionMatrix, stockage: Storage = localStorage): void {
  stockage.setItem(CLE, JSON.stringify(session));
}

export function oublierSession(stockage: Storage = localStorage): void {
  stockage.removeItem(CLE);
}
