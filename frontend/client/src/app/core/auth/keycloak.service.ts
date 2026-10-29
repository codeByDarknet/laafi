import { Injectable, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { CONFIG } from '../config';

/**
 * Jeton Keycloak pour le backend Laafi (/api).
 *
 * Deux jetons distincts coexistent, chacun pour son serveur :
 *  - le jeton d'accès MATRIX (session d'appareil Synapse) pour /_matrix ;
 *  - un JWT KEYCLOAK (client public `laafi-client`) pour /api : annuaire, politiques,
 *    accusés probants, bouton d'urgence. Le backend vérifie sa signature et `azp`.
 *
 * Après le SSO Matrix, le navigateur possède déjà une session Keycloak (cookie) : un
 * « check-sso » silencieux (iframe sur silent-check-sso.html, même origine) obtient le JWT
 * sans redemander le mot de passe ni le code TOTP. Flux « authorization code » + PKCE S256 :
 * aucun secret n'est stocké dans le client. Le JWT reste en mémoire (jamais en localStorage).
 */
@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private kc: Keycloak | null = null;
  private initialisation: Promise<boolean> | null = null;

  /** Vrai quand un JWT valide est disponible pour /api. */
  readonly authentifie = signal(false);

  initialiser(): Promise<boolean> {
    if (!this.initialisation) {
      this.kc = new Keycloak({
        url: CONFIG.keycloak.url,
        realm: CONFIG.keycloak.realm,
        clientId: CONFIG.keycloak.clientId,
      });
      this.kc.onTokenExpired = () => void this.rafraichir();
      this.kc.onAuthLogout = () => this.authentifie.set(false);
      this.initialisation = this.kc
        .init({
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: `${CONFIG.origin}/silent-check-sso.html`,
          pkceMethod: 'S256',
          checkLoginIframe: false,
          enableLogging: false,
        })
        .then((ok) => {
          this.authentifie.set(ok);
          return ok;
        })
        .catch(() => {
          // Keycloak injoignable (réseau faible) : la messagerie Matrix fonctionne quand même,
          // seules les fonctions /api (annuaire, accusés…) seront indisponibles.
          this.initialisation = null;
          this.authentifie.set(false);
          return false;
        });
    }
    return this.initialisation;
  }

  /** JWT à jour (rafraîchi s'il expire dans moins de 30 s), ou null. */
  async jeton(): Promise<string | null> {
    const ok = await this.initialiser();
    if (!ok || !this.kc) return null;
    await this.rafraichir();
    return this.kc.token ?? null;
  }

  /** Reconnexion interactive à Keycloak (si la session administrative a expiré). */
  seConnecter(): void {
    void this.kc?.login({ redirectUri: window.location.href });
  }

  /** Oublie le JWT en mémoire (révocation, effacement). */
  oublier(): void {
    this.kc?.clearToken();
    this.authentifie.set(false);
  }

  private async rafraichir(): Promise<void> {
    if (!this.kc) return;
    try {
      await this.kc.updateToken(30);
    } catch {
      this.authentifie.set(false);
    }
  }
}
