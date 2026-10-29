import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Charge les traductions depuis assets/i18n/{fr,mos,dyu}.json (chemin relatif, même origine).
 * Le service worker les met en cache : l'interface reste traduite hors ligne.
 */
@Injectable({ providedIn: 'root' })
export class ChargeurTraductions implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(langue: string) {
    return this.http.get<Translation>(`assets/i18n/${langue}.json`);
  }
}
