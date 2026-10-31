# Laafi — la messagerie souveraine de l'administration burkinabè

> *Laafi* (mooré) : la paix, la santé, « tout va bien ». Prototype du sprint technique pré-hackathon du Hackathon 226 (MTDPCE – DGTD, 2026). Toutes les données et tous les comptes sont **fictifs**.

## 1. Concept

Les agents publics échangent des informations de service sur des messageries grand public dont les serveurs échappent à l'État. Laafi est une messagerie instantanée (messages, groupes, fichiers, vocaux) **chiffrée de bout en bout**, installée **sur une infrastructure maîtrisée** et réservée aux **agents enrôlés** par leur ministère. **Le serveur ne lit rien** : la confidentialité repose uniquement sur Matrix Olm/Megolm (bibliothèque Rust *vodozemac*), sans aucune cryptographie maison. **L'État maîtrise les identités** : enrôlement, second facteur obligatoire, rôles, révocation immédiate.

## 2. Architecture

```
 Navigateur : client des agents / console d'administration
 Chiffrement et déchiffrement ICI (matrix-js-sdk + vodozemac)
        │
        ▼  http://localhost:8888  (seul port exposé)
 ┌──────────────────────── Passerelle nginx ────────────────────────┐
 │ /         → client          /api/            → backend           │
 │ /console/ → console         /auth/           → Keycloak          │
 │ /_matrix/ → Synapse         /_synapse/admin/ → 403 (bloqué)      │
 └──────────────────────────────────────────────────────────────────┘
        │                      │                         │
        ▼                      ▼                         ▼
 ┌─────────────┐  OIDC  ┌─────────────┐   API admin  ┌─────────────┐
 │  Keycloak   │◄───────│   Synapse   │◄─────────────│   Backend   │
 │ OIDC, TOTP, │        │ ne stocke   │              │ enrôlement, │
 │ rôles       │◄───┐   │ que du      │              │ révocation, │
 │             │    │   │ chiffré     │              │ journal     │
 └──────┬──────┘    │   └──────┬──────┘              └──┬───────┬──┘
        │           └──────────┼─────── API admin ──────┼───────┘
        ▼                      ▼                        ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │        PostgreSQL (interne) : keycloak · synapse · laafi         │
 └──────────────────────────────────────────────────────────────────┘
```

**Synapse** (fédération et inscription libre coupées, chiffrement imposé) n'accepte que les agents authentifiés par **Keycloak** (mot de passe + TOTP, rôles `agent`, `chef_service`, `admin_ministere`, `super_admin`). Le **backend Spring Boot** pilote les deux par leurs API d'administration internes : enrôlement, révocation, annuaire, politiques, journal probant, audit sans contenu.

## 3. Technologies et licences

| Composant | Rôle | Licence |
| --- | --- | --- |
| Synapse | Serveur Matrix | AGPL-3.0 |
| matrix-js-sdk, matrix-sdk-crypto-wasm / vodozemac | SDK client, Olm/Megolm | Apache-2.0 |
| Keycloak, keycloak-js | Identité, OIDC, TOTP, rôles | Apache-2.0 |
| PostgreSQL | Bases de données | PostgreSQL License |
| nginx | Passerelle | BSD-2-Clause |
| Spring Boot, Flyway Community | Backend Java 21 | Apache-2.0 |
| Eclipse Temurin | JVM | GPL-2.0 + Classpath Exception |
| Angular, Transloco | Interfaces, traductions | MIT |
| Polices auto-hébergées | Typographie | SIL OFL 1.1 |

Liste complète et liens : [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## 4. Niveau d'engagement open source et licence

**Étendre et adapter** : nous configurons et intégrons Synapse, Keycloak et matrix-js-sdk sans toucher au protocole ni à la cryptographie, et nous **créons** le client des agents, la console d'administration et un backend métier.

Le code Laafi est publié sous **EUPL-1.2** ([LICENSE](LICENSE)) : licence reconnue par l'OSI, conçue pour les administrations publiques, compatible GPL et AGPL. Les composants tiers gardent leur propre licence.

## 5. Installation en une commande

Prérequis : Docker Engine et Docker Compose v2, environ 4 Go de mémoire libre.
```bash
docker compose up -d        # valeurs de démonstration
./scripts/install.sh        # variante : génère un .env avec des secrets aléatoires, puis lance
```

Messagerie : <http://localhost:8888/> · Console : <http://localhost:8888/console/>. Aucun service tiers, CDN ni police externe. Adresse publique modifiable par `PUBLIC_URL`.

**Comptes de démonstration** (fictifs), mot de passe et secret TOTP : **[docs/COMPTES-DEMO.md](docs/COMPTES-DEMO.md)**. Deux agents = deux profils de navigateur.

## 6. Démonstration des épreuves

| Épreuve | Ce que nous montrons |
| --- | --- |
| Le serveur ne lit rien | Mot-témoin introuvable dans les bases, les fichiers et le trafic : seulement du `m.room.encrypted`. |
| Révocation | Révocation depuis la console en pleine conversation : appareils et jetons supprimés, effacement local, nouvelle clé de groupe. |
| Intrus | Compte inconnu, inscription Matrix, contournement du SSO, API d'administration, salon sans invitation : tout est refusé. |
| Innovation | Instruction **Confidentiel** avec accusé de lecture probant, puis vérification du journal. |

Déroulé détaillé : [docs/GUIDE-ENTRETIEN.md](docs/GUIDE-ENTRETIEN.md) · vidéo : [docs/SCENARIO-VIDEO.md](docs/SCENARIO-VIDEO.md).

## 7. Fonctionnalités innovantes

**Classification** Diffusion restreinte / Confidentiel *dans* le contenu chiffré (transfert, copie, expiration, filigrane, flou) · **accusé de lecture probant** horodaté, chaîné et signé · **annuaire officiel** et **canaux institutionnels** · **révocation totale ou des appareils**, **bouton d'urgence** · **mooré, dioula**, vocaux chiffrés · **sobriété réseau**. Voir la [note de pré-projet](docs/note-pre-projet.md) et la [note de sécurité](docs/note-securite.md).

## 8. Limites connues

- **HTTP sur `localhost`** pour la démonstration ; la production exige TLS (le contenu reste chiffré de bout en bout).
- **Captures d'écran** impossibles à bloquer dans un navigateur : filigrane et flou dissuadent sans garantir.
- **Métadonnées** : le serveur voit qui est dans quel salon, quand, et la taille des messages.
- **Administrateur Keycloak** : il peut réinitialiser un compte ; tiers de confiance, actions journalisées.
- **Révocation** : n'efface pas ce qui a déjà été lu ou capturé ; un appareil hors ligne garde son cache jusqu'à sa reconnexion.
- **Traductions** mooré et dioula à faire relire par des locuteurs natifs.
