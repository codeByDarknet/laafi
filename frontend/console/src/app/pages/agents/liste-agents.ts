import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { AgentResume, StatutAgent } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel.service';
import { BadgeStatut } from '../../shared/badges';
import { Icone } from '../../shared/icone';

const TAILLE_PAGE = 20;
const STATUTS: StatutAgent[] = ['ACTIF', 'APPAREILS_REVOQUES', 'REVOQUE'];

/** Supprime les accents pour une recherche tolérante (« Ouédraogo » = « ouedraogo »). */
function normaliser(s: string | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Liste des agents. GET /agents renvoie une liste non paginée, déjà restreinte par le
 * backend au ministère de l'admin_ministere : le filtrage fin et la pagination se font
 * ici, sans nouvel appel réseau. Les filtres sont reflétés dans l'URL (lien partageable).
 */
@Component({
  selector: 'lc-liste-agents',
  imports: [RouterLink, DatePipe, TranslocoPipe, Icone, BadgeStatut],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './liste-agents.html',
  styles: `
    .compte { color: var(--lf-ink-2); }
    .reinit { align-self: end; }
    td .lf-mono { font-size: var(--lf-text-xs); }
  `,
})
export class ListeAgents {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);
  protected readonly statuts = STATUTS;

  /** Paramètres de requête liés par le routeur (withComponentInputBinding). */
  readonly statut = input<string>();
  readonly ministere = input<string>();
  readonly q = input<string>();

  protected readonly recherche = signal('');
  protected readonly filtreStatut = signal<StatutAgent | ''>('');
  protected readonly filtreMinistere = signal('');
  protected readonly page = signal(0);

  protected readonly agents = signal<AgentResume[] | null>(null);
  protected readonly erreur = signal<string | null>(null);

  protected readonly filtres = computed(() => {
    const q = normaliser(this.recherche().trim());
    const statut = this.filtreStatut();
    const min = this.auth.ministereImpose() ?? this.filtreMinistere();
    return (this.agents() ?? []).filter(
      (a) =>
        (!statut || a.statut === statut) &&
        (!min || a.ministere === min) &&
        (!q ||
          [a.nomComplet, a.prenom, a.nom, a.username, a.matricule, a.fonction, a.direction, a.email].some((v) =>
            normaliser(v).includes(q),
          )),
    );
  });

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtres().length / TAILLE_PAGE)));
  protected readonly visibles = computed(() => {
    const p = Math.min(this.page(), this.pages() - 1);
    return this.filtres().slice(p * TAILLE_PAGE, (p + 1) * TAILLE_PAGE);
  });
  protected readonly debut = computed(() => (this.filtres().length ? Math.min(this.page(), this.pages() - 1) * TAILLE_PAGE + 1 : 0));
  protected readonly fin = computed(() => this.debut() + this.visibles().length - (this.visibles().length ? 1 : 0));
  protected readonly filtreActif = computed(() => !!(this.recherche() || this.filtreStatut() || this.filtreMinistere()));

  constructor() {
    // Les paramètres d'URL initialisent les filtres (ex. lien depuis le tableau de bord).
    // Un effet par paramètre : changer le statut ne doit pas effacer la recherche en cours.
    effect(() => {
      const s = this.statut();
      this.filtreStatut.set(STATUTS.includes(s as StatutAgent) ? (s as StatutAgent) : '');
      this.page.set(0);
    });
    effect(() => {
      this.filtreMinistere.set(this.ministere() ?? '');
      this.page.set(0);
    });
    effect(() => {
      const q = this.q();
      if (q !== undefined) this.recherche.set(q);
    });
    this.charger();
  }

  protected charger(): void {
    this.agents.set(null);
    this.erreur.set(null);
    this.api.agents().subscribe({
      next: (l) => this.agents.set([...l].sort((a, b) => (a.nomComplet ?? a.username).localeCompare(b.nomComplet ?? b.username, 'fr'))),
      error: (e) => this.erreur.set(messageErreur(e, (c) => this.t.translate(c))),
    });
  }

  protected majFiltre(cle: 'q' | 'statut' | 'ministere', valeur: string): void {
    this.page.set(0);
    if (cle === 'q') {
      // La recherche reste locale (pas de navigation à chaque frappe).
      this.recherche.set(valeur);
      return;
    }
    if (cle === 'statut') this.filtreStatut.set(valeur as StatutAgent | '');
    if (cle === 'ministere') this.filtreMinistere.set(valeur);
    void this.router.navigate([], {
      queryParams: { [cle]: valeur || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reinitialiser(): void {
    this.recherche.set('');
    this.filtreStatut.set('');
    this.filtreMinistere.set('');
    this.page.set(0);
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected ouvrir(a: AgentResume, ev: MouseEvent): void {
    // Toute la ligne est cliquable, mais on laisse vivre les vrais liens (ctrl+clic, etc.).
    if ((ev.target as HTMLElement).closest('a, button')) return;
    void this.router.navigate(['/agents', a.username]);
  }

  protected initiales(a: AgentResume): string {
    const p = (a.prenom ?? a.username)[0] ?? '';
    const n = (a.nom ?? a.username.split('.')[1] ?? '')[0] ?? '';
    return (p + n).toUpperCase();
  }

  protected teinte(a: AgentResume): number {
    let h = 0;
    for (const c of a.username) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 5) + 1;
  }
}
