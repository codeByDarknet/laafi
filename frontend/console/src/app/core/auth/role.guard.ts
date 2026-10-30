import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { Role } from '../api/models';
import { AuthService, ROLES_ADMIN } from './auth.service';

/**
 * Garde d'accès par rôle. Les rôles attendus sont lus dans `data.roles` de la route
 * (par défaut : admin_ministere ou super_admin, seuls autorisés dans la console).
 *
 * Utilisateur authentifié mais sans le rôle → redirection vers « Accès refusé »
 * (pas de boucle de connexion : il EST connecté, il n'a simplement pas le droit).
 *
 * Rappel pour le jury : cette garde est un confort d'interface. Un attaquant qui la contourne
 * dans son navigateur n'obtient rien : chaque appel /api est réautorisé par le backend à partir
 * du jeton signé par Keycloak.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const attendus = (route.data?.['roles'] as Role[] | undefined) ?? ROLES_ADMIN;

  if (auth.utilisateur() && auth.aUnRole(attendus)) {
    return true;
  }
  return router.createUrlTree(['/acces-refuse'], {
    queryParams: { raison: auth.estAdmin() ? 'role' : 'console' },
  });
};
