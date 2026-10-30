import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from './api/api.service';
import { Ministere } from './api/models';

/** Référentiel des ministères, chargé une fois et partagé par tous les écrans. */
@Injectable({ providedIn: 'root' })
export class ReferentielService {
  private readonly api = inject(ApiService);
  private chargement?: Promise<void>;

  private readonly _ministeres = signal<Ministere[]>([]);
  readonly ministeres = this._ministeres.asReadonly();
  private readonly parCode = computed(() => new Map(this._ministeres().map((m) => [m.code, m])));

  charger(): Promise<void> {
    this.chargement ??= new Promise<void>((resolve) => {
      this.api.ministeres().subscribe({
        next: (l) => {
          this._ministeres.set(l);
          resolve();
        },
        error: () => {
          this.chargement = undefined; // nouvel essai au prochain appel
          resolve();
        },
      });
    });
    return this.chargement;
  }

  nom(code: string | null | undefined): string {
    if (!code) return '—';
    return this.parCode().get(code)?.nom ?? code;
  }

  sigle(code: string | null | undefined): string {
    if (!code) return '—';
    return this.parCode().get(code)?.sigle ?? code;
  }
}
