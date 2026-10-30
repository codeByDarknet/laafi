import { Injectable, computed, inject, signal } from '@angular/core';
import { EnvoiService } from '../matrix/envoi.service';
import { MatrixClientService } from '../matrix/matrix-client.service';
import { SalonsService } from '../matrix/salons.service';

export type EtatReseau = 'en-ligne' | 'hors-ligne' | 'reconnexion';

/**
 * Indicateur de connectivité et relance de la file d'envoi au retour du réseau.
 * Combine l'état du navigateur (navigator.onLine) et celui de la synchronisation Matrix.
 */
@Injectable({ providedIn: 'root' })
export class ReseauService {
  private readonly matrix = inject(MatrixClientService);
  private readonly salons = inject(SalonsService);
  private readonly envoi = inject(EnvoiService);
  private readonly navigateurEnLigne = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private ecoute = false;

  readonly etat = computed<EtatReseau>(() => {
    if (!this.navigateurEnLigne()) return 'hors-ligne';
    const sync = this.matrix.etat();
    if (sync === 'hors-ligne' || sync === 'erreur') return 'reconnexion';
    return 'en-ligne';
  });

  demarrer(): void {
    if (this.ecoute) return;
    this.ecoute = true;
    window.addEventListener('online', () => {
      this.navigateurEnLigne.set(true);
      this.relancer();
    });
    window.addEventListener('offline', () => this.navigateurEnLigne.set(false));
  }

  relancer(): void {
    // Relance la synchro immédiatement plutôt que d'attendre le prochain essai programmé.
    if (this.matrix.demarre) this.matrix.client.retryImmediately();
    void this.salons.renvoyerEnAttente();
    this.envoi.relancer();
  }
}
