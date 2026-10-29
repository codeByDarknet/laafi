import { Injectable, effect, inject, signal } from '@angular/core';
import { PolitiquesService } from '../classification/politiques.service';
import { ExpirationService } from '../classification/expiration.service';
import { CryptoService } from '../matrix/crypto.service';
import { MatrixClientService } from '../matrix/matrix-client.service';
import { ProfilService } from '../profil/profil.service';
import { RevocationService } from '../security/revocation.service';
import { motifDeRevocation } from '../security/revocation';
import { ReseauService } from '../ui/reseau.service';
import { KeycloakService } from './keycloak.service';
import { lireSession } from './session';
import { SsoService } from './sso.service';

export type EtatAuth = 'initialisation' | 'connexion' | 'deconnecte' | 'connecte' | 'erreur';

/**
 * Chef d'orchestre du démarrage :
 *  retour SSO ? → échange du loginToken → session ;
 *  session ?    → client Matrix + crypto Rust + synchro ;
 *  ensuite      → JWT Keycloak silencieux → profil, politiques (non bloquant).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sso = inject(SsoService);
  private readonly matrix = inject(MatrixClientService);
  private readonly crypto = inject(CryptoService);
  private readonly keycloak = inject(KeycloakService);
  private readonly profil = inject(ProfilService);
  private readonly politiques = inject(PolitiquesService);
  private readonly expiration = inject(ExpirationService);
  private readonly reseau = inject(ReseauService);
  private readonly revocation = inject(RevocationService);

  readonly etat = signal<EtatAuth>('initialisation');
  readonly cleErreur = signal<string | null>(null);
  private demarrage: Promise<EtatAuth> | null = null;

  constructor() {
    this.matrix.surRevocation = (motif) => void this.revocation.revoquer(motif);
    // Au retour du réseau (synchro rétablie), on renvoie la file d'attente.
    let precedent = this.matrix.etat();
    effect(() => {
      const etat = this.matrix.etat();
      if (etat === 'pret' && precedent === 'hors-ligne') this.reseau.relancer();
      if (etat === 'pret' && precedent !== 'pret') void this.crypto.rafraichir();
      precedent = etat;
    });
  }

  /** Promesse résolue quand l'état d'authentification est connu (utilisée par les gardes). */
  pret(): Promise<EtatAuth> {
    if (!this.demarrage) this.demarrage = this.demarrer();
    return this.demarrage;
  }

  connexion(): void {
    this.etat.set('connexion');
    this.sso.demarrer();
  }

  private async demarrer(): Promise<EtatAuth> {
    const loginToken = this.sso.extraireLoginToken();
    if (loginToken) {
      this.etat.set('connexion');
      try {
        await this.sso.echangerLoginToken(loginToken);
      } catch {
        this.cleErreur.set('accueil.erreur_jeton');
        this.etat.set('erreur');
        return 'erreur';
      }
    }

    const session = lireSession();
    if (!session) {
      this.etat.set('deconnecte');
      return 'deconnecte';
    }

    try {
      await this.matrix.demarrer(session, this.crypto.callbacks());
    } catch (e) {
      const motif = motifDeRevocation(e);
      if (motif) {
        await this.revocation.revoquer(motif);
        return 'deconnecte';
      }
      this.cleErreur.set('accueil.erreur_demarrage');
      this.etat.set('erreur');
      return 'erreur';
    }

    this.etat.set('connecte');
    this.reseau.demarrer();
    this.expiration.demarrer();
    void this.keycloak.initialiser().then(async (ok) => {
      if (ok) await Promise.all([this.profil.charger(), this.politiques.charger()]);
    });
    return 'connecte';
  }
}
