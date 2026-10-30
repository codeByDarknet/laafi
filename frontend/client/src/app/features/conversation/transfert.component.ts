import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { KnownMembership } from 'matrix-js-sdk';
import { ApiService } from '../../core/api/api.service';
import { Regles, transfertAutorise } from '../../core/classification/classification';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { MessageAffiche } from '../../core/matrix/messages';
import { ResumeSalon, SalonsService } from '../../core/matrix/salons.service';
import { ProfilService } from '../../core/profil/profil.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { DialogueComponent } from '../../ui/dialogue.component';
import { IconeComponent } from '../../ui/icone.component';

/**
 * Transfert d'un message. Contrôle de la politique AVANT l'envoi :
 *  - CONFIDENTIEL : interdit (le bouton n'apparaît même pas) ;
 *  - DIFFUSION_RESTREINTE : uniquement vers un salon dont TOUS les membres sont du ministère
 *    de l'émetteur. Le ministère de chaque membre vient de l'annuaire officiel (/api/v1/annuaire),
 *    pas de ce que les membres déclarent eux-mêmes.
 * NB : contrôle côté client (dissuasif) ; un client Matrix modifié pourrait le contourner,
 * d'où le filigrane et le journal d'audit en complément.
 */
@Component({
  selector: 'lf-transfert',
  imports: [TranslocoPipe, DialogueComponent, AvatarComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <lf-dialogue [ouvert]="!!message()" [titre]="'transfert.titre' | transloco" [bloque]="enCours() !== null" (ferme)="fermer()">
      @if (message(); as m) {
        @if (regles().transfert === 'INTERNE_MINISTERE') {
          <div class="lf-alert lf-alert--warning">
            <lf-icone nom="bouclierAlerte" />
            <div>{{ 'transfert.dr_regle' | transloco: { ministere: profil.profil()?.ministere ?? '—' } }}</div>
          </div>
        }
        @if (erreur(); as e) {
          <div class="lf-alert lf-alert--danger" role="alert">
            <lf-icone nom="alerte" />
            <div>{{ e | transloco }}</div>
          </div>
        }
        @if (cibles().length) {
          <ul class="lf-list lf-list--divided cibles">
            @for (s of cibles(); track s.id) {
              <li>
                <button type="button" class="lf-list__item" [disabled]="enCours() !== null" [attr.aria-busy]="enCours() === s.id" (click)="transferer(m, s)">
                  <lf-avatar [nom]="s.nom" [id]="s.correspondant || s.id" [groupe]="s.type !== 'direct'" taille="sm" />
                  <span class="lf-list__body">
                    <span class="lf-list__title">{{ s.nom }}</span>
                  </span>
                  @if (enCours() === s.id) {
                    <span class="lf-spinner" aria-hidden="true"></span>
                  } @else {
                    <lf-icone nom="transferer" [taille]="18" />
                  }
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="lf-muted">{{ 'transfert.aucune_cible' | transloco }}</p>
        }
      }
    </lf-dialogue>
  `,
  styles: `
    .cibles {
      margin-top: var(--lf-space-3);
      max-height: 50dvh;
      overflow-y: auto;
    }
    .lf-alert {
      margin-bottom: var(--lf-space-2);
    }
  `,
})
export class TransfertComponent {
  private readonly salons = inject(SalonsService);
  private readonly matrix = inject(MatrixClientService);
  private readonly api = inject(ApiService);
  protected readonly profil = inject(ProfilService);
  private readonly toasts = inject(ToastService);

  readonly message = input<MessageAffiche | null>(null);
  readonly regles = input.required<Regles>();
  readonly roomSource = input.required<string>();
  readonly ferme = output<void>();

  protected readonly enCours = signal<string | null>(null);
  protected readonly erreur = signal<string | null>(null);
  private membresMinistere: Promise<Set<string>> | null = null;

  protected readonly cibles = computed(() =>
    this.salons.salons().filter((s) => !s.invitation && s.id !== this.roomSource() && this.peutPublierDans(s.id)),
  );

  protected fermer(): void {
    this.erreur.set(null);
    this.ferme.emit();
  }

  protected async transferer(m: MessageAffiche, cible: ResumeSalon): Promise<void> {
    this.erreur.set(null);
    this.enCours.set(cible.id);
    try {
      if (!(await this.verifierPolitique(cible.id))) {
        this.erreur.set('transfert.refuse_dr');
        return;
      }
      await this.salons.transferer(m, cible.id);
      this.toasts.succes('transfert.ok', { nom: cible.nom });
      this.fermer();
    } catch {
      this.erreur.set('transfert.erreur');
    } finally {
      this.enCours.set(null);
    }
  }

  private peutPublierDans(roomId: string): boolean {
    const room = this.salons.salon(roomId);
    return !!room && this.salons.peutPublier(room);
  }

  private async verifierPolitique(roomId: string): Promise<boolean> {
    const transfert = this.regles().transfert;
    if (transfert !== 'INTERNE_MINISTERE') return transfertAutorise(transfert, null, []);
    const monMinistere = this.profil.profil()?.ministere ?? null;
    if (!monMinistere) return false;
    const room = this.salons.salon(roomId);
    if (!room) return false;
    await room.loadMembersIfNeeded();
    const membres = room
      .getMembers()
      .filter((mb) => mb.membership === KnownMembership.Join || mb.membership === KnownMembership.Invite)
      .map((mb) => mb.userId);
    const duMinistere = await this.chargerMinistere(monMinistere);
    const moi = this.matrix.monId;
    return transfertAutorise(
      transfert,
      monMinistere,
      membres.map((id) => (id === moi || duMinistere.has(id) ? monMinistere : null)),
    );
  }

  /** Tous les agents du ministère d'après l'annuaire (pages successives, mis en cache). */
  private chargerMinistere(ministere: string): Promise<Set<string>> {
    if (!this.membresMinistere) {
      this.membresMinistere = (async () => {
        const ids = new Set<string>();
        for (let page = 0; page < 50; page++) {
          const res = await this.api.annuaire('', ministere, page);
          res.elements.forEach((e) => ids.add(e.matrixId));
          if (!res.pageSuivante) break;
        }
        return ids;
      })();
      this.membresMinistere.catch(() => (this.membresMinistere = null));
    }
    return this.membresMinistere;
  }
}
