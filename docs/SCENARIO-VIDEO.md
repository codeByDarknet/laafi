# Scénario de la vidéo de démonstration (3 minutes)

**Contenu exigé :** échange chiffré entre deux agents, révocation d'un agent, fonctionnalité innovante principale.
**Format :** 1920 × 1080, capture d'écran + voix off, sous-titres français conseillés. Durée cible : **2 min 55**.

## Préparation (avant d'enregistrer)

1. `docker compose up -d`, attendre que tous les services soient prêts.
2. Trois profils de navigateur, connectés à l'avance :
   - **Profil A** : `awa.sawadogo` (messagerie) ;
   - **Profil B** : `issa.kabore` (messagerie) ;
   - **Profil C** : `admin.sante` (console `/console/`).
3. Un groupe « Riposte paludisme – District de Kaya » (fictif) avec Awa, Issa et Rasmata, déjà créé.
4. Un terminal ouvert à la racine du dépôt, police agrandie.
5. Code TOTP prêt (voir `COMPTES-DEMO.md`).
6. Notifications système coupées, onglets inutiles fermés.

## Déroulé minuté

| Temps | Plan (écran) | Voix off |
| --- | --- | --- |
| **0:00 – 0:15** | Écran d'accueil Laafi, logo, puis schéma d'architecture du README. | « Laafi est la messagerie souveraine de l'administration burkinabè. Elle s'installe en une commande sur un serveur de l'État, et repose sur le protocole éprouvé Matrix, chiffré de bout en bout. » |
| **0:15 – 0:30** | Profil B : clic sur « Se connecter avec mon compte agent », page Keycloak, mot de passe puis code TOTP. | « Seuls les agents enrôlés par leur ministère peuvent entrer, avec un mot de passe et un second facteur obligatoire. » |
| **0:30 – 0:55** | Écran partagé A / B. Awa écrit dans le groupe : « Réunion de coordination demain 9 h, salle B. » Le message apparaît chez Issa. Issa répond et joint un PDF fictif. | « Awa et Issa échangent. Le message est chiffré dans le navigateur d'Awa avant de partir, et déchiffré seulement sur les appareils des membres du groupe. » |
| **0:55 – 1:15** | Terminal : recherche du mot « coordination » dans la base Synapse (commande de l'épreuve 1 du guide d'entretien) → **0 résultat** ; affichage d'un événement `m.room.encrypted` avec son `ciphertext`. | « Côté serveur, aucune trace du texte. La base ne contient que des données chiffrées. Le serveur ne peut pas lire. » |
| **1:15 – 1:35** | Profil C, console : Agents → Issa Kaboré → « Révoquer l'accès » → motif « Départ du service » → confirmer. | « Issa quitte le service. Son administratrice le révoque depuis la console. » |
| **1:35 – 1:55** | Profil B : l'écran « Accès révoqué » s'affiche, données locales effacées. Profil A : Awa envoie un nouveau message ; le groupe indique qu'Issa est parti. | « En quelques secondes, Issa perd l'accès sur tous ses appareils. Ses données locales sont effacées, et la clé de groupe est renouvelée : il ne pourra lire aucun nouveau message. » |
| **1:55 – 2:30** | Profil C (messagerie) : Rasmata envoie une **instruction de service** classée **Confidentiel**. Chez Awa : bandeau rouge, filigrane nominatif, copie et transfert désactivés, flou quand la fenêtre perd le focus. Awa clique « J'atteste avoir lu ». | « Notre innovation principale : les instructions classifiées. Un message confidentiel ne peut être ni copié ni transféré, porte le nom et le matricule du lecteur, et expire automatiquement. Le destinataire atteste sa lecture. » |
| **2:30 – 2:45** | Rasmata voit l'accusé et ouvre la preuve. Console : Journal probant → « Vérifier l'intégrité » → chaîne valide. | « L'accusé de lecture est horodaté, chaîné et signé : il a valeur probante, et toute modification du journal serait détectée. Le serveur, lui, ne reçoit qu'une empreinte, jamais le texte. » |
| **2:45 – 2:55** | Bascule de la langue de l'interface en mooré, puis en dioula. Écran final : « Laafi — EUPL-1.2 — [lien du dépôt] ». | « Laafi parle aussi mooré et dioula. Open source, souveraine, et prête pour l'administration. Laafi : tout va bien. » |

## Conseils de réalisation

- Enregistrer chaque séquence séparément, puis monter : moins de reprises.
- Zoomer (outil de loupe) sur le terminal et sur le filigrane.
- Ne jamais montrer de vraie donnée personnelle ; ne pas filmer d'onglet personnel.
- Vérifier la durée finale : **3 minutes maximum**, générique compris.
- Exporter en MP4 (H.264), tester la lecture avant dépôt.
