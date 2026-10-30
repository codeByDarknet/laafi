# Guide de préparation à l'entretien technique (15 minutes)

| Séquence | Durée | Qui |
| --- | --- | --- |
| Présentation du concept et de l'architecture | 3 min | [Membre 1] |
| Trois épreuves tirées au sort | 8 min | membre désigné par le jury |
| Questions sur les choix de sécurité | 4 min | membre désigné par le jury |

**Règle d'or :** le jury désigne qui répond. **Chaque membre** doit savoir faire chaque épreuve et expliquer chaque fonction de la partie 4. Une réponse honnête (« c'est une limite, voici pourquoi ») vaut mieux qu'une réponse inexacte.

---

## 0. Avant l'entretien (checklist)

- [ ] `docker compose up -d` lancé **30 minutes avant** ; `docker compose ps` : tous les services `healthy` / `running`.
- [ ] `curl -s http://localhost:8888/api/v1/sante` répond.
- [ ] Trois profils de navigateur connectés : **A** `awa.sawadogo`, **B** `issa.kabore`, **C** `admin.sante` (console + messagerie). Profil **D** vierge pour l'intrus.
- [ ] Groupe de test « Riposte paludisme – District de Kaya » avec Awa, Issa, Rasmata ; quelques messages échangés.
- [ ] Générateur TOTP prêt (Aegis/FreeOTP ou `oathtool --totp -b JBSWY3DPEHPK3PXP`).
- [ ] Terminal ouvert à la racine du dépôt, police agrandie, historique nettoyé.
- [ ] Éditeur de code ouvert sur les fichiers de la partie 4.
- [ ] Plan B : la vidéo de démonstration en local, au cas où le réseau ou la machine flanche.

---

## 1. Pitch (3 minutes, à apprendre)

> **(0:00)** Aujourd'hui, des instructions de service circulent sur des messageries grand public dont les serveurs sont à l'étranger et les règles hors de contrôle de l'État. Nous proposons **Laafi** — « tout va bien » en mooré — la messagerie souveraine de l'administration burkinabè.
>
> **(0:30)** Trois promesses. **Un : le serveur ne lit rien.** Les messages et fichiers sont chiffrés de bout en bout avec le protocole **Matrix Olm/Megolm**, via la bibliothèque Rust **vodozemac**, auditée. Nous n'avons écrit aucune cryptographie. **Deux : l'État maîtrise les identités.** Seuls les agents enrôlés par leur ministère entrent, avec mot de passe et second facteur TOTP, et une révocation coupe l'accès sur tous les appareils en quelques secondes. **Trois : tout s'installe en une commande** sur un serveur de l'État, sans aucun service tiers.
>
> **(1:15)** Architecture : une passerelle **nginx**, seul port exposé. **Keycloak** gère l'identité, le TOTP et les rôles. **Synapse**, serveur Matrix, ne stocke que du chiffré ; sa fédération est coupée et il n'accepte que les connexions SSO d'agents enrôlés. Un **backend Spring Boot** pilote l'enrôlement, la révocation, l'annuaire et le journal probant. Deux applications **Angular** : la messagerie des agents, où se fait tout le chiffrement, et la console d'administration.
>
> **(2:00)** Nos innovations pour l'administration : la **classification** Diffusion restreinte et Confidentiel, avec interdiction de copie et de transfert, filigrane nominatif et expiration ; l'**accusé de lecture probant** pour les instructions de service, horodaté, chaîné et signé ; l'**annuaire officiel** par ministère ; deux niveaux de **révocation** et un **bouton d'urgence** ; une interface en **mooré et dioula** avec messages vocaux.
>
> **(2:40)** Nous documentons aussi nos limites : le serveur voit encore qui parle à qui et quand, et aucun navigateur ne peut bloquer une capture d'écran. Tout est publié sous **EUPL-1.2**, la licence des administrations publiques. Nous sommes prêts pour les épreuves.

---

## 2. Les épreuves pas à pas

### Épreuve 1 — « Le serveur ne lit rien »

**Objectif :** prouver qu'aucun message ni fichier n'apparaît en clair dans la base ni sur le réseau.

