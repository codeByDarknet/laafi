import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { CONFIG } from '../config';
import { KeycloakService } from '../auth/keycloak.service';

/**
 * Ajoute le JWT Keycloak (Authorization: Bearer) aux SEULS appels du backend Laafi.
 * Les requêtes vers /_matrix utilisent le jeton Matrix via matrix-js-sdk, jamais celui-ci.
 */
export const jetonInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(CONFIG.apiBase)) return next(req);
  const keycloak = inject(KeycloakService);
  return from(keycloak.jeton()).pipe(
    switchMap((jeton) =>
      next(jeton ? req.clone({ setHeaders: { Authorization: `Bearer ${jeton}` } }) : req),
    ),
  );
};
