import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Écrans de la messagerie : réservés à une session Matrix active. */
export const connecteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const etat = await auth.pret();
  return etat === 'connecte' ? true : router.parseUrl('/');
};

/** Écran d'accueil : un agent déjà connecté va directement à ses conversations. */
export const accueilGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const etat = await auth.pret();
  return etat === 'connecte' ? router.parseUrl('/salons') : true;
};
