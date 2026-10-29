# Traductions de l'interface Laafi : mooré (`mos`) et dioula (`dyu`)

## Statut : à relire avant toute mise en production

Les fichiers `mos.json` (mooré) et `dyu.json` (dioula/jula) ont été **produits avec l'assistance
d'un outil d'IA**, à partir de `fr.json`. Ils n'ont **pas encore été relus par un locuteur natif**.

Ils suffisent pour démontrer que l'interface peut être servie dans une langue nationale, mais ils
**DOIVENT être relus et corrigés par des locuteurs natifs** (idéalement un agent de l'administration
pour chaque langue, et si possible un linguiste de la DGTD ou de l'INSD/CNRST) avant toute mise en production.
Des tournures maladroites, des contresens ou des fautes d'orthographe sont probables.

## Conventions retenues

- **Orthographe** : alphabet national burkinabè (mooré : `ɛ`, `ɩ`, `ʋ`, voyelles nasales `ã ẽ ĩ õ ũ` ;
  dioula : `ɛ`, `ɔ`, `ɲ`, `ŋ`). Tons non notés, comme dans l'usage courant.
- **Termes techniques sans équivalent établi** : emprunt français usuel (`serveur`, `empreinte`,
  `SHA-256`, `Mo`, `cache`, `onglet`, `navigateur`, `presse-papiers`, `matricule`, `code`) ou
  périphrase, parfois avec le terme français entre parenthèses pour lever l'ambiguïté
  (`administrateur`, `modérateur`, `fichier`, `identité cryptographique`).
- **Variables d'interpolation** (`{{n}}`, `{{nom}}`, `{{taille}}`…) : conservées telles quelles.
- **Pluriels** : `fr.json` utilise la forme « message(s) » ; en mooré et en dioula le nom reste au
  singulier après un nombre (« Koɛɛs {{n}} », « Cikan {{n}} »), ce qui évite le problème.
- **`urgence.mot`** : gardé à `URGENCE` dans les deux langues. L'utilisateur doit taper ce mot pour
  confirmer la déconnexion d'urgence (comparaison insensible à la casse dans
  `profil.component.ts`) ; un mot en ASCII se tape sur n'importe quel clavier, contrairement à un
  mot contenant `ɛ` ou `ʋ`. À rediscuter avec les relecteurs.
- **Abréviations de classification** (`N`, `DR`, `C`) : gardées identiques au français, car ce sont
  des marquages administratifs normalisés.

## Termes à faire valider en priorité

Ces termes portent le sens « sécurité » de l'application : une mauvaise traduction pourrait induire
un agent en erreur.

| Notion (fr) | Mooré proposé | Dioula proposé | Point à vérifier |
|---|---|---|---|
| chiffré / chiffrement | `solgdame`, `solgre` (« caché ») | `dogolen`, `dogoli` (« caché ») | La notion « caché » rend-elle bien « illisible sauf pour le destinataire » ? |
| déchiffrer | `pak` (« ouvrir ») | `dayɛlɛ` (« ouvrir ») | Idem |
| de bout en bout | `sɩngr n tãag a ned zĩigẽ` | `k'a ta daminɛ na ka se a laban ma` | Formulation longue ; existe-t-il plus court ? |
| clé de récupération | `lebgr kle` | `segin kile` | Emprunt `kle` / `kile` ; compréhension de « récupération » |
| appareil | `masĩn` | `minɛn` | Couvre-t-il bien téléphone **et** ordinateur ? |
| vérifié / vérifier (appareil, identité) | `sɩdame`, `ges` | `sɛgɛsɛgɛlen`, `sɛgɛsɛgɛ` | Distinguer « vérifié » (confiance) de « regardé » |
| révoqué / déconnecter | `sorã yɩɩsame`, `yi` | `sira tara`, `bɔ` | Force du terme (accès retiré par l'administration) |
| effacer / supprimer | `yɩlg` | `jɔsi` | Effacement **définitif** bien compris ? |
| confidentiel / diffusion restreinte | `solgo` / `tʋms-a ne ministɛɛrã neb bala` | `gundo` / `minisiriso mɔgɔw dɔrɔn` | Correspondance avec la terminologie administrative |
| instruction officielle | `gomnã noore` | `fanga ci fɔlen` | Registre administratif |
| accusé de réception / preuve | `deegr kaset` | `sɔrɔli seereya` | Valeur de preuve juridique perçue |
| urgence | `yɛl-kẽnde` | `kɔrɔtɔ` | Clarté du bouton d'urgence |
| canal officiel | `gomnã koɛɛg-sore` | `fanga kunnafoni sira` | |
| annuaire | `tʋʋm-tʋʋmdb yʋy-sɛbre` | `baarakɛlaw tɔgɔ gafe` | |
| agent / chef de service / administrateur | `tʋʋm-tʋʋmda` / `tʋʋm-zĩig taoor soaba` / `gɩdgda` | `baarakɛla` / `baarada kuntigi` / `ɲɛmɔgɔ` | Titres officiels |
| clair / sombre (thème) | `vẽenem` / `lik-lik` | `yeelen` / `dibi` | |

## Vérifier après relecture

Les deux fichiers doivent garder exactement les mêmes clés que `fr.json` et les mêmes variables
`{{...}}`. Contrôle : `python3 -m json.tool mos.json` (et `dyu.json`), puis comparaison des clés
aplaties des trois fichiers (aucune clé manquante ni en trop, mêmes variables par clé).

Pour signaler une correction : modifier la valeur dans le JSON concerné, sans toucher aux clés.
