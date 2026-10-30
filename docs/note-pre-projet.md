# Laafi — Note de pré-projet

**Équipe :** [Nom de l'équipe] · **Université :** [Établissement] · **Challenge :** la messagerie souveraine de l'administration · **Licence :** EUPL-1.2

## 1. Concept

*Laafi* (« la paix, tout va bien » en mooré) est une messagerie instantanée réservée aux agents publics du Burkina Faso : messages, groupes, fichiers et messages vocaux, **chiffrés de bout en bout**, sur un serveur **installé chez l'État en une commande**. Un agent n'y entre que s'il a été **enrôlé par son ministère**, avec mot de passe et second facteur. Il en sort **immédiatement** s'il quitte son poste ou perd son téléphone. Au-delà de la sécurité, Laafi apporte ce qui manque aux messageries grand public : annuaire officiel, classification des messages, accusé de lecture probant et interface en langues nationales.

## 2. Architecture

| Brique | Rôle |
| --- | --- |
| Passerelle **nginx** (seul port exposé, 8888) | Point d'entrée unique ; bloque l'API d'administration Synapse depuis l'extérieur |
| **Keycloak** (realm `laafi`) | Identité : OIDC, TOTP obligatoire, rôles `agent`, `chef_service`, `admin_ministere`, `super_admin` |
| **Synapse** (Matrix, fédération coupée) | Relais et stockage des messages **déjà chiffrés** ; connexion uniquement par SSO Keycloak |
| **Backend Spring Boot** (Java 21) | Enrôlement, révocation, annuaire, politiques, journal probant, audit |
| **Client Angular** | Messagerie des agents ; chiffrement dans le navigateur (matrix-js-sdk + crypto Rust) |
| **Console Angular** | Administration DGTD et ministères |
| **PostgreSQL** (interne) | Bases `synapse`, `keycloak`, `laafi` |

Le chiffrement et le déchiffrement ont lieu **uniquement sur les appareils**. Le serveur ne détient jamais les clés.

## 3. Protocole retenu : Matrix (Olm / Megolm)

- **Olm** : *Double Ratchet* entre deux appareils (Curve25519, AES-256, HMAC-SHA-256). Sert à transporter les clés de groupe.
- **Megolm** : chiffrement de groupe efficace. Chaque appareil émetteur possède une session ; sa clé est distribuée aux membres par Olm. La session est **renouvelée** dès qu'un membre ou un appareil quitte le salon.
- Implémentation : **vodozemac** (Rust, auditée), utilisée via `matrix-sdk-crypto-wasm`.

| Option | Pourquoi nous ne l'avons pas retenue |
| --- | --- |
| Signal (libsignal) | Excellent protocole, mais serveur pensé pour un service unique et centralisé ; pas d'intégration native OIDC, rôles ni API d'administration ; client web non prévu. |
| MLS (OpenMLS) | Standard récent (RFC 9420) ; écosystème serveur et client web encore peu mature pour un prototype complet et fiable. |
| XMPP (OMEMO) | Support web limité, versions d'OMEMO fragmentées, chiffrement de groupe contraignant. |
| **Matrix** | Serveur auto-hébergeable, SSO OIDC natif, API d'administration (désactivation, appareils), SDK web mûr, groupes et fichiers chiffrés, standard ouvert. |

## 4. Composants open source et licences

Synapse (AGPL-3.0), Keycloak (Apache-2.0), matrix-js-sdk et vodozemac (Apache-2.0), PostgreSQL (PostgreSQL License), nginx (BSD-2-Clause), Spring Boot et Flyway Community (Apache-2.0), Eclipse Temurin (GPL-2.0 + Classpath Exception), Angular et Transloco (MIT), keycloak-js (Apache-2.0), polices SIL OFL 1.1. Détail : `THIRD_PARTY_LICENSES.md`.

## 5. Niveau d'engagement

**Étendre et adapter** : nous configurons et intégrons Synapse, Keycloak et matrix-js-sdk sans toucher au protocole ni à la cryptographie, et nous **créons** deux applications (client, console) et un backend métier.

## 6. Fonctionnalités innovantes

1. **Classification des messages.** Trois niveaux, portés *dans* le contenu chiffré :

   | Niveau | Transfert | Copie | Expiration | Filigrane | Flou hors focus |
   | --- | --- | --- | --- | --- | --- |
   | Normal | oui | oui | aucune | non | non |
   | Diffusion restreinte | interne au ministère | oui | 30 jours | oui | non |
   | Confidentiel | non | non | 7 jours | nom + matricule + date | oui |

2. **Accusé de lecture probant.** Pour une *instruction de service*, le destinataire confirme la lecture. Son client calcule l'empreinte SHA-256 du message déchiffré ; le serveur l'horodate, la **chaîne** à l'entrée précédente et la **signe** (Ed25519). Toute altération du journal est détectable. Le serveur ne reçoit jamais le texte.
3. **Annuaire officiel** par ministère, direction et fonction ; **canaux institutionnels** enregistrés et classifiés.
4. **Deux révocations.** *Totale* (départ, faute) : compte désactivé partout. *Appareils* (perte du téléphone) : tous les appareils supprimés, le compte reste valide après reconnexion avec 2FA.
5. **Bouton d'urgence.** L'agent menacé déconnecte lui-même tous ses appareils ; l'application efface ses données locales.
6. **Langues nationales.** Interface en mooré et dioula ; messages vocaux chiffrés pour les agents plus à l'aise à l'oral.
7. **Faible connexion.** Synchronisation allégée, médias chargés à la demande, messages en attente renvoyés automatiquement.

## 7. Répartition des rôles

| Membre | Responsabilités principales |
| --- | --- |
| [Membre 1] | Infrastructure et sécurité : Docker Compose, Synapse, Keycloak, nginx, note de sécurité |
| [Membre 2] | Backend : enrôlement, révocation, annuaire, journal probant, tests |
| [Membre 3] | Client et console : chiffrement côté client, ergonomie, langues nationales |

Chaque membre sait expliquer l'ensemble des mécanismes de chiffrement et d'authentification.
