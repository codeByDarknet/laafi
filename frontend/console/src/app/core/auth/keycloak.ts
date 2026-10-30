import { InjectionToken } from '@angular/core';
import Keycloak from 'keycloak-js';

/**
 * Instance keycloak-js partagée. Injectée via un jeton pour pouvoir la remplacer par un faux
 * objet dans les tests unitaires (aucun appel réseau dans les tests).
 */
export const KEYCLOAK = new InjectionToken<Keycloak>('KEYCLOAK');

/**
 * Authentification de la console (contrat §3) :
 *  - client public `laafi-console`, flux « Authorization Code » + PKCE S256 : aucun secret n'est
 *    stocké dans le navigateur ; le code d'autorisation est inutilisable sans le `code_verifier`
 *    généré localement (protège contre l'interception du code) ;
 *  - `login-required` : sans session Keycloak valide, l'utilisateur est redirigé vers la page de
 *    connexion du realm `laafi`, qui impose mot de passe + code TOTP (second facteur) ;
 *  - Keycloak est servi par la même origine (passerelle nginx, chemin /auth) : pas de CORS ni de
 *    service tiers.
 *  - Les jetons restent en mémoire (pas de localStorage) : un onglet fermé = session locale perdue.
 */
export async function initialiserKeycloak(): Promise<Keycloak> {
  const keycloak = new Keycloak({
    url: `${window.location.origin}/auth`,
    realm: 'laafi',
    clientId: 'laafi-console',
  });

  await keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    // Pas d'iframe de surveillance de session (cookies tiers bloqués par les navigateurs récents) :
    // la validité est contrôlée à chaque appel API par le rafraîchissement du jeton.
    checkLoginIframe: false,
    // Retour sur l'URL demandée (la route Angular est préservée) — couverte par la redirect URI
    // autorisée `${PUBLIC_URL}/console/*`.
    redirectUri: window.location.href,
    // Réponse du code d'autorisation dans le fragment (#) : il n'apparaît pas dans les journaux serveur.
    responseMode: 'fragment',
  });

  // Rafraîchissement automatique : à l'expiration du jeton d'accès, on en redemande un avec le
  // jeton de rafraîchissement. Si la session Keycloak a été fermée (révocation), on revient au login.
  keycloak.onTokenExpired = () => {
    keycloak.updateToken(30).catch(() => keycloak.login());
  };

  return keycloak;
}
