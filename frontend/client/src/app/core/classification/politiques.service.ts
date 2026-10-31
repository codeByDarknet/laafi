import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { Niveau, POLITIQUES_PAR_DEFAUT, Politique, fusionnerPolitiques } from './classification';

/**
 * Politiques de classification publiées par l'administration (GET /api/v1/politiques).
 * Si le backend est injoignable, on applique les défauts du contrat §6 : jamais de règle
 * plus permissive par erreur de réseau.
 */
@Injectable({ providedIn: 'root' })
export class PolitiquesService {
  private readonly api = inject(ApiService);
  readonly politiques = signal<Record<Niveau, Politique>>(POLITIQUES_PAR_DEFAUT);
  /** Vrai si les politiques viennent du serveur (faux = défauts locaux). */
  readonly duServeur = signal(false);

  async charger(): Promise<void> {
    try {
      const recues = await this.api.politiques();
      this.politiques.set(fusionnerPolitiques(recues));
      this.duServeur.set(Array.isArray(recues));
    } catch {
      this.duServeur.set(false);
    }
  }
}
