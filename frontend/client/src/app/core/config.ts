/**
 * Configuration du client Laafi.
 *
 * Tout est servi par la MÊME origine (passerelle nginx, contrat §1) : le client n'a donc
 * besoin d'aucune URL codée en dur. Synapse est sous /_matrix, Keycloak sous /auth,
 * le backend sous /api. En développement, `ng serve` relaie ces chemins vers
 * http://localhost:8888 (proxy.conf.json).
 */
export interface LaafiConfig {
  /** URL publique de base (ex. http://localhost:8888). */
  origin: string;
  /** Serveur Matrix (Synapse) : même origine. */
  homeserverUrl: string;
  /** Identifiant du fournisseur SSO déclaré dans Synapse (contrat §2). */
  idpId: string;
  /** Domaine Matrix des identifiants (@prenom.nom:laafi.local). */
  serverName: string;
  keycloak: { url: string; realm: string; clientId: string };
  apiBase: string;
  /** Emplacement du module WebAssembly de la crypto Rust (copié par angular.json). */
  cryptoWasmUrl: string;
}

export function construireConfig(origin: string = window.location.origin): LaafiConfig {
  return {
    origin,
    homeserverUrl: origin,
    idpId: 'oidc-keycloak',
    serverName: 'laafi.local',
    keycloak: { url: `${origin}/auth`, realm: 'laafi', clientId: 'laafi-client' },
    apiBase: `${origin}/api/v1`,
    cryptoWasmUrl: new URL('assets/crypto/matrix_sdk_crypto_wasm_bg.wasm', document.baseURI).toString(),
  };
}

export const CONFIG: LaafiConfig = construireConfig();
