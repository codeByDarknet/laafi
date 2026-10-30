import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Regles } from '../../core/classification/classification';
import { ExpirationService } from '../../core/classification/expiration.service';
import { AccusesService } from '../../core/instruction/accuses.service';
import { cleErreurApi } from '../../core/api/api.service';
import { KeycloakService } from '../../core/auth/keycloak.service';
import { MessageAffiche } from '../../core/matrix/messages';
import { SalonsService } from '../../core/matrix/salons.service';
import { ToastService } from '../../core/ui/toast.service';
import { heure } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';
import { PieceJointeComponent } from './piece-jointe.component';

const RELATIF = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** Une bulle de message, avec les protections dictées par sa classification. */
@Component({
  selector: 'lf-message',
  imports: [TranslocoPipe, IconeComponent, PieceJointeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss',
  host: {
    '[class.sortant]': 'message().sortant',
  },
})
export class MessageComponent {
  private readonly salons = inject(SalonsService);
  private readonly accuses = inject(AccusesService);
  private readonly keycloak = inject(KeycloakService);
  private readonly toasts = inject(ToastService);
  private readonly expiration = inject(ExpirationService);

  readonly message = input.required<MessageAffiche>();
  readonly regles = input.required<Regles>();
  readonly auteur = input<string | null>(null);
  readonly roomId = input.required<string>();

  readonly transferer = output<MessageAffiche>();
  readonly voirAccuses = output<MessageAffiche>();
  readonly supprimer = output<MessageAffiche>();

  protected readonly envoiAccuse = signal(false);
  protected readonly heure = computed(() => heure(this.message().horodatage));
  protected readonly reconnue = computed(() => this.accuses.dejaReconnue(this.message().eventId));
  protected readonly lisible = computed(() => {
    const g = this.message().genre;
    return g !== 'supprime' && g !== 'indechiffrable' && g !== 'dechiffrement' && g !== 'inconnu';
  });
  protected readonly peutTransferer = computed(
    () => this.lisible() && this.regles().transfert !== 'INTERDIT' && this.message().statut === 'envoye',
  );

  /** « expire dans 3 jours » : recalculé toutes les 15 s par ExpirationService. */
  protected readonly expireDans = computed(() => {
    const e = this.message().expireAt;
    if (!e) return null;
    const ms = e - this.expiration.maintenant();
    const minutes = Math.round(ms / 60000);
    if (Math.abs(minutes) < 60) return RELATIF.format(minutes, 'minute');
    const heures = Math.round(minutes / 60);
    if (Math.abs(heures) < 48) return RELATIF.format(heures, 'hour');
    return RELATIF.format(Math.round(heures / 24), 'day');
  });

  /** Copie interdite : on bloque copier, couper, menu contextuel et glisser-déposer. */
  protected bloquer(evt: Event): void {
    if (!this.regles().copieAutorisee) evt.preventDefault();
  }

  /**
   * « J'en ai pris connaissance » : on calcule l'empreinte SHA-256 du contenu DÉCHIFFRÉ
   * (JSON canonique) et on l'envoie au journal probant. Le serveur n'a jamais le texte : il
   * horodate et chaîne l'empreinte. Plus tard, l'émetteur peut prouver QUEL texte a été reconnu.
   */
  protected async prendreConnaissance(): Promise<void> {
    if (this.envoiAccuse()) return;
    this.envoiAccuse.set(true);
    try {
      if (!(await this.keycloak.initialiser())) {
        this.toasts.erreur('instruction.session_api', undefined, {
          cle: 'instruction.se_connecter',
          faire: () => this.keycloak.seConnecter(),
        });
        return;
      }
      await this.accuses.prendreConnaissance(this.roomId(), this.message().evenement);
      this.toasts.succes('instruction.accuse_ok');
    } catch (e) {
      this.toasts.erreur(cleErreurApi(e));
    } finally {
      this.envoiAccuse.set(false);
    }
  }

  protected renvoyer(): void {
    void this.salons.renvoyer(this.message()).catch(() => this.toasts.erreur('conversation.erreur_envoi'));
  }

  protected annuler(): void {
    this.salons.annulerEnvoi(this.message());
  }
}
