# Technologies tierces et licences

Laafi est publié sous **EUPL-1.2** (fichier [LICENSE](LICENSE)). Il s'appuie exclusivement sur des logiciels open source, tous auto-hébergés. Aucun service tiers (API externe, CDN, police distante, télémétrie) n'est nécessaire au fonctionnement.

Les versions exactes sont épinglées dans les fichiers du dépôt : `docker-compose.yml` (images), `backend/pom.xml` (Java), `frontend/*/package.json` et `package-lock.json` (JavaScript). Les licences ci-dessous ont été vérifiées sur les dépôts officiels et les registres (npm, Maven Central) le 1er novembre 2026.

## 1. Services serveur (images Docker)

| Technologie | Usage dans Laafi | Licence | Projet |
| --- | --- | --- | --- |
| Synapse | Serveur Matrix (relais et stockage des messages chiffrés) | AGPL-3.0-only (Element propose aussi une licence commerciale) | <https://github.com/element-hq/synapse> |
| Keycloak | Fournisseur d'identité OIDC, TOTP, rôles | Apache-2.0 | <https://github.com/keycloak/keycloak> |
| PostgreSQL | Bases `synapse`, `keycloak`, `laafi` | PostgreSQL License (type BSD/MIT) | <https://www.postgresql.org/about/licence/> |
| nginx | Passerelle unique (port 8888) | BSD-2-Clause | <https://nginx.org/LICENSE> |
| Eclipse Temurin (OpenJDK 21) | Environnement d'exécution du backend | GPL-2.0 avec Classpath Exception | <https://adoptium.net/> |

**Note sur l'AGPL.** Synapse est utilisé tel quel, sans modification de son code, en tant que service séparé avec lequel Laafi communique par ses API HTTP. Si Synapse était modifié et exposé à des utilisateurs, ses sources modifiées devraient être publiées. L'EUPL-1.2 est compatible avec l'AGPL-3.0 (annexe de l'EUPL).

## 2. Backend (Java)

| Technologie | Usage | Licence | Projet |
| --- | --- | --- | --- |
| Spring Boot / Spring Framework / Spring Security | Application, API REST, serveur de ressources JWT | Apache-2.0 | <https://github.com/spring-projects/spring-boot> |
| Flyway (édition Community) | Migrations de la base `laafi` | Apache-2.0 | <https://github.com/flyway/flyway> |
| Hibernate ORM (si JPA est utilisé) | Persistance | LGPL-2.1 (versions 6.x) / Apache-2.0 (versions 7.x) | <https://github.com/hibernate/hibernate-orm> |
| PostgreSQL JDBC (pgjdbc) | Pilote de base de données | BSD-2-Clause | <https://github.com/pgjdbc/pgjdbc> |
| JCA (bibliothèque standard Java) | SHA-256 et Ed25519 pour l'intégrité du journal probant uniquement | Incluse dans OpenJDK (GPL-2.0 + Classpath Exception) | <https://openjdk.org/> |
| Apache Maven | Construction | Apache-2.0 | <https://maven.apache.org/> |

## 3. Client et console (JavaScript / TypeScript)

| Technologie | Usage | Licence | Projet |
| --- | --- | --- | --- |
| Angular | Framework des deux applications | MIT | <https://github.com/angular/angular> |
| matrix-js-sdk | SDK client Matrix (synchronisation, salons, envoi) | Apache-2.0 | <https://github.com/matrix-org/matrix-js-sdk> |
| @matrix-org/matrix-sdk-crypto-wasm | Moteur crypto Rust compilé en WebAssembly (Olm/Megolm, vérification d'appareils) | Apache-2.0 | <https://github.com/matrix-org/matrix-sdk-crypto-wasm> |
| vodozemac | Implémentation Rust d'Olm et Megolm (auditée par Least Authority, 2022) | Apache-2.0 | <https://github.com/matrix-org/vodozemac> |
| matrix-encrypt-attachment | Chiffrement des pièces jointes (AES-CTR, format Matrix) | Apache-2.0 | <https://github.com/matrix-org/matrix-encrypt-attachment> |
| keycloak-js | Connexion OIDC (PKCE) au backend | Apache-2.0 | <https://github.com/keycloak/keycloak-js> |
| @jsverse/transloco | Traductions français, mooré, dioula | MIT | <https://github.com/jsverse/transloco> |
| RxJS | Programmation réactive (dépendance d'Angular) | Apache-2.0 | <https://github.com/ReactiveX/rxjs> |
| TypeScript | Langage | Apache-2.0 | <https://github.com/microsoft/TypeScript> |

## 4. Polices de caractères

Les polices sont copiées dans `frontend/shared/fonts/` et servies localement. Elles sont toutes sous **SIL Open Font License 1.1** (<https://openfontlicense.org/>). La liste précise des familles utilisées et leurs fichiers de licence figurent dans ce dossier.

## 5. Outils de déploiement

| Technologie | Usage | Licence | Projet |
| --- | --- | --- | --- |
| Docker Engine (Moby) | Exécution des conteneurs | Apache-2.0 | <https://github.com/moby/moby> |
| Docker Compose | Installation en une commande | Apache-2.0 | <https://github.com/docker/compose> |

## 6. Rappel des protocoles

- **Matrix** (spécification ouverte, Apache-2.0) : <https://spec.matrix.org/>
- **Olm / Megolm** : spécifications publiques, implémentées par vodozemac.
- **OpenID Connect**, **OAuth 2.0 + PKCE** (RFC 7636), **TOTP** (RFC 6238) : standards ouverts.

Les dépendances transitives conservent leur propre licence, consultable dans `node_modules/*/LICENSE` et dans les JAR (`META-INF/LICENSE`).
