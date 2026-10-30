# Comptes de démonstration

> **Tous ces comptes sont fictifs.** Le mot de passe et le secret TOTP ci-dessous sont des **valeurs de démonstration publiques**. Ne jamais les utiliser en production.

## 1. Accès

| Application | Adresse |
| --- | --- |
| Messagerie des agents | <http://localhost:8888/> |
| Console d'administration | <http://localhost:8888/console/> |

## 2. Comptes

Mot de passe commun : **`Laafi2026!`**

| Identifiant | Nom | Rôles | Ministère | Fonction | Identifiant Matrix |
| --- | --- | --- | --- | --- | --- |
| `super.admin` | Admin DGTD | super_admin, agent | MTDPCE | Administrateur plateforme | `@super.admin:laafi.local` |
| `admin.sante` | Rasmata Compaoré | admin_ministere, agent | MSHP | Administratrice ministère | `@admin.sante:laafi.local` |
| `awa.sawadogo` | Awa Sawadogo | chef_service, agent | MSHP | Directrice des ressources humaines | `@awa.sawadogo:laafi.local` |
| `issa.kabore` | Issa Kaboré | agent | MSHP | Médecin-chef de district | `@issa.kabore:laafi.local` |
| `mariam.traore` | Mariam Traoré | agent | MTDPCE | Chargée d'études | `@mariam.traore:laafi.local` |
| `paul.zongo` | Paul Zongo | agent | MEF | Contrôleur financier | `@paul.zongo:laafi.local` |

Le compte **`intrus` n'existe pas** : il sert à l'épreuve « Intrus ».

Qui peut faire quoi :

- **Console** : `super.admin` (tous les ministères) et `admin.sante` (ministère de la Santé uniquement).
- **Créer un canal institutionnel** : `awa.sawadogo` (chef de service) et les administrateurs.
- **Réactiver un agent révoqué** : `super.admin` uniquement.

## 3. Second facteur (TOTP)

Tous les comptes de démonstration partagent le **même** secret TOTP, déjà enregistré :

| Paramètre | Valeur |
| --- | --- |
| Secret (base32) | `JBSWY3DPEHPK3PXP` |
| Algorithme | SHA1 |
| Chiffres | 6 |
| Période | 30 secondes |
| Libellé | Laafi démo |

### Option A — application d'authentification (recommandée)

Ajoutez une entrée dans **FreeOTP** ou **Aegis** (open source), soit en saisissant le secret à la main, soit en important cette URI :

```
otpauth://totp/Laafi%20d%C3%A9mo?secret=JBSWY3DPEHPK3PXP&issuer=Laafi%20d%C3%A9mo&algorithm=SHA1&digits=6&period=30
```

Une seule entrée suffit pour tous les comptes.

### Option B — ligne de commande

Avec `oathtool` (paquet `oathtool` sous Debian/Ubuntu) :

```bash
oathtool --totp -b JBSWY3DPEHPK3PXP
```

Sans rien installer, avec Python 3 :

```bash
python3 -c 'import base64,hmac,hashlib,struct,time;k=base64.b32decode("JBSWY3DPEHPK3PXP");h=hmac.new(k,struct.pack(">Q",int(time.time())//30),hashlib.sha1).digest();o=h[-1]&15;print("%06d"%((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000))'
```

Le code change toutes les 30 secondes : l'horloge de la machine doit être à l'heure.

## 4. Conseils pour tester

- **Deux agents en même temps** : utilisez deux profils de navigateur distincts (ou deux navigateurs). Une fenêtre privée partage parfois la session d'une autre fenêtre privée.
- **Agent nouvellement enrôlé** depuis la console : il reçoit un mot de passe temporaire, doit le changer et **configurer son propre TOTP** à la première connexion (QR code affiché par Keycloak).
- **Après une démonstration de révocation** : `super.admin` réactive l'agent depuis la console (fiche agent → « Réactiver »).
