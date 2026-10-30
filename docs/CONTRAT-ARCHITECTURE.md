# Laafi — Contrat d'architecture (source de vérité interne)

> « Laafi » (mooré : la paix, la santé, « tout va bien »). Messagerie souveraine de l'administration burkinabè.
> Ce fichier fixe les noms, ports, URLs et API partagés entre toutes les briques. **Toute brique doit s'y conformer.**
> Si un changement est nécessaire, le documenter ici.

## 1. Vue d'ensemble

```
Navigateur ──► http://localhost:8888  (passerelle nginx, SEUL port exposé)
                 /                → client     (Angular, messagerie agents)
                 /console/        → console    (Angular, administration DGTD/ministères)
                 /api/            → backend    (Spring Boot, port interne 8090)
                 /_matrix/        → synapse    (port interne 8008)
                 /_synapse/client/→ synapse
                 /_synapse/admin/ → 403 depuis l'extérieur (réservé au backend en interne)
                 /auth/           → keycloak   (port interne 8080, KC_HTTP_RELATIVE_PATH=/auth)
postgres (interne uniquement) : bases `synapse`, `keycloak`, `laafi`
```

- Une seule commande : `docker compose up -d` à la racine du dépôt (valeurs par défaut de démo) ; `./scripts/install.sh` génère un `.env` avec des secrets aléatoires puis lance la stack.
- Variable `PUBLIC_URL` (défaut `http://localhost:8888`).
- Aucun service tiers, aucun CDN, aucune police externe : tout est servi localement (polices auto-hébergées dans les builds Angular).
- Images Docker épinglées à une version précise.

## 2. Matrix / Synapse

