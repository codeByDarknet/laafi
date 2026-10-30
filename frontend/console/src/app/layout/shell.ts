import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthService } from '../core/auth/auth.service';
import { ReferentielService } from '../core/referentiel.service';
import { Icone } from '../shared/icone';

interface EntreeNav {
  lien: string;
  cle: string;
  icone: string;
}

interface GroupeNav {
  cle: string;
  entrees: EntreeNav[];
}

/** Gabarit de la console : barre d'application, navigation latérale, zone de contenu. */
@Component({
  selector: 'lc-shell',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly groupes: GroupeNav[] = [
    {
      cle: 'nav.groupe.pilotage',
      entrees: [{ lien: '/tableau-de-bord', cle: 'nav.tableau', icone: 'tableau' }],
    },
    {
      cle: 'nav.groupe.agents',
      entrees: [
        { lien: '/agents', cle: 'nav.agents', icone: 'agents' },
        { lien: '/agents/enroler', cle: 'nav.enroler', icone: 'enroler' },
      ],
    },
    {
      cle: 'nav.groupe.communication',
      entrees: [
        { lien: '/canaux', cle: 'nav.canaux', icone: 'canaux' },
        { lien: '/politiques', cle: 'nav.politiques', icone: 'politiques' },
      ],
    },
    {
      cle: 'nav.groupe.tracabilite',
      entrees: [
        { lien: '/journal', cle: 'nav.journal', icone: 'journal' },
        { lien: '/audit', cle: 'nav.audit', icone: 'audit' },
      ],
    },
  ];

  /** Libellé du périmètre : national (DGTD) pour le super_admin, ministère sinon. */
  protected readonly perimetre = computed(() => {
    const u = this.auth.utilisateur();
    if (this.auth.estSuperAdmin()) return null;
    return u?.ministere ?? null;
  });

  protected readonly roleAffiche = computed(() =>
    this.auth.estSuperAdmin() ? 'role.super_admin' : 'role.admin_ministere',
  );

  protected readonly initiales = computed(() => {
    const nom = this.auth.utilisateur()?.nom ?? '';
    return (
      nom
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || '?'
    );
  });

  constructor() {
    void this.referentiel.charger();
  }

  /** « Agents » reste actif sur une fiche agent, mais pas sur le formulaire d'enrôlement. */
  protected estActif(lien: string): boolean {
    const chemin = this.url().split(/[?#]/)[0];
    if (lien === '/agents') return chemin === '/agents' || (chemin.startsWith('/agents/') && chemin !== '/agents/enroler');
    return chemin === lien || chemin.startsWith(`${lien}/`);
  }

  protected deconnexion(): void {
    void this.auth.deconnexion();
  }
}
