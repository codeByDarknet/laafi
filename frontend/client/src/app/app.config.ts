import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { jetonInterceptor } from './core/api/jeton.interceptor';
import { ChargeurTraductions } from './core/i18n/transloco-loader';
import { langueEnregistree } from './core/ui/preferences.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([jetonInterceptor])),
    provideTransloco({
      config: {
        availableLangs: ['fr', 'mos', 'dyu'],
        defaultLang: langueEnregistree(),
        fallbackLang: 'fr',
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: ChargeurTraductions,
    }),
    // Service worker : met en cache l'APPLICATION (JS, CSS, polices, traductions) pour
    // démarrer sans réseau. Aucune réponse d'API ni aucun message n'est mis en cache.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
