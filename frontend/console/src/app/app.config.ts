import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeFr from '@angular/common/locales/fr';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import Keycloak from 'keycloak-js';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { KEYCLOAK } from './core/auth/keycloak';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { TitreTraduit } from './core/i18n/titre';

registerLocaleData(localeFr);

/** Langues de l'interface. La console est en français ; la structure accepte mos / dyu. */
export const LANGUES_DISPONIBLES = ['fr'];

export function configurerApplication(keycloak: Keycloak): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: KEYCLOAK, useValue: keycloak },
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: TitleStrategy, useClass: TitreTraduit },
      provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideTransloco({
        config: {
          availableLangs: LANGUES_DISPONIBLES,
          defaultLang: 'fr',
          fallbackLang: 'fr',
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
          missingHandler: { logMissingKey: isDevMode() },
        },
        loader: TranslocoHttpLoader,
      }),
      // Traductions chargées AVANT le premier rendu : pas de clés brutes affichées à l'écran.
      provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load('fr'))),
    ],
  };
}
