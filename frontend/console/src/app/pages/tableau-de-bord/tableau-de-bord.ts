import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { AgentResume, EvenementAudit, RapportVerification } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel.service';
import { BadgeStatut } from '../../shared/badges';
import { Icone } from '../../shared/icone';

/** Fenêtre des « enrôlements récents ». */
const JOURS_RECENTS = 30;

@Component({
  selector: 'lc-tableau-de-bord',
  imports: [RouterLink, DatePipe, TranslocoPipe, Icone, BadgeStatut],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tableau-de-bord.html',
  styleUrl: './tableau-de-bord.scss',
})
export class TableauDeBord {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);

  protected readonly joursRecents = JOURS_RECENTS;

  protected readonly agents = signal<AgentResume[] | null>(null);
  protected readonly erreurAgents = signal<string | null>(null);
  protected readonly rapport = signal<RapportVerification | null>(null);
  protected readonly erreurJournal = signal<string | null>(null);
  protected readonly verificationEnCours = signal(false);
  protected readonly audit = signal<EvenementAudit[] | null>(null);
  protected readonly erreurAudit = signal<string | null>(null);

  protected readonly chiffres = computed(() => {
    const l = this.agents();
    if (!l) return null;
    const limite = Date.now() - JOURS_RECENTS * 24 * 3600 * 1000;
    return {
      actifs: l.filter((a) => a.statut === 'ACTIF').length,
      revoques: l.filter((a) => a.statut === 'REVOQUE').length,
      appareilsRevoques: l.filter((a) => a.statut === 'APPAREILS_REVOQUES').length,
      recents: l.filter((a) => a.creeLe && Date.parse(a.creeLe) >= limite).length,
      total: l.length,
    };
  });

  protected readonly derniersEnroles = computed(() =>
    [...(this.agents() ?? [])]
      .filter((a) => !!a.creeLe)
      .sort((a, b) => Date.parse(b.creeLe!) - Date.parse(a.creeLe!))
      .slice(0, 6),
  );

  constructor() {
    this.charger();
  }

  protected charger(): void {
    const tr = (cle: string) => this.t.translate(cle);
    this.agents.set(null);
    this.erreurAgents.set(null);
    this.api.agents().subscribe({
      next: (l) => this.agents.set(l),
      error: (e) => this.erreurAgents.set(messageErreur(e, tr)),
    });
    this.audit.set(null);
    this.erreurAudit.set(null);
    this.api.audit(0).subscribe({
      next: (p) => this.audit.set(p.elements.slice(0, 8)),
      error: (e) => this.erreurAudit.set(messageErreur(e, tr)),
    });
    this.verifier();
  }

  protected verifier(): void {
    this.verificationEnCours.set(true);
    this.erreurJournal.set(null);
    this.api.verifierJournal().subscribe({
      next: (r) => {
        this.rapport.set(r);
        this.verificationEnCours.set(false);
      },
      error: (e) => {
        this.erreurJournal.set(messageErreur(e, (c) => this.t.translate(c)));
        this.verificationEnCours.set(false);
      },
    });
  }

  protected libelleAction(action: string): string {
    const cle = `audit.action.${action}`;
    const traduit = this.t.translate(cle);
    return traduit === cle ? action : traduit;
  }
}
