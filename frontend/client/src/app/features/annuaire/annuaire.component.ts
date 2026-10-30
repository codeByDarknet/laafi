import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntreeAnnuaire } from '../../core/api/modeles';
import { SalonsService } from '../../core/matrix/salons.service';
import { ToastService } from '../../core/ui/toast.service';
import { IconeComponent } from '../../ui/icone.component';
import { RechercheAgentsComponent } from './recherche-agents.component';

/** Annuaire officiel : trouver un agent et lui écrire (discussion directe chiffrée). */
@Component({
  selector: 'lf-annuaire',
  imports: [RouterLink, TranslocoPipe, IconeComponent, RechercheAgentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="entete">
      <a routerLink="/salons" class="lf-btn lf-btn--ghost lf-btn--icon retour" [attr.aria-label]="'commun.retour' | transloco">
        <lf-icone nom="retour" />
      </a>
      <h1>{{ 'annuaire.titre' | transloco }}</h1>
    </header>
    <div class="page">
      <p class="lf-muted intro">{{ 'annuaire.intro' | transloco }}</p>
      @if (ouverture()) {
        <p class="lf-muted" role="status"><span class="lf-spinner petit" aria-hidden="true"></span> {{ 'annuaire.ouverture' | transloco }}</p>
      }
      <lf-recherche-agents action="annuaire.ecrire" (choisir)="ecrire($event)" />
    </div>
  `,
  styleUrl: '../page.scss',
})
export class AnnuaireComponent {
  private readonly salons = inject(SalonsService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly ouverture = signal(false);

  protected async ecrire(agent: EntreeAnnuaire): Promise<void> {
    if (this.ouverture()) return;
    this.ouverture.set(true);
    try {
      const roomId = await this.salons.creerDirect(agent.matrixId);
      await this.router.navigate(['/salons', roomId]);
    } catch {
      this.toasts.erreur('nouveau.erreur_creation');
    } finally {
      this.ouverture.set(false);
    }
  }
}
