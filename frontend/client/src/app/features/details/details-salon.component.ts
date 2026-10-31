import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { KnownMembership, RoomMember } from 'matrix-js-sdk';
import { EntreeAnnuaire } from '../../core/api/modeles';
import { CryptoService } from '../../core/matrix/crypto.service';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { SalonsService } from '../../core/matrix/salons.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { DialogueComponent } from '../../ui/dialogue.component';
import { IconeComponent } from '../../ui/icone.component';
import { RechercheAgentsComponent } from '../annuaire/recherche-agents.component';

interface MembreAffiche {
  id: string;
  nom: string;
  invite: boolean;
  role: 'admin' | 'moderateur' | null;
}

/** Détails d'une conversation : membres (et leur vérification), invitation, départ. */
@Component({
  selector: 'lf-details-salon',
  imports: [RouterLink, TranslocoPipe, AvatarComponent, IconeComponent, DialogueComponent, RechercheAgentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './details-salon.component.html',
  styleUrls: ['../page.scss', './details-salon.component.scss'],
})
export class DetailsSalonComponent {
  private readonly salons = inject(SalonsService);
  private readonly matrix = inject(MatrixClientService);
  private readonly crypto = inject(CryptoService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  readonly roomId = input.required<string>();

  protected readonly membresCharges = signal(false);
  protected readonly verifies = signal<Record<string, boolean | null>>({});
  protected readonly invitationOuverte = signal(false);
  protected readonly invitationEnCours = signal<string | null>(null);
  protected readonly depart = signal(false);
  protected readonly departEnCours = signal(false);

  // L'objet Room du SDK est toujours le MÊME objet (muté en place à chaque synchro) :
  // sans `equal: () => false`, Angular le jugerait inchangé et les écrans dérivés
  // (messages, membres) ne se mettraient pas à jour à l'arrivée d'un message.
  protected readonly room = computed(
    () => {
      this.matrix.version();
      return this.salons.salon(this.roomId());
    },
    { equal: () => false },
  );
  protected readonly resume = computed(() => this.salons.salons().find((s) => s.id === this.roomId()) ?? null);
  protected readonly sujet = computed(() => this.room()?.currentState.getStateEvents('m.room.topic', '')?.getContent()['topic'] ?? '');
  protected readonly peutInviter = computed(() => {
    const r = this.room();
    return !!r && this.resume()?.type !== 'direct' && this.salons.peutInviter(r);
  });

  protected readonly membres = computed<MembreAffiche[]>(() => {
    const r = this.room();
    this.membresCharges();
    if (!r) return [];
    return r
      .getMembers()
      .filter((m) => m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite)
      .map((m: RoomMember) => ({
        id: m.userId,
        nom: m.name || m.userId,
        invite: m.membership === KnownMembership.Invite,
        role: m.powerLevel >= 100 ? ('admin' as const) : m.powerLevel >= 50 ? ('moderateur' as const) : null,
      }))
      .sort((a, b) => Number(a.invite) - Number(b.invite) || a.nom.localeCompare(b.nom, 'fr'));
  });
  protected readonly idsMembres = computed(() => this.membres().map((m) => m.id));

  constructor() {
    // Chargement paresseux des membres (lazy loading) : seulement quand on ouvre cet écran.
    effect(() => {
      const r = this.room();
      if (!r) return;
      untracked(() => {
        void r.loadMembersIfNeeded().then(() => {
          this.membresCharges.set(true);
          void this.verifierMembres();
        });
      });
    });
  }

  private async verifierMembres(): Promise<void> {
    const resultat: Record<string, boolean | null> = {};
    await Promise.all(this.membres().map(async (m) => (resultat[m.id] = await this.crypto.agentVerifie(m.id))));
    this.verifies.set(resultat);
  }

  protected async inviter(agent: EntreeAnnuaire): Promise<void> {
    if (this.idsMembres().includes(agent.matrixId) || this.invitationEnCours()) return;
    this.invitationEnCours.set(agent.matrixId);
    try {
      await this.salons.inviter(this.roomId(), agent.matrixId);
      this.toasts.succes('details.invitation_ok', { nom: agent.nom });
    } catch {
      this.toasts.erreur('details.erreur_invitation');
    } finally {
      this.invitationEnCours.set(null);
    }
  }

  protected async quitter(): Promise<void> {
    this.departEnCours.set(true);
    try {
      await this.salons.quitter(this.roomId());
      this.depart.set(false);
      await this.router.navigate(['/salons']);
    } catch {
      this.toasts.erreur('details.erreur_depart');
    } finally {
      this.departEnCours.set(false);
    }
  }
}