- `server_name` : `laafi.local` → identifiants `@prenom.nom:laafi.local`.
- `public_baseurl` : `${PUBLIC_URL}/`.
- Fédération **désactivée** (pas de listener federation, `federation_domain_whitelist: []`).
- `enable_registration: false`. Les utilisateurs se connectent **uniquement** par SSO OIDC (Keycloak), provider id `keycloak` (idp_id Synapse = `oidc-keycloak`).
  `user_mapping_provider.config.localpart_template: "{{ user.preferred_username }}"`, `display_name_template: "{{ user.given_name }} {{ user.family_name }}"`.
  `attribute_requirements` : le claim `laafi_enrole` doit valoir `"true"` (mappé depuis l'attribut Keycloak `enrole`).
- Problème d'issuer : le navigateur voit Keycloak via `${PUBLIC_URL}/auth`, les conteneurs via `http://keycloak:8080/auth`.
  Keycloak : `KC_HOSTNAME=${PUBLIC_URL}/auth`, `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`.
  Synapse : `discover: false`, `authorization_endpoint` public, `token_endpoint`/`userinfo_endpoint`/`jwks_uri` internes, `issuer` public.
- Chiffrement imposé : `encryption_enabled_by_default_for_room_type: all`.
- Minimisation des métadonnées (à documenter dans la note de sécurité) : `presence.enabled: false`, `user_directory.search_all_users: false`,
  `limit_profile_requests_to_users_who_share_rooms: true`, `require_auth_for_profile_requests: true`, `include_profile_data_on_invite: false`,
  `user_ips_max_age: 1d`, `redaction_retention_period: 1d`, `retention` activée (max 365j par défaut), logs niveau WARNING, `allow_public_rooms_*: false`.
- Compte de service admin Synapse : `@laafi-service:laafi.local`, créé par un conteneur one-shot `synapse-bootstrap` (`register_new_matrix_user --admin` avec `registration_shared_secret`). Mot de passe dans `SYNAPSE_SERVICE_PASSWORD`. Le backend s'y connecte par `m.login.password` au démarrage (avec retry) et utilise l'Admin API en interne (`http://synapse:8008`).

## 3. Keycloak

- Realm `laafi`. Image `quay.io/keycloak/keycloak` épinglée. Import au démarrage : `infra/keycloak/realm-laafi.json`.
- Inscription libre désactivée. **OTP (TOTP) obligatoire pour tout le monde** (flux browser : OTP requis, pas conditionnel ; politique TOTP SHA1 6 chiffres 30s).
- Rôles realm : `agent`, `chef_service`, `admin_ministere`, `super_admin`.
- Attributs utilisateur : `ministere` (code, ex. `MTDPCE`), `direction`, `fonction`, `matricule`, `enrole` (`"true"`).
  Mappers de protocole : `ministere`, `fonction`, `direction`, `matricule`, `laafi_enrole` (depuis `enrole`), rôles realm dans `realm_access.roles`.
- Clients :
  - `synapse` : confidentiel, secret `KEYCLOAK_SYNAPSE_SECRET` (défaut `synapse-dev-secret`), redirect `${PUBLIC_URL}/_synapse/client/oidc/callback`.
  - `laafi-console` : public, PKCE S256, redirect `${PUBLIC_URL}/console/*`, web origin `${PUBLIC_URL}`.
  - `laafi-client` : public, PKCE S256, redirect `${PUBLIC_URL}/*` (utilisé par le client pour appeler `/api` avec un JWT : annuaire, accusés, urgence).
  - `laafi-backend` : confidentiel, service account avec rôles `realm-management` : `manage-users`, `view-users`, `query-users`. Secret `KEYCLOAK_BACKEND_SECRET` (défaut `backend-dev-secret`).
- Comptes de démonstration **fictifs** (mot de passe `Laafi2026!`, TOTP pré-enregistré avec le secret de démo base32 `JBSWY3DPEHPK3PXP`, label « Laafi démo ») :

| username          | Prénom Nom       | Rôles                 | Ministère | Fonction                           |
| ----------------- | ----------------- | ---------------------- | ---------- | ---------------------------------- |
| `super.admin`   | Admin DGTD        | super_admin, agent     | MTDPCE     | Administrateur plateforme          |
| `admin.sante`   | Rasmata Compaoré | admin_ministere, agent | MSHP       | Administratrice ministère         |
| `awa.sawadogo`  | Awa Sawadogo      | chef_service, agent    | MSHP       | Directrice des ressources humaines |
| `issa.kabore`   | Issa Kaboré      | agent                  | MSHP       | Médecin-chef de district          |
| `mariam.traore` | Mariam Traoré    | agent                  | MTDPCE     | Chargée d'études                 |
| `paul.zongo`    | Paul Zongo        | agent                  | MEF        | Contrôleur financier              |

  Codes ministères (référentiel `infra/referentiel/ministeres.json`, servi par le backend) : `MTDPCE`, `MSHP` (Santé), `MEF` (Économie et Finances), `MENAPLN` (Éducation), `MATDS` (Administration territoriale), `MSECU` (Sécurité), `MAEC` (Affaires étrangères). Noms complets fictifs/plausibles.
  Un compte `intrus` n'existe PAS (sert à l'épreuve « Intrus »).

## 4. Backend Spring Boot (`backend/`)

- Java 21, Spring Boot 3.5.x (ou dernière stable), Maven, package `bf.gov.laafi`. Port 8090. Base PostgreSQL `laafi` (Flyway).
- Resource server JWT : `jwk-set-uri` interne (`http://keycloak:8080/auth/realms/laafi/protocol/openid-connect/certs`), issuer accepté `${PUBLIC_URL}/auth/realms/laafi`. Rôles depuis `realm_access.roles` → `ROLE_<ROLE>` en majuscules.
- Clients sortants : Keycloak Admin REST (client credentials `laafi-backend`), Synapse Admin API (token du compte de service).
- Erreurs : JSON `{ "code": "...", "message": "..." }` en français.

### API REST `/api/v1`

