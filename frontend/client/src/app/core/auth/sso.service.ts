import { Injectable } from '@angular/core';
import { createClient } from 'matrix-js-sdk';
import { CONFIG } from '../config';
import { SessionMatrix, ecrireSession } from './session';

/**
 * Authentification Matrix par SSO (contrat §5).
 *
 * Laafi n'a AUCUN mot de passe Matrix : Synapse délègue l'identification à Keycloak (OIDC),
 * qui impose mot de passe + code TOTP (second facteur) et vérifie que l'agent est enrôlé
 * (claim `laafi_enrole`, épreuve « Intrus »). Déroulé :
 *
 *   1. redirection vers  /_matrix/client/v3/login/sso/redirect/oidc-keycloak?redirectUrl=<origine>/
 *   2. Synapse → Keycloak (mot de passe + TOTP) → Synapse vérifie les attributs ;
 *   3. retour vers <origine>/?loginToken=XXXX  (jeton à usage unique, courte durée) ;
 *   4. le client échange ce jeton contre un jeton d'accès : POST /login { type: "m.login.token" }.
 *      Synapse crée alors un NOUVEL APPAREIL (deviceId) pour ce navigateur.
 */
@Injectable({ providedIn: 'root' })
export class SsoService {
  /** URL de départ du SSO. Le retour doit correspondre à `sso.client_whitelist` de Synapse. */
  urlDeConnexion(): string {
    const retour = `${CONFIG.origin}/`;
    return (
      `${CONFIG.homeserverUrl}/_matrix/client/v3/login/sso/redirect/${encodeURIComponent(CONFIG.idpId)}` +
      `?redirectUrl=${encodeURIComponent(retour)}`
    );
  }

  demarrer(): void {
    window.location.assign(this.urlDeConnexion());
  }

  /** Lit le loginToken dans l'URL de retour, puis l'efface de la barre d'adresse et de l'historique. */
  extraireLoginToken(): string | null {
    const url = new URL(window.location.href);
    const jeton = url.searchParams.get('loginToken');
    if (!jeton) return null;
    url.searchParams.delete('loginToken');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return jeton;
  }

  /** Étape 4 : échange du loginToken (usage unique) contre une session d'appareil. */
  async echangerLoginToken(loginToken: string): Promise<SessionMatrix> {
    const anonyme = createClient({ baseUrl: CONFIG.homeserverUrl });
    const reponse = await anonyme.loginRequest({
      type: 'm.login.token',
      token: loginToken,
      initial_device_display_name: nomAppareil(),
    });
    const session: SessionMatrix = {
      userId: reponse.user_id,
      deviceId: reponse.device_id,
      accessToken: reponse.access_token,
      homeserverUrl: CONFIG.homeserverUrl,
    };
    ecrireSession(session);
    return session;
  }
}

/** Nom lisible de l'appareil (visible par l'agent et l'administrateur dans la liste des appareils). */
function nomAppareil(): string {
  const ua = navigator.userAgent;
  const navigateur = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navigateur';
  const systeme = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return `Laafi Web · ${navigateur}${systeme ? ' · ' + systeme : ''}`;
}
