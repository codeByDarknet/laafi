import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { ProfilService } from '../../core/profil/profil.service';
import { ReseauService } from '../../core/ui/reseau.service';
import { IconeComponent } from '../../ui/icone.component';
import { ListeSalonsComponent } from '../salons/liste-salons.component';

/**
 * Coquille de l'application connectée.
 * Mobile : une colonne (la liste OU l'écran ouvert). Bureau (≥ 1024 px) : deux colonnes.
 */
@Component({
  selector: 'lf-coquille',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, IconeComponent, ListeSalonsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './coquille.component.html',
  styleUrl: './coquille.component.scss',
})
export class CoquilleComponent {
  private readonly router = inject(Router);
  protected readonly reseau = inject(ReseauService);
  protected readonly profil = inject(ProfilService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Sur mobile, la liste n'est visible que sur /salons. */
  protected readonly surListe = computed(() => (this.url().split('?')[0] ?? '') === '/salons');

  protected relancer(): void {
    this.reseau.relancer();
  }
}