| Méthode | Chemin                                      | Rôle                                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET      | `/me`                                     | agent                                                   | profil courant (username, matrixId, nom, ministère, fonction, rôles)                                                                                                                                                                                                                                                                                                                                                   |
| GET      | `/ministeres`                             | authentifié                                            | référentiel                                                                                                                                                                                                                                                                                                                                                                                                            |
| GET      | `/annuaire?q=&ministere=&page=`           | agent                                                   | annuaire officiel (agents actifs : matrixId, nom, ministère, direction, fonction)                                                                                                                                                                                                                                                                                                                                       |
| GET      | `/agents?q=&ministere=&statut=`           | admin_ministere, super_admin                            | liste admin (statut `ACTIF`/`REVOQUE`/`APPAREILS_REVOQUES`)                                                                                                                                                                                                                                                                                                                                                        |
| POST     | `/agents`                                 | admin_ministere (son ministère seulement), super_admin | **enrôlement** : crée l'utilisateur Keycloak (attributs, rôles, `enrole=true`, mot de passe temporaire, actions requises `CONFIGURE_TOTP` + `UPDATE_PASSWORD`) puis pré-crée l'utilisateur Synapse (Admin API v2 `PUT /_synapse/admin/v2/users/{mxid}` avec `external_ids:[{auth_provider:"oidc-keycloak", external_id:<sub keycloak>}]`). Renvoie `{ username, matrixId, motDePasseTemporaire }` |
| GET      | `/agents/{username}`                      | admin                                                   | détail + appareils Synapse (`GET /_synapse/admin/v2/users/{mxid}/devices`)                                                                                                                                                                                                                                                                                                                                            |
| POST     | `/agents/{username}/revocation`           | admin (scope ministère)                                | **révocation totale** `{motif}` : Keycloak `enabled=false` + logout de toutes les sessions + `enrole=false` ; Synapse `POST /_synapse/admin/v1/deactivate/{mxid}` `{erase:false}` (supprime appareils et tokens, quitte tous les salons → rotation Megolm côté clients). Journalisé.                                                                                                                |
| POST     | `/agents/{username}/appareils/revocation` | admin                                                   | **perte de téléphone** : supprime tous les appareils Synapse (`POST /_synapse/admin/v2/users/{mxid}/delete_devices`) + logout Keycloak ; le compte reste actif, reconnexion avec 2FA obligatoire.                                                                                                                                                                                                              |
| POST     | `/agents/{username}/reactivation`         | super_admin                                             | réactive (Keycloak enabled, Synapse `deactivated:false`)                                                                                                                                                                                                                                                                                                                                                              |
| GET      | `/politiques`                             | authentifié                                            | politiques de classification (voir §6)                                                                                                                                                                                                                                                                                                                                                                                  |
| PUT      | `/politiques/{niveau}`                    | super_admin                                             | modifie une politique                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET/POST | `/canaux`                                 | GET agent / POST chef_service+                          | registre des canaux institutionnels `{roomId, nom, ministere, description, classification}` (le salon Matrix est créé par le client ; le backend n'enregistre que les métadonnées)                                                                                                                                                                                                                                 |
| POST     | `/accuses`                                | agent                                                   | **accusé de lecture probant** `{roomId, eventId, empreinte}` (empreinte = SHA-256 hex du contenu déchiffré canonique, calculée par le client via WebCrypto) → enregistré avec horodatage serveur, chaîné (hash de l'entrée précédente) et signé (Ed25519 via JCA standard, clé serveur persistée). Renvoie la preuve.                                                                              |
| GET      | `/accuses?eventId=`                       | agent (membre émetteur)                                | liste des accusés d'une instruction                                                                                                                                                                                                                                                                                                                                                                                     |
| GET      | `/accuses/{id}/preuve`                    | agent                                                   | preuve JSON vérifiable (entrée, hash précédent, signature, clé publique)                                                                                                                                                                                                                                                                                                                                            |
| GET      | `/journal/verification`                   | admin                                                   | vérifie l'intégrité de toute la chaîne                                                                                                                                                                                                                                                                                                                                                                               |
| GET      | `/audit?page=`                            | admin                                                   | journal d'audit administratif (enrôlements, révocations, urgences) — **jamais de contenu**                                                                                                                                                                                                                                                                                                                      |
| POST     | `/me/urgence`                             | agent                                                   | **bouton d'urgence** : supprime tous les appareils Synapse de l'agent + logout Keycloak ; journalisé                                                                                                                                                                                                                                                                                                              |
| GET      | `/sante`                                  | public                                                  | healthcheck                                                                                                                                                                                                                                                                                                                                                                                                              |

Note : les primitives cryptographiques du backend (SHA-256, Ed25519) proviennent de la JCA standard Java et servent uniquement à l'**intégrité du journal probant**, jamais à la confidentialité des messages (assurée exclusivement par Olm/Megolm via matrix-js-sdk / vodozemac).

## 5. Client Angular (`frontend/client/`) — messagerie des agents

- Angular 21 (standalone, signals), `matrix-js-sdk` avec **crypto Rust** (`initRustCrypto`, stockage IndexedDB). Aucune crypto maison.
- Connexion : bouton « Se connecter avec mon compte agent » → `GET /_matrix/client/v3/login/sso/redirect/oidc-keycloak?redirectUrl=${PUBLIC_URL}/` → retour avec `loginToken` → `m.login.token`. Pour appeler `/api`, le client obtient aussi un JWT via `keycloak-js` (client `laafi-client`, session SSO Keycloak déjà ouverte → pas de 2e saisie).
- Salons : toujours chiffrés (`m.room.encryption` `m.megolm.v1.aes-sha2` dans `initial_state`), `history_visibility: joined`, `join_rule: invite`, `guest_access: forbidden`. Discussions directes, groupes, canaux institutionnels.
- Fichiers/images/vocaux : pièces jointes chiffrées (API d'upload chiffré de matrix-js-sdk / `encryptAttachment` de `matrix-encrypt-attachment`, bibliothèque open source éprouvée).
- Accusés de lecture : `m.read.private` par défaut ; pas d'indicateur de frappe par défaut (métadonnées).
- Détection de révocation : sur `Session.logged_out` / `M_UNKNOWN_TOKEN` / soft-logout → **effacement local** (IndexedDB crypto, stores, localStorage) et écran « Accès révoqué ».

### Champs personnalisés (DANS le contenu chiffré `m.room.message`)

- `bf.laafi.classification` : `NORMAL` | `DIFFUSION_RESTREINTE` | `CONFIDENTIEL`
- `bf.laafi.expire_at` : timestamp ms (expiration auto ; le client masque puis l'émetteur rédige l'événement)
- `bf.laafi.instruction` : `true` → instruction de service nécessitant un accusé probant
- Messages vocaux : `msgtype: m.audio` + `org.matrix.msc3245.voice: {}`

## 6. Politiques de classification (défauts)

| niveau                   | transfert                       | copie | expiration défaut | filigrane                    | flou hors focus |
| ------------------------ | ------------------------------- | ----- | ------------------ | ---------------------------- | --------------- |
| `NORMAL`               | oui                             | oui   | aucune             | non                          | non             |
| `DIFFUSION_RESTREINTE` | interne au ministère seulement | oui   | 30 jours           | oui                          | non             |
| `CONFIDENTIEL`         | non                             | non   | 7 jours            | oui (nom + matricule + date) | oui             |

Le blocage des captures d'écran est impossible à garantir sur le web : on applique filigrane nominatif + flou hors focus + interdiction copie/transfert (dissuasion + traçabilité) — à documenter honnêtement comme limite.

## 7. Console Angular (`frontend/console/`)

- Angular 21, base href `/console/`, `keycloak-js` (client `laafi-console`, PKCE). Accès : `admin_ministere`, `super_admin`.
- Écrans : tableau de bord, agents (liste/filtre, enrôlement, fiche, appareils, révocation, révocation appareils, réactivation), canaux institutionnels, politiques de classification, journal probant (consultation + vérification d'intégrité), audit.

## 8. Design system partagé (`frontend/shared/styles/`)

- `_tokens.scss` (variables CSS custom properties + mixins), `_base.scss`, `_components.scss`. Importé par les deux apps via `stylePreprocessorOptions.includePaths: ["../shared/styles"]`.
- Identité : sobre, institutionnelle, burkinabè (vert/rouge/or du drapeau utilisés avec retenue), clair + sombre, accessible (contraste AA), mobile d'abord.
- Polices auto-hébergées dans `frontend/shared/fonts/` (licence OFL), copiées dans les assets des apps.
- i18n : français (défaut), mooré (`mos`), dioula (`dyu`) via fichiers JSON `assets/i18n/{fr,mos,dyu}.json` (bibliothèque `@jsverse/transloco` ou `ngx-translate`, MIT).

## 9. Dépôt

- Licence du code Laafi : **EUPL-1.2** (licence conçue pour les administrations publiques, compatible AGPL/GPL).
- Niveau d'engagement déclaré : **Étendre et adapter** (Synapse, Keycloak, matrix-js-sdk) + création des applications client/console.
- Ne JAMAIS committer de secrets réels ; uniquement des valeurs de démo marquées comme telles.
