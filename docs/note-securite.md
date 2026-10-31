# Laafi — Note de sécurité

**Principe :** le contenu des messages et des fichiers est chiffré de bout en bout par **Matrix Olm/Megolm** (vodozemac). Le serveur ne détient aucune clé de déchiffrement. Aucune cryptographie n'a été développée par l'équipe. Les seules primitives utilisées hors Matrix (SHA-256, Ed25519 de la bibliothèque standard Java et WebCrypto) servent à l'**intégrité** du journal probant, jamais à la confidentialité.

## 1. Menaces et protections

| Menace | Protections mises en place |
| --- | --- |
| **Vol ou perte du téléphone** | Révocation des appareils depuis la console (suppression de tous les appareils Matrix et des sessions Keycloak). L'application détecte le jeton invalidé et **efface ses données locales** (clés, cache, stockage). La reconnexion exige mot de passe **et** TOTP. Les autres membres renouvellent leur clé de groupe Megolm. |
| **Agent malveillant ou qui quitte l'administration** | Révocation totale : compte Keycloak désactivé, attribut `enrole=false`, compte Matrix désactivé, sortie de tous les salons. Les nouveaux messages sont chiffrés avec une nouvelle session Megolm qu'il ne reçoit pas. Action journalisée avec motif. |
| **Compromission du serveur** | La base Synapse ne contient que des événements `m.room.encrypted` et des fichiers chiffrés (AES-CTR). Les clés privées restent sur les appareils. Fédération désactivée. |
| **Administrateur curieux** | Même accès que ci-dessus : aucun contenu lisible. Le journal d'audit ne contient jamais de contenu. L'API d'administration Synapse n'est pas exposée (403 à la passerelle). Rôles séparés (`admin_ministere` limité à son ministère). |
| **Interception réseau** | Le contenu circule chiffré de bout en bout. En production, TLS sur la passerelle protège aussi jetons et métadonnées. Un seul port exposé. |
| **Intrus non enrôlé** | Inscription Matrix désactivée ; connexion uniquement par SSO Keycloak ; Synapse exige le claim `laafi_enrole = "true"`. Inscription libre désactivée dans Keycloak. Salons sur invitation (`join_rule: invite`, invités interdits). |
| **Hameçonnage** | Second facteur TOTP obligatoire pour tous ; un mot de passe volé ne suffit pas. Connexion uniquement sur le domaine de l'État. |
| **Capture d'écran, fuite par copie** | Niveau *Confidentiel* : copie et transfert interdits, filigrane nominatif (nom, matricule, date), flou quand la fenêtre perd le focus, expiration automatique. |
| **Arrivée tardive dans un salon** | `history_visibility: joined` : un nouveau membre ne voit pas l'historique antérieur à son arrivée. |

## 2. Métadonnées visibles par le serveur

Le serveur **ne lit pas** le texte, les fichiers, les messages vocaux, la classification, l'expiration ni le marqueur d'instruction : ces champs sont *dans* le contenu chiffré. Il voit en revanche :

| Donnée | Visible | Détail |
| --- | --- | --- |
| Appartenance aux salons | oui | qui est membre de quel salon, qui a invité qui, dates d'entrée et de sortie |
| Expéditeur et horodatage | oui | chaque événement porte son auteur, son salon et sa date |
| Taille des messages et fichiers | oui | taille approximative du chiffré, type MIME déclaré des médias |
| Adresses IP et navigateur | oui | conservées 1 jour (`user_ips_max_age: 1d`) |
| Appareils | oui | identifiants, noms d'appareil, clés publiques d'identité, dernière activité |
| Distribution des clés | partiel | le routage des messages Olm entre appareils (qui envoie des clés à qui), pas leur contenu |
| Accusés de lecture | oui (privés) | `m.read.private` : connus du serveur, non diffusés aux autres membres |
| Nom et sujet des salons | oui | ce sont des événements d'état, non chiffrés dans Matrix |
| Registre des canaux et annuaire | oui | backend : nom, ministère, fonction (nécessaire au service) |
| Accusés probants | oui | identifiants de salon et de message, empreinte SHA-256, heure |

**Mesures de réduction (configuration Synapse) :** présence désactivée (`presence.enabled: false`) ; pas d'indicateur de frappe par défaut ; accusés de lecture privés ; annuaire Matrix limité aux personnes partageant un salon (`user_directory.search_all_users: false`) ; profils visibles seulement entre membres d'un même salon et authentifiés (`limit_profile_requests_to_users_who_share_rooms`, `require_auth_for_profile_requests`) ; pas de profil joint aux invitations (`include_profile_data_on_invite: false`) ; IP conservées 1 jour ; contenu des messages supprimés purgé après 1 jour (`redaction_retention_period: 1d`) ; politique de rétention des messages (365 jours maximum par défaut) ; journaux limités au niveau `WARNING` ; pas d'annuaire public de salons ; fédération coupée ; aucune télémétrie.

## 3. Limites connues

1. **Captures d'écran.** Un navigateur ne permet pas de les bloquer, ni la photo de l'écran. Filigrane et flou sont **dissuasifs** et rendent la fuite **traçable**, sans l'empêcher.
2. **Confiance dans l'administrateur Keycloak.** Il peut réinitialiser le mot de passe et le TOTP d'un agent, puis se connecter en son nom sur un **nouvel appareil** et lire les messages **futurs** (pas l'historique). Contre-mesures : journalisation, séparation des rôles, vérification des appareils (signature croisée Matrix) à généraliser.
3. **Serveur compromis activement.** Un attaquant qui contrôle Synapse ne lit rien, mais pourrait tenter d'ajouter un faux appareil à un compte. Seule la vérification des appareils entre agents le détecte ; elle n'est pas encore imposée.
4. **Historique sur nouvel appareil.** Un nouvel appareil ne déchiffre pas les anciens messages. C'est voulu (sécurité), mais cela gêne l'agent qui change de téléphone.
5. **Métadonnées résiduelles.** Le graphe « qui parle à qui et quand » reste connu du serveur (tableau ci-dessus). Les réduire davantage exigerait des techniques hors périmètre (mixage, remplissage de trafic).
6. **La révocation n'efface pas le passé.** Ce qui a déjà été lu, copié ou photographié reste hors de portée. Un appareil volé **resté hors ligne** conserve son cache local jusqu'à sa prochaine connexion, où il est effacé.
7. **Jetons de l'API métier.** Après révocation, un jeton d'accès déjà émis pour `/api` reste valable jusqu'à son expiration (durée courte). Matrix, lui, est coupé immédiatement.
8. **Empreinte des accusés probants.** L'empreinte SHA-256 d'un message très court et prévisible pourrait être devinée par essais. L'accusé prouve la réception déclarée par le client authentifié, pas la compréhension.
9. **TOTP plutôt que clé matérielle.** Le TOTP ne résiste pas à un hameçonnage en temps réel. Une clé FIDO2/WebAuthn (gérée par Keycloak) serait plus robuste en production.
10. **Démonstration en HTTP sur `localhost`.** Production : TLS obligatoire, secrets générés (`./scripts/install.sh`), sauvegardes chiffrées, durcissement de l'hôte.
