import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { apercu } from '../../core/matrix/messages';
import { ResumeSalon, SalonsService } from '../../core/matrix/salons.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { horodatageCourt } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';

/** Liste des conversations : recherche locale, non-lus, badges de classification, invitations. */
@Component({
  selector: 'lf-liste-salons',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, AvatarComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './liste-salons.component.html',
  styleUrl: './liste-salons.component.scss',
})
export class ListeSalonsComponent {
  private readonly salonsService = inject(SalonsService);
  private readonly matrix = inject(MatrixClientService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly recherche = signal('');
  protected readonly enCours = signal<string | null>(null);
  protected readonly chargement = computed(() => {
    const e = this.matrix.etat();
    return (e === 'demarrage' || e === 'arrete') && this.salonsService.salons().length === 0;
  });

  /** Filtrage local (les noms et messages déchiffrés ne quittent jamais l'appareil). */
  protected readonly salons = computed(() => {
    const q = this.normaliser(this.recherche());
    const tous = this.salonsService.salons();
    if (!q) return tous;
    return tous.filter((s) => this.normaliser(s.nom).includes(q) || this.normaliser(s.dernier?.texte ?? '').includes(q));
  });
  protected readonly invitations = computed(() => this.salons().filter((s) => s.invitation));
  protected readonly conversations = computed(() => this.salons().filter((s) => !s.invitation));

  protected apercu = apercu;
  protected horodatage = horodatageCourt;

  protected icone(s: ResumeSalon): string {
    return s.type === 'canal' ? 'canal' : s.type === 'groupe' ? 'groupe' : 'personne';
  }

  protected nomInvitant(s: ResumeSalon): string {
    return s.invitePar ? this.salonsService.nomAffiche(s.invitePar, this.salonsService.salon(s.id)) : '';
  }

  protected async accepter(s: ResumeSalon): Promise<void> {
    this.enCours.set(s.id);
    try {
      await this.salonsService.accepter(s.id);
      await this.router.navigate(['/salons', s.id]);
    } catch {
      this.toasts.erreur('salons.erreur_accepter');
    } finally {
      this.enCours.set(null);
    }
  }

  protected async refuser(s: ResumeSalon): Promise<void> {
    this.enCours.set(s.id);
    try {
      await this.salonsService.quitter(s.id);
    } catch {
      this.toasts.erreur('salons.erreur_refuser');
    } finally {
      this.enCours.set(null);
    }
  }

  private normaliser(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
