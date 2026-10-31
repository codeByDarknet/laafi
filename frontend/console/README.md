# Laafi : console d'administration

Console Angular 21 (composants autonomes, signaux, sans zone.js) réservée aux rôles
`admin_ministere` et `super_admin`. Elle est servie sous `/console/` par la passerelle.

## Commandes

| Action | Commande |
|---|---|
| Installer | `npm ci` |
| Développement (port 4301, proxy `/api` et `/auth` vers `http://localhost:8888`) | `npm start` |
| Build de production → `dist/console/browser` | `npm run build` (= `ng build --base-href /console/`) |
| Tests unitaires (Vitest) | `npm test` |

En développement, Keycloak doit accepter l'URI de redirection `http://localhost:4301/console/*`
pour le client `laafi-console` ; à défaut, testez via la passerelle (`http://localhost:8888/console/`).

## Sécurité, en bref

- **Authentification** : keycloak-js, flux Authorization Code + PKCE (S256), connexion obligatoire
  (mot de passe + TOTP gérés par Keycloak). Le jeton est rafraîchi avant expiration et ajouté
  uniquement aux appels `/api/v1` de la même origine (`core/auth/auth.interceptor.ts`).
- **Autorisation** : `roleGuard` adapte l'interface ; le backend réautorise chaque requête.
- **Révocation** : `core/agents/revocation.service.ts` (confirmation forte : motif + saisie exacte
  de l'identifiant, vérifiée avant tout appel réseau).
- **Chiffrement** : aucun ici. Les messages sont chiffrés de bout en bout par Matrix (Olm/Megolm)
  sur les appareils des agents ; la console ne voit jamais leur contenu.

## Traductions

`public/assets/i18n/fr.json` (Transloco). Ajouter une langue : créer `xx.json` et l'ajouter à
`LANGUES_DISPONIBLES` dans `src/app/app.config.ts`.

Les logos de `public/assets/brand/` sont des copies de `frontend/shared/brand/` (le builder Angular
refuse les assets situés hors du projet).