1. Dans le profil A, envoyer dans le groupe un message contenant un **mot-témoin** proposé par le jury, par exemple `TEMOIN-MANGUE-2026`. Joindre aussi un petit fichier texte contenant ce même mot.
2. Chercher le mot-témoin dans **les trois bases** :

   ```bash
   docker compose exec postgres sh -c 'for db in synapse keycloak laafi; do printf "%s : " "$db"; pg_dump -U "$POSTGRES_USER" "$db" | grep -ci "TEMOIN-MANGUE-2026"; done'
   ```

   Résultat attendu : `0` pour chaque base.
3. Montrer ce que la base contient réellement :

   ```bash
   docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d synapse -c "SELECT e.type, left(j.json, 250) FROM events e JOIN event_json j USING (event_id) ORDER BY e.stream_ordering DESC LIMIT 3;"'
   ```

   À commenter : `type = m.room.encrypted`, `algorithm = m.megolm.v1.aes-sha2`, `ciphertext` illisible, `session_id` et `device_id` visibles (métadonnées).
4. Chercher dans le **stockage des fichiers** de Synapse (chemin `media_store_path` de la configuration, `/data/media_store` par défaut) :

   ```bash
   docker compose exec synapse sh -c 'grep -rIl "TEMOIN-MANGUE-2026" /data/media_store | wc -l'
   ```

   Résultat attendu : `0` (les fichiers sont chiffrés en AES-256-CTR avant envoi).
5. **Réseau**, au choix :
   - Outils de développement du navigateur → onglet Réseau → requête `PUT …/send/m.room.encrypted/…` : le corps ne contient que `ciphertext`.
   - Capture sur la machine hôte :

     ```bash
     sudo tcpdump -i any -A -s0 'tcp port 8888' | grep -i --line-buffered "TEMOIN"
     ```

     Envoyer un nouveau message : aucune ligne ne s'affiche.
6. Phrase de conclusion : « Le serveur stocke et relaie, mais il ne possède aucune clé. Il voit en revanche les métadonnées, que nous avons listées dans la note de sécurité. »

### Épreuve 2 — Révocation pendant une conversation de groupe

**Objectif :** l'agent révoqué perd immédiatement l'accès, y compris aux nouveaux messages.

1. Profils A et B côte à côte : Awa et Issa échangent dans le groupe.
2. Profil C, console `http://localhost:8888/console/` → **Agents** → rechercher `issa.kabore` → fiche agent (montrer la liste des **appareils**) → **Révoquer l'accès** → motif « Épreuve jury » → confirmer.
3. Sur le profil B : en quelques secondes, écran **« Accès révoqué »** ; les données locales (clés, cache) sont effacées.
4. Sur le profil A : Awa envoie un nouveau message. L'historique du groupe indique qu'Issa est parti ; le client d'Awa a **créé une nouvelle session Megolm** sans les appareils d'Issa.
5. Profil B : tenter de se reconnecter → Keycloak refuse (compte désactivé).
6. Preuves côté serveur :
   - console : statut `REVOQUE`, 0 appareil, entrée dans le **journal d'audit** ;
   - base Synapse :

     ```bash
     docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d synapse -c "SELECT name, deactivated FROM users WHERE name = '"'"'@issa.kabore:laafi.local'"'"';" -c "SELECT count(*) AS appareils FROM devices WHERE user_id = '"'"'@issa.kabore:laafi.local'"'"';" -c "SELECT count(*) AS jetons FROM access_tokens WHERE user_id = '"'"'@issa.kabore:laafi.local'"'"';"'
     ```

     Attendu : `deactivated = 1`, `0` appareil, `0` jeton.
7. Variante « perte de téléphone » : bouton **Révoquer les appareils** → appareils supprimés, compte toujours actif, reconnexion avec mot de passe **et** TOTP.
8. Remise en état : `super.admin` → fiche d'Issa → **Réactiver**, puis réinviter Issa dans le groupe (il n'en est plus membre et ne verra pas l'historique de la période révoquée).

### Épreuve 3 — Intrus

