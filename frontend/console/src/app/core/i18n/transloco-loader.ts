import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Charge `assets/i18n/<langue>.json`. Chemin RELATIF : il est résolu par rapport au base href
 * (/console/), donc servi par la console elle-même — aucune ressource externe.
 * Pour ajouter le mooré ou le dioula : déposer `mos.json` / `dyu.json` et les déclarer dans
 * `LANGUES_DISPONIBLES` (app.config.ts).
 */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(langue: string) {
    return this.http.get<Translation>(`assets/i18n/${langue}.json`);
  }
}
