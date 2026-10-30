import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { configurerApplication } from './app/app.config';
import { initialiserKeycloak } from './app/core/auth/keycloak';

/**
 * Démarrage : on authentifie l'administrateur AVANT de lancer Angular. Tant que Keycloak n'a pas
 * validé mot de passe + TOTP, aucun écran de la console n'est rendu et aucun appel API n'est fait.
 */
initialiserKeycloak()
  .then((keycloak) => bootstrapApplication(App, configurerApplication(keycloak)))
  .catch((err: unknown) => {
    console.error(err);
    const racine = document.querySelector('lc-root');
    if (racine) {
      racine.innerHTML = '';
      const bloc = document.createElement('div');
      bloc.className = 'lc-boot lc-boot--erreur';
      bloc.setAttribute('role', 'alert');
      const titre = document.createElement('p');
      titre.textContent = 'Le service d’authentification est injoignable.';
      const aide = document.createElement('p');
      aide.textContent = 'Vérifiez que la plateforme Laafi est démarrée, puis rechargez la page.';
      bloc.append(titre, aide);
      racine.append(bloc);
    }
  });
