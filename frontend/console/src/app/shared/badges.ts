import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { Classification, StatutAgent } from '../core/api/models';

/** Statut d'un agent : le libellé porte le sens, la couleur le renforce. */
@Component({
  selector: 'lc-statut',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="lf-badge lf-badge--dot" [class]="classe()">{{ 'statut.' + statut() | transloco }}</span>`,
})
export class BadgeStatut {
  readonly statut = input.required<StatutAgent>();
  protected readonly classe = computed(() => {
    switch (this.statut()) {
      case 'ACTIF':
        return 'lf-badge--success';
      case 'APPAREILS_REVOQUES':
        return 'lf-badge--warning';
      default:
        return 'lf-badge--danger';
    }
  });
}

/** Niveau de classification (composant .lf-cls du design system). */
@Component({
  selector: 'lc-classification',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="lf-cls" [attr.data-cls]="niveau()">{{ 'classification.' + niveau() | transloco }}</span>`,
})
export class BadgeClassification {
  readonly niveau = input.required<Classification>();
}
