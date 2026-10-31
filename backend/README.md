# Laafi — backend console DGTD

API Spring Boot 3.5 (Java 21) d'administration de la messagerie Laafi : enrôlement et révocation
des agents (Keycloak + Synapse), politiques de classification, registre des canaux institutionnels,
journal d'audit (sans contenu de message) et journal probant des accusés de lecture
(chaîne SHA-256 signée Ed25519). Contrat : `docs/CONTRAT-ARCHITECTURE.md` §4.

## Lancer

```bash
# Image (port 8090, utilisateur non-root)
docker build -t laafi-backend:dev .
docker run -p 4301:8090 -v laafi-cles:/var/lib/laafi/cles \
  -e DB_HOST=... -e DB_PASSWORD=... -e KEYCLOAK_BACKEND_SECRET=... laafi-backend:dev

# Ou en local
mvn -B package && java -jar target/laafi-backend.jar --server.port=4301
```

Variables principales (valeurs par défaut de dev dans `application.yml`) :

| Variable | Rôle |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL (schéma géré par Flyway) |
| `PUBLIC_URL` | URL publique ; l'émetteur JWT attendu est `PUBLIC_URL/auth/realms/<realm>` |
| `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ISSUER` | Keycloak interne (JWKS + API Admin) |
| `KEYCLOAK_BACKEND_CLIENT_ID`, `KEYCLOAK_BACKEND_SECRET` | client_credentials `laafi-backend` |
| `SYNAPSE_URL`, `SYNAPSE_SERVER_NAME`, `SYNAPSE_SERVICE_USER`, `SYNAPSE_SERVICE_PASSWORD`, `SYNAPSE_IDP_ID` | API Admin Synapse |
| `LAAFI_CLES_DIR` | Répertoire de la clé Ed25519 du journal (**volume persistant**) |
| `LAAFI_CLIENTS_AUTORISES` | Valeurs `azp` acceptées (`laafi-console,laafi-client`) |

La clé de signature est volontairement stockée hors de la base : une copie de la base seule ne
permet pas de forger des entrées. Perdre le volume = nouvelle clé générée, et la vérification
de chaîne échoue sur les entrées anciennes : sauvegarder ce volume.

## Tests

```bash
mvn -q verify   # 49 tests : JUnit 5, Mockito, MockMvc, WireMock (Keycloak/Synapse), H2
```

## Structure (`src/main/java/bf/gov/laafi`)

- `securite` — resource server JWT, rôles, périmètre ministériel
- `keycloak`, `synapse` — clients RestClient des API Admin
- `agents`, `moi` — annuaire, enrôlement, révocations, urgence, profil
- `accuses` — journal probant (`/accuses`, `/accuses/{id}/preuve`, `/journal/verification`)
- `audit`, `politiques`, `canaux`, `referentiel` — audit, classification, canaux, ministères
- `erreur` — erreurs JSON en français `{code, message, ...}`
- `src/main/resources/db/migration` — Flyway (`commun` + triggers ajout-seul PostgreSQL)