**Objectif :** un compte non enrôlé ne peut entrer ni dans la messagerie ni dans un groupe. Montrer les **couches** successives.

| # | Tentative | Commande ou action | Résultat attendu |
| --- | --- | --- | --- |
| 1 | Connexion avec un compte inconnu | Profil D → « Se connecter avec mon compte agent » → `intrus` / n'importe quel mot de passe | Keycloak : identifiant ou mot de passe invalide |
| 2 | Inscription libre côté Keycloak | Page de connexion | Aucun lien « S'inscrire » |
| 3 | Inscription directe sur Matrix | `curl -s -X POST http://localhost:8888/_matrix/client/v3/register -H 'Content-Type: application/json' -d '{"username":"intrus","password":"x"}'` | `403`, `M_FORBIDDEN` (inscription désactivée) |
| 4 | Contourner le SSO par mot de passe Matrix | `curl -s -X POST http://localhost:8888/_matrix/client/v3/login -H 'Content-Type: application/json' -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"issa.kabore"},"password":"Laafi2026!"}'` | `403`, `M_FORBIDDEN` : les agents n'ont pas de mot de passe Matrix |
| 5 | Mot de passe correct, mauvais code TOTP | Profil D → `paul.zongo` / `Laafi2026!` / `000000` | Keycloak : code invalide |
| 6 | API d'administration Synapse depuis l'extérieur | `curl -i http://localhost:8888/_synapse/admin/v1/server_version` | `403` renvoyé par la passerelle |
| 7 | API métier sans jeton | `curl -i http://localhost:8888/api/v1/annuaire` | `401` |
| 8 | Agent réel mais non invité qui veut rejoindre un groupe | Profil D connecté en `paul.zongo` (MEF) → rejoindre le salon par son identifiant `!…:laafi.local` | `M_FORBIDDEN` : salon sur invitation uniquement |

À expliquer : un compte présent dans Keycloak mais **non enrôlé** (`enrole` différent de `true`) est refusé par Synapse grâce à `attribute_requirements` sur le claim `laafi_enrole`. Un agent révoqué cumule `enabled=false` et `enrole=false`.

### Épreuve 4 — Innovation : instruction classifiée avec accusé probant

1. Profil C (messagerie, Rasmata) : nouveau message dans le groupe → classification **Confidentiel** → cocher **Instruction de service** → « Toutes les équipes transmettent leur rapport de riposte avant vendredi 12 h. »
2. Profil A (Awa) : bandeau Confidentiel, **filigrane** (nom, matricule, date), copie et transfert désactivés ; cliquer hors de la fenêtre → contenu **flouté** ; mention de l'expiration (7 jours).
3. Awa clique **« J'atteste avoir lu »**. Le client calcule l'empreinte SHA-256 du contenu déchiffré et l'envoie à `/api/v1/accuses`.
4. Profil C : liste des accusés de l'instruction → ouvrir la **preuve** (entrée, hash précédent, signature, clé publique).
5. Console → **Journal probant** → **Vérifier l'intégrité** → chaîne valide.
6. Bonus si le temps le permet : changer la langue en **mooré** puis **dioula** ; envoyer un **message vocal**.

### Épreuve 5 — Explication du code

