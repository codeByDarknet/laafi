import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { appliquerTheme, themeEnregistre } from './app/core/ui/preferences.service';

// Thème appliqué AVANT le premier rendu (pas de flash clair → sombre). Fait ici et non par
// un script dans index.html : la CSP de la passerelle interdit les scripts en ligne.
appliquerTheme(themeEnregistre());

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
