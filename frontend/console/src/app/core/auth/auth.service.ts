import { Injectable, computed, inject, signal } from '@angular/core';

import { Role } from '../api/models';
import { KEYCLOAK } from './keycloak';

/** Rôles autorisés à entrer dans la console (contrat §7). */
export const ROLES_ADMIN: readonly Role[] = ['admin_ministere', 'super_admin'];

/** Contenu utile du jeton d'accès (claims ajoutés par les mappers du realm `laafi`). */
interface ClaimsLaafi {
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  ministere?: string;
  fonction?: string;
  direction?: string;
  realm_access?: { roles?: string[] };
}

/** Identité de l'administrateur connecté, lue dans le jeton signé par Keycloak. */
export interface Utilisateur {
  username: string;
  nom: string;
  ministere: string | null;
  fonction: string | null;
  roles: Role[];
}

/**
 * Session de l'administrateur. Les rôles servent ici UNIQUEMENT à adapter l'interface
 * (masquer un bouton, refuser une route) : la véritable autorisation est refaite par le
 * backend sur chaque requête (@PreAuthorize + contrôle du périmètre ministériel).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly keycloak = inject(KEYCLOAK);

  private readonly _utilisateur = signal<Utilisateur | null>(this.lireJeton());
  readonly utilisateur = this._utilisateur.asReadonly();

  readonly roles = computed(() => this._utilisateur()?.roles ?? []);
  readonly estSuperAdmin = computed(() => this.roles().includes('super_admin'));
  readonly estAdmin = computed(() => this.aUnRole(ROLES_ADMIN));
  /** Ministère imposé à un admin_ministere ; null pour le super_admin (périmètre national). */
  readonly ministereImpose = computed(() => (this.estSuperAdmin() ? null : (this._utilisateur()?.ministere ?? null)));

  aUnRole(attendus: readonly Role[]): boolean {
    const roles = this.roles();
    return attendus.some((r) => roles.includes(r));
  }

  /**
   * Renvoie un jeton d'accès valide encore au moins 30 s, en le rafraîchissant si besoin.
   * Appelé par l'intercepteur HTTP avant chaque requête vers /api.
   */
  async jetonValide(): Promise<string | undefined> {
    if (!this.keycloak.authenticated) return undefined;
    try {
      const rafraichi = await this.keycloak.updateToken(30);
      if (rafraichi) this._utilisateur.set(this.lireJeton());
    } catch {
      // Jeton de rafraîchissement expiré ou session fermée côté Keycloak : retour à la connexion.
      await this.keycloak.login();
      return undefined;
    }
    return this.keycloak.token;
  }

  /** Force un rafraîchissement (utilisé après un 401 avant de rejouer la requête une seule fois). */
  async forcerRafraichissement(): Promise<string | undefined> {
    try {
      await this.keycloak.updateToken(-1);
      this._utilisateur.set(this.lireJeton());
      return this.keycloak.token;
    } catch {
      await this.keycloak.login();
      return undefined;
    }
  }

  deconnexion(): Promise<void> {
    // Ferme la session Keycloak (SSO) puis revient sur la console, qui redemandera la connexion.
    return this.keycloak.logout({ redirectUri: `${window.location.origin}/console/` });
  }

  private lireJeton(): Utilisateur | null {
    const claims = this.keycloak.tokenParsed as ClaimsLaafi | undefined;
    if (!claims) return null;
    const connus: Role[] = ['agent', 'chef_service', 'admin_ministere', 'super_admin'];
    const roles = (claims.realm_access?.roles ?? []).filter((r): r is Role => (connus as string[]).includes(r));
    const nom = [claims.given_name, claims.family_name].filter(Boolean).join(' ') || claims.name || '';
    return {
      username: claims.preferred_username ?? '',
      nom: nom || claims.preferred_username || '',
      ministere: claims.ministere ?? null,
      fonction: claims.fonction ?? null,
      roles,
    };
  }
}