Voir la **partie 4**. Méthode en quatre temps : (1) à quoi sert la fonction, (2) ses entrées et sorties, (3) les lignes clés, (4) ce qui se passerait si on la supprimait (la menace qu'elle couvre).

---

## 3. Vingt-cinq questions probables et réponses

**1. Pourquoi Matrix plutôt que Signal ?**
Les deux protocoles sont solides. Matrix nous offre un serveur auto-hébergeable (Synapse), le SSO OIDC natif pour brancher Keycloak, une API d'administration pour désactiver un compte ou supprimer des appareils, et un SDK web mûr. Signal-Server est conçu pour un service centralisé unique, sans rôles ni annuaire institutionnel.

**2. Différence entre Olm et Megolm ?**
Olm chiffre entre **deux appareils** (Double Ratchet). Megolm chiffre pour un **groupe** : chaque appareil émetteur a une session de groupe dont la clé est envoyée une fois à chaque appareil membre, **à travers Olm**. On chiffre ainsi un message une seule fois quel que soit le nombre de destinataires.

**3. Qu'est-ce que le Double Ratchet ?**
Deux « cliquets ». Le cliquet symétrique dérive une nouvelle clé à chaque message (HMAC-SHA-256) : une clé volée ne permet pas de remonter le passé (**confidentialité persistante**). Le cliquet Diffie-Hellman (Curve25519) injecte un nouveau secret à chaque aller-retour : après une compromission, la sécurité se rétablit (**sécurité post-compromission**). La session démarre par un triple Diffie-Hellman avec les clés d'identité et des clés à usage unique.

**4. Comment la clé de groupe arrive-t-elle aux membres ?**
Le client émetteur crée une session Megolm sortante, puis envoie la clé (`m.room_key`) à chaque appareil membre par un message Olm « appareil à appareil ». Le serveur relaie ce message chiffré sans pouvoir le lire.

**5. Que devient la clé Megolm lors d'une révocation ?**
La désactivation fait quitter tous les salons à l'agent. Quand un membre ou un appareil quitte le salon, les clients restants **abandonnent leur session Megolm sortante** et en créent une nouvelle, distribuée uniquement aux appareils encore présents. L'agent révoqué n'a donc pas la clé des nouveaux messages. Megolm renouvelle aussi la session périodiquement (par défaut 100 messages ou une semaine).

**6. Pourquoi la révocation est-elle immédiate ?**
Le backend désactive le compte Keycloak et ferme ses sessions, puis appelle l'API d'administration Synapse `deactivate`, qui supprime **tous les jetons d'accès et appareils**. La requête de synchronisation suivante du client reçoit `M_UNKNOWN_TOKEN` ; le client efface ses données locales et affiche « Accès révoqué ». Le serveur refuse de toute façon de lui servir quoi que ce soit.

**7. Révocation totale, révocation des appareils, bouton d'urgence : quelle différence ?**
Totale : départ ou faute, le compte est désactivé partout. Appareils : perte du téléphone, les appareils sont supprimés mais le compte reste ; l'agent se reconnecte avec mot de passe et TOTP. Urgence : l'agent lui-même déclenche la suppression de ses appareils, par exemple sous la contrainte.

**8. Que voit le serveur ?**
Pas le contenu. Il voit qui est membre de quel salon, qui envoie quand, la taille des messages, les adresses IP (gardées un jour), la liste des appareils et leurs clés publiques, les accusés de lecture privés, et les noms de salons (événements d'état non chiffrés). Détail dans la note de sécurité.

**9. Pourquoi `history_visibility: joined` ?**
Un agent ajouté à un groupe ne doit pas lire ce qui a été dit **avant** son arrivée. Le serveur ne lui sert pas les anciens événements et les clients ne lui partagent pas les anciennes clés. C'est le principe du « besoin d'en connaître ».

**10. Pourquoi aucune cryptographie maison ? Et le SHA-256 et l'Ed25519 du backend ?**
Concevoir de la crypto est extrêmement risqué et interdit par le règlement. La confidentialité repose uniquement sur vodozemac. Le backend utilise des primitives **standard** de la bibliothèque Java (JCA) pour une seule chose : l'**intégrité** du journal probant (empreinte et signature). Nous n'inventons aucun algorithme ni protocole.

**11. Comment fonctionne le TOTP ?**
RFC 6238 : un secret partagé est enregistré dans Keycloak et dans l'application de l'agent. Toutes les 30 secondes, les deux calculent HMAC-SHA1(secret, compteur de temps) et en extraient 6 chiffres. Un mot de passe volé ne suffit donc pas. SHA1 reste sûr ici car utilisé dans un HMAC.

**12. Expliquez la connexion OIDC et le `loginToken`.**
Le client redirige vers Synapse (`/login/sso/redirect/oidc-keycloak`). Synapse redirige vers Keycloak, où l'agent saisit mot de passe et TOTP. Keycloak renvoie un code d'autorisation à Synapse, qui l'échange, avec son secret client, contre l'identité de l'agent. Synapse vérifie le claim `laafi_enrole`, puis renvoie le navigateur vers Laafi avec un **`loginToken` à usage unique et de courte durée**. Le client l'échange (`m.login.token`) contre un jeton d'accès Matrix et un identifiant d'appareil.

**13. Pourquoi PKCE pour le client et la console ?**
Ce sont des applications publiques qui ne peuvent pas garder de secret. PKCE (S256) lie la demande d'autorisation à l'échange du code : un code intercepté est inutilisable sans le vérificateur gardé par l'application.

**14. Pourquoi Keycloak au lieu des comptes Synapse ?**
Une seule source de vérité pour l'identité : enrôlement, 2FA obligatoire, rôles, attributs (ministère, fonction, matricule), désactivation. Synapse délègue entièrement l'authentification.

**15. Comment fonctionne l'accusé de lecture probant ?**
Le client calcule le SHA-256 du contenu **déchiffré** et canonique de l'instruction et l'envoie avec les identifiants de salon et de message. Le backend ajoute l'agent authentifié et l'heure serveur, inclut l'empreinte de l'entrée précédente, calcule l'empreinte de l'ensemble et la **signe en Ed25519**. Modifier ou supprimer une entrée casse la chaîne : la vérification le détecte.

**16. Qu'est-ce que l'accusé prouve, et ne prouve pas ?**
Il prouve qu'à telle heure, le client authentifié de tel agent a déclaré avoir reçu un contenu d'empreinte donnée. Il ne prouve pas la compréhension. La signature est celle du serveur : il faut faire confiance à sa clé, publiée pour la vérification.

**17. Le serveur ne pourrait-il pas retrouver le texte à partir de l'empreinte ?**
Pas pour un texte ordinaire. Pour un message très court et prévisible, un essai exhaustif est envisageable : c'est une limite documentée.

**18. Comment la classification est-elle protégée ?**
Le niveau est **dans le contenu chiffré** : le serveur ne le voit pas et ne peut pas le modifier sans casser le déchiffrement. Les règles (copie, transfert, expiration) sont appliquées par le client officiel. Un client modifié pourrait les ignorer : c'est une politique, pas une garantie cryptographique.

**19. Et les captures d'écran ?**
Aucun navigateur ne permet de les bloquer, ni d'empêcher une photo de l'écran. Nous dissuadons (filigrane nominatif, flou hors focus, interdiction de copie) et rendons la fuite traçable.

**20. Comment les fichiers sont-ils chiffrés ?**
Le client génère une clé AES-256 aléatoire, chiffre le fichier en AES-CTR et calcule son SHA-256. Il envoie le fichier chiffré au serveur, puis la clé et l'empreinte **dans le message Megolm chiffré**. Seuls les membres peuvent donc le déchiffrer.

**21. Si un administrateur ajoute un appareil fantôme à un agent ?**
Il ne lirait pas l'historique, mais pourrait recevoir les nouvelles clés. La parade Matrix est la **vérification des appareils** (signature croisée). Nous l'indiquons comme limite et piste prioritaire.

**22. Si on vole la base de données ?**
Messages : uniquement du chiffré. Métadonnées : exposées. Keycloak : mots de passe hachés, mais secrets TOTP récupérables ; la base doit donc être protégée (réseau interne, sauvegardes chiffrées).

**23. Le téléphone volé est hors ligne : que se passe-t-il ?**
Le serveur a déjà supprimé ses appareils et jetons : il ne recevra plus rien. Mais son cache local reste lisible tant qu'il ne se reconnecte pas. À la reconnexion, il reçoit `M_UNKNOWN_TOKEN` et s'efface.

**24. Pourquoi désactiver la fédération ?**
Aucun serveur extérieur ne doit recevoir d'événements ni de métadonnées. Le service reste entièrement sur l'infrastructure de l'État.

**25. Pourquoi des accusés de lecture privés et pas d'indicateur de frappe ?**
Ce sont des métadonnées comportementales : qui lit quoi, qui est en train d'écrire. Nous les désactivons par défaut. L'accusé probant, lui, est volontaire et réservé aux instructions de service.

---

## 4. Fiche « explique cette fonction »

> Les chemins sont **indicatifs** : à ajuster aux noms définitifs du code.

| Fonction (chemin indicatif) | Ce qu'elle fait | Points à dire absolument |
| --- | --- | --- |
| Client — service d'authentification (`frontend/client/src/app/core/…`), redirection SSO | Envoie le navigateur vers `/_matrix/client/v3/login/sso/redirect/oidc-keycloak?redirectUrl=…` | Pas de mot de passe dans Laafi : Keycloak gère mot de passe et TOTP. |
| Client — connexion par `loginToken` | Lit `loginToken` dans l'URL, appelle `m.login.token`, obtient `access_token` et `device_id`, nettoie l'URL | Jeton à usage unique et court ; retiré de l'URL pour ne pas fuiter dans l'historique. |
| Client — service Matrix/crypto, démarrage | Crée le client Matrix, appelle **`initRustCrypto`** (clés stockées dans IndexedDB), lance la synchronisation | Toute la crypto vient de vodozemac (WebAssembly). Clés privées jamais envoyées au serveur. |
| Client — création de salon | `createRoom` avec `m.room.encryption` (`m.megolm.v1.aes-sha2`) dans l'état initial, `history_visibility: joined`, `join_rule: invite`, `guest_access: forbidden` | Chiffré dès la création : aucun message ne part jamais en clair. |
| Client — envoi d'un message classifié | Ajoute `bf.laafi.classification`, `bf.laafi.expire_at`, `bf.laafi.instruction` au contenu, puis `sendMessage` qui chiffre en Megolm | Les champs personnalisés sont **dans** le chiffré. |
| Client — empreinte de l'accusé | Sérialise le contenu déchiffré de façon canonique, `crypto.subtle.digest('SHA-256', …)`, envoie l'hexadécimal à `/api/v1/accuses` | Primitive standard (WebCrypto) ; le texte ne quitte jamais l'appareil. |
| Client — détection de révocation | Écoute `Session.logged_out` et les erreurs `M_UNKNOWN_TOKEN` ; arrête le client, supprime les bases IndexedDB crypto et le stockage local, affiche « Accès révoqué » | Couvre vol et départ : rien ne reste sur l'appareil après reconnexion. |
| Backend — `RevocationService`, révocation totale | Keycloak : `enabled=false`, déconnexion de toutes les sessions, `enrole=false`. Synapse : `POST /_synapse/admin/v1/deactivate/{mxid}` `{erase:false}`. Écrit le journal d'audit | Ordre : d'abord l'identité, puis Matrix. `erase:false` garde l'historique des autres membres intact. Conséquence côté clients : rotation Megolm. |
| Backend — `RevocationService`, révocation des appareils | Synapse `delete_devices` sur tous les appareils + déconnexion Keycloak ; compte conservé | Perte du téléphone : l'agent garde son identité mais doit repasser par mot de passe + TOTP. |
| Backend — service d'enrôlement | Crée l'utilisateur Keycloak (attributs, rôles, `enrole=true`, mot de passe temporaire, actions `CONFIGURE_TOTP` et `UPDATE_PASSWORD`), puis l'utilisateur Synapse avec `external_ids` (`oidc-keycloak`, `sub`) | Un `admin_ministere` ne peut enrôler que dans son ministère. Le lien `external_ids` rattache le compte Matrix à l'identité Keycloak. |
| Backend — service des accusés probants | Construit l'entrée (agent, salon, message, empreinte, heure serveur, hash précédent), calcule son SHA-256, la signe en Ed25519 (JCA), l'enregistre | Chaînage = intégrité de l'ordre et de l'ensemble ; signature = authenticité. |
| Backend — vérification du journal | Parcourt la chaîne, recalcule chaque empreinte, compare au « hash précédent » suivant, vérifie chaque signature | Une seule entrée modifiée rend la chaîne invalide à partir de ce point. |
| Backend — configuration de sécurité | Serveur de ressources JWT : clés publiques de Keycloak, issuer attendu, conversion de `realm_access.roles` en `ROLE_…` | Le backend ne voit jamais de mot de passe ; il vérifie la signature du jeton. |
