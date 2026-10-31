import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconeComponent } from '../../ui/icone.component';

/** Panneau de droite (bureau) quand aucune conversation n'est ouverte. */
@Component({
  selector: 'lf-accueil-salons',
  imports: [RouterLink, TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lf-empty vide">
      <lf-icone class="lf-empty__art" nom="cadenas" [taille]="72" />
      <h2 class="lf-empty__title">{{ 'salons.aucun_ouvert_titre' | transloco }}</h2>
      <p class="lf-empty__text">{{ 'salons.aucun_ouvert_texte' | transloco }}</p>
      <a routerLink="/nouveau" class="lf-btn lf-btn--primary">
        <lf-icone nom="plus" />
        {{ 'salons.nouvelle' | transloco }}
      </a>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      flex: 1;
      place-items: center;
    }
  `,
})
export class AccueilSalonsComponent {}
