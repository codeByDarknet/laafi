import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../api/api.service';
import { ResultatOperation } from '../api/models';
import { AuthService } from '../auth/auth.service';

/** Longueur minimale d'un motif de révocation (il est journalisé et doit être explicite). */
export const MOTIF_MIN = 10;
export const MOTIF_MAX = 1000;

export interface VerificationRevocation {
  motifValide: boolean;
  confirmationValide: boolean;
  /** Vrai seulement si TOUTES les conditions sont réunies : le bouton « Révoquer » s'active. */
  peutConfirmer: boolean;
}

/** Erreur levée AVANT tout appel réseau si la confirmation forte n'est pas satisfaite. */
export class ConfirmationInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationInvalideError';
  }
}

/**
 * Actions de révocation (épreuve « Révocation » du jury).
 *
 * Révocation totale (départ, faute, compromission) — côté backend :
 *   1. Keycloak : compte désactivé + fermeture de TOUTES les sessions + attribut enrole=false ;
 *   2. Synapse : désactivation du compte Matrix → suppression des appareils et des jetons d'accès,
 *      départ de tous les salons. Les autres membres des salons constatent ce départ et leurs
 *      clients font tourner la clé de groupe Megolm : l'agent révoqué ne peut PAS déchiffrer les
 *      messages envoyés après sa révocation (il n'a ni jeton, ni appareil, ni nouvelle clé).
 *
 * Perte de téléphone : suppression de tous les appareils Matrix + déconnexion Keycloak, mais le
 * compte reste actif ; l'agent se reconnecte avec mot de passe + TOTP sur un nouvel appareil.
 *
 * Ce service porte aussi la « confirmation forte » : motif obligatoire ET saisie exacte de
 * l'identifiant de l'agent, pour éviter une révocation par erreur de ligne ou de clic.
 */
@Injectable({ providedIn: 'root' })
export class RevocationService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Vérifie la confirmation forte (fonction pure, utilisée par le formulaire et avant l'appel API). */
  verifier(username: string, saisieUsername: string, motif: string): VerificationRevocation {
    const m = motif.trim();
    const motifValide = m.length >= MOTIF_MIN && m.length <= MOTIF_MAX;
    // Comparaison exacte (sensible à la casse) : l'administrateur doit recopier l'identifiant.
    const confirmationValide = username.length > 0 && saisieUsername.trim() === username;
    return { motifValide, confirmationValide, peutConfirmer: motifValide && confirmationValide };
  }

  /** Révocation totale. Refuse d'appeler l'API si la confirmation forte n'est pas valide. */
  async revoquer(username: string, saisieUsername: string, motif: string): Promise<ResultatOperation> {
    const v = this.verifier(username, saisieUsername, motif);
    if (!v.motifValide) {
      throw new ConfirmationInvalideError(`Le motif est obligatoire (${MOTIF_MIN} caractères minimum).`);
    }
    if (!v.confirmationValide) {
      throw new ConfirmationInvalideError('L’identifiant saisi ne correspond pas à l’agent.');
    }
    return firstValueFrom(this.api.revoquer(username, motif.trim()));
  }

  /** Perte de téléphone : le motif est facultatif mais transmis s'il est renseigné. */
  revoquerAppareils(username: string, motif?: string): Promise<ResultatOperation> {
    const m = motif?.trim();
    return firstValueFrom(this.api.revoquerAppareils(username, m || undefined));
  }

  /** Réactivation : réservée au super_admin (contrôle d'interface, refait par le backend). */
  async reactiver(username: string, motif?: string): Promise<ResultatOperation> {
    if (!this.auth.estSuperAdmin()) {
      throw new ConfirmationInvalideError('Seul un super-administrateur peut réactiver un agent.');
    }
    const m = motif?.trim();
    return firstValueFrom(this.api.reactiver(username, m || undefined));
  }
}
