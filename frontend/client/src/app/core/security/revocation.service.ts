import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api/api.service';
import { KeycloakService } from '../auth/keycloak.service';
import { CryptoService } from '../matrix/crypto.service';
import { EnvoiService } from '../matrix/envoi.service';
import { MatrixClientService } from '../matrix/matrix-client.service';
import { PiecesJointesService } from '../matrix/pieces-jointes.service';
import { ProfilService } from '../profil/profil.service';
import { ToastService } from '../ui/toast.service';
import { MotifRevocation, RapportEffacement, effacerDonneesLocales } from './revocation';

/**
 * Orchestration de la révocation côté client.
 *
 * Déclencheurs :
 *  - le serveur refuse le jeton (M_UNKNOWN_TOKEN, soft logout, compte désactivé) : l'agent a
 *    été révoqué par la console, ou un autre appareil a utilisé le bouton d'urgence ;
 *  - l'agent appuie lui-même sur le BOUTON D'URGENCE (téléphone menacé, saisi, perdu…).
 * Dans tous les cas : arrêt immédiat, effacement de TOUT le local, écran « Accès révoqué ».
 */
@Injectable({ providedIn: 'root' })
export class RevocationService {
  private readonly matrix = inject(MatrixClientService);
  private readonly crypto = inject(CryptoService);
  private readonly pj = inject(PiecesJointesService);
  private readonly envoi = inject(EnvoiService);
  private readonly keycloak = inject(KeycloakService);
  private readonly profil = inject(ProfilService);
  private readonly toasts = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly motif = signal<MotifRevocation | null>(null);
  readonly dernierRapport = signal<RapportEffacement | null>(null);
  private enCours: Promise<void> | null = null;

  /** Effacement local complet. Idempotent : plusieurs déclencheurs simultanés = un seul effacement. */
  revoquer(motif: MotifRevocation): Promise<void> {
    if (!this.enCours) this.enCours = this.effacer(motif);
    return this.enCours;
  }

  /**
   * Bouton d'urgence : le SERVEUR supprime tous les appareils de l'agent (POST /me/urgence),
   * puis on efface ce navigateur. Si le backend est injoignable, on invalide au moins le
   * jeton de CET appareil auprès de Synapse (logout) avant d'effacer.
   */
  async urgence(): Promise<{ serveurOk: boolean }> {
    let serveurOk = false;
    try {
      await this.api.urgence();
      serveurOk = true;
    } catch {
      try {
        if (this.matrix.demarre) await this.matrix.client.logout(true);
      } catch {
        /* hors ligne : l'effacement local a lieu quand même */
      }
    }
    await this.revoquer('urgence');
    return { serveurOk };
  }

  private async effacer(motif: MotifRevocation): Promise<void> {
    this.motif.set(motif);
    this.keycloak.oublier();
    this.crypto.oublier();
    this.profil.vider();
    this.envoi.vider();
    this.toasts.vider();

    const rapport = await effacerDonneesLocales({
      // Arrête la synchro et supprime les stores du SDK, dont les bases de la crypto Rust
      // (clés d'identité, sessions Olm, clés Megolm) : plus rien n'est déchiffrable ici.
      arreterClientMatrix: () => this.matrix.arreter(true),
      libererMemoire: () => this.pj.vider(),
      indexedDB: typeof indexedDB !== 'undefined' ? indexedDB : undefined,
      localStorage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      sessionStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
      caches: typeof caches !== 'undefined' ? caches : undefined,
    });
    this.dernierRapport.set(rapport);

    // Le service worker ne garde que l'application (aucune donnée), mais on le désinscrit
    // aussi : l'appareil repart d'un état vierge.
    try {
      const enregistrements = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(enregistrements.map((r) => r.unregister()));
    } catch {
      /* pas de service worker (développement) */
    }

    await this.router.navigate(['/acces-revoque'], { queryParams: { motif }, replaceUrl: true });
  }
}
