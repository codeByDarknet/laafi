import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { API } from '../api/api.service';
import { AuthService } from './auth.service';

/**
 * Ajoute `Authorization: Bearer <jeton>` aux SEULES requêtes vers notre API (/api/v1) : le jeton
 * n'est jamais envoyé ailleurs (fichiers de traduction, ressources statiques…).
 *
 * Avant l'envoi, le jeton est rafraîchi s'il expire dans moins de 30 s. Si le backend répond
 * malgré tout 401 (jeton révoqué entre-temps, horloge décalée), on force UN rafraîchissement et on
 * rejoue la requête une seule fois ; en cas de nouvel échec, AuthService renvoie vers la connexion.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!estRequeteApi(req)) return next(req);
  const auth = inject(AuthService);

  return from(auth.jetonValide()).pipe(
    switchMap((jeton) => next(avecJeton(req, jeton))),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        return from(auth.forcerRafraichissement()).pipe(
          switchMap((jeton) => (jeton ? next(avecJeton(req, jeton)) : throwError(() => err))),
        );
      }
      return throwError(() => err);
    }),
  );
};

function estRequeteApi(req: HttpRequest<unknown>): boolean {
  // URL relative (/api/v1/...) ou absolue sur notre propre origine uniquement.
  if (req.url.startsWith(`${API}/`) || req.url === API) return true;
  try {
    const url = new URL(req.url, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith(`${API}/`);
  } catch {
    return false;
  }
}

function avecJeton(req: HttpRequest<unknown>, jeton: string | undefined): HttpRequest<unknown> {
  return jeton ? req.clone({ setHeaders: { Authorization: `Bearer ${jeton}` } }) : req;
}
