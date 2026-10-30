import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { EvenementAudit, Page } from '../../core/api/models';
import { ReferentielService } from '../../core/referentiel.service';
import { Icone } from '../../shared/icone';

const ACTIONS_AGENT = new Set(['ENROLEMENT', 'REVOCATION_TOTALE', 'REVOCATION_APPAREILS', 'REACTIVATION', 'URGENCE']);

/**
 * Journal d'audit administratif : qui a fait quoi, sur qui, quand et pourquoi.
 * Il ne contient JAMAIS de contenu de message (le serveur ne peut d'ailleurs pas le lire).
 * Le backend restreint déjà la vue d'un admin_ministere à son ministère.
 */
@Component({
  selector: 'lc-audit',
  imports: [RouterLink, DatePipe, TranslocoPipe, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit.html',
  styles: `
    .motif { max-width: 28rem; color: var(--lf-ink-2); overflow-wrap: anywhere; }
    .lf-badge[data-action='REVOCATION_TOTALE'] { background: var(--lf-danger-soft); color: var(--lf-danger-text); }
    .lf-badge[data-action='REVOCATION_APPAREILS'], .lf-badge[data-action='URGENCE'] { background: var(--lf-warning-soft); color: var(--lf-warning-text); }
    .lf-badge[data-action='ENROLEMENT'], .lf-badge[data-action='REACTIVATION'] { background: var(--lf-accent-soft); color: var(--lf-accent-soft-text); }
    td a { color: var(--lf-accent-text); }
  `,
})
export class Audit {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  protected readonly referentiel = inject(ReferentielService);

  protected readonly page = signal<Page<EvenementAudit> | null>(null);
  protected readonly numero = signal(0);
  protected readonly erreur = signal<string | null>(null);
  protected readonly chargement = signal(false);
  protected readonly totalPages = computed(() => {
    const p = this.page();
    return p?.total != null && p.taille ? Math.max(1, Math.ceil(p.total / p.taille)) : null;
  });

  constructor() {
    this.charger(0);
  }

  protected charger(n: number): void {
    this.chargement.set(true);
    this.erreur.set(null);
    this.api.audit(n).subscribe({
      next: (p) => {
        this.page.set(p);
        this.numero.set(n);
        this.chargement.set(false);
      },
      error: (e) => {
        this.erreur.set(messageErreur(e, (c) => this.t.translate(c)));
        this.chargement.set(false);
      },
    });
  }

  protected cibleAgent(ev: EvenementAudit): boolean {
    return !!ev.cible && ACTIONS_AGENT.has(ev.action);
  }

  protected libelleAction(action: string): string {
    const cle = `audit.action.${action}`;
    const traduit = this.t.translate(cle);
    return traduit === cle ? action : traduit;
  }
}
