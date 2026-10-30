import { joindre } from '../../ui/format';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService, cleErreurApi } from '../../core/api/api.service';
import { EntreeAnnuaire, Ministere } from '../../core/api/modeles';
import { KeycloakService } from '../../core/auth/keycloak.service';
import { CONFIG } from '../../core/config';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { IconeComponent } from '../../ui/icone.component';

/** Identifiant Matrix complet saisi à la main (secours si l'annuaire est indisponible). */
const ID_MATRIX = /^@[a-z0-9._=\-/]+:[a-z0-9.\-]+(:\d+)?$/i;

/**
 * Recherche dans l'annuaire officiel des agents (GET /api/v1/annuaire, paginé).
 * Recherche différée de 300 ms : une requête par pause de frappe, pas par touche (2G/3G).
 */
@Component({
  selector: 'lf-recherche-agents',
  imports: [TranslocoPipe, AvatarComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recherche-agents.component.html',
  styleUrl: './recherche-agents.component.scss',
})
export class RechercheAgentsComponent {
  private readonly api = inject(ApiService);
  private readonly keycloak = inject(KeycloakService);
  private readonly matrix = inject(MatrixClientService);

  /** Identifiants déjà choisis (cochés). */
  readonly choisis = input<string[]>([]);
  /** Libellé de l'action sur chaque ligne (clé i18n). */
  readonly action = input('annuaire.choisir');
  readonly filtreMinistere = input(true);
  readonly choisir = output<EntreeAnnuaire>();

  protected readonly joindre = joindre;
  protected readonly q = signal('');
  protected readonly ministere = signal<string | null>(null);
  protected readonly ministeres = signal<Ministere[]>([]);
  protected readonly resultats = signal<EntreeAnnuaire[]>([]);
  protected readonly page = signal(0);
  protected readonly suivante = signal(false);
  protected readonly total = signal(0);
  protected readonly etat = signal<'chargement' | 'pret' | 'erreur' | 'sans-api'>('chargement');
  protected readonly erreur = signal('erreurs.inconnue');
  protected readonly monId = this.matrix.monId;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private requete = 0;

  constructor() {
    void this.initialiser();
    effect(() => {
      this.q();
      this.ministere();
      untracked(() => {
        if (this.minuterie) clearTimeout(this.minuterie);
        this.minuterie = setTimeout(() => void this.chercher(0), 300);
      });
    });
    inject(DestroyRef).onDestroy(() => this.minuterie && clearTimeout(this.minuterie));
  }

  private async initialiser(): Promise<void> {
    if (!(await this.keycloak.initialiser())) {
      this.etat.set('sans-api');
      return;
    }
    if (this.filtreMinistere()) this.api.ministeres().then((m) => this.ministeres.set(m), () => undefined);
  }

  protected async chercher(page: number): Promise<void> {
    if (!(await this.keycloak.initialiser())) {
      this.etat.set('sans-api');
      return;
    }
    const n = ++this.requete;
    if (page === 0) this.etat.set('chargement');
    try {
      const res = await this.api.annuaire(this.q().trim(), this.ministere(), page);
      if (n !== this.requete) return; // réponse périmée (frappe plus récente)
      this.resultats.update((r) => (page === 0 ? res.elements : [...r, ...res.elements]));
      this.page.set(res.page);
      this.suivante.set(res.pageSuivante);
      this.total.set(res.total);
      this.etat.set('pret');
    } catch (e) {
      if (n !== this.requete) return;
      this.erreur.set(cleErreurApi(e));
      this.etat.set('erreur');
    }
  }

  protected idManuel(): string | null {
    const v = this.q().trim();
    if (ID_MATRIX.test(v)) return v;
    // « prenom.nom » → @prenom.nom:laafi.local
    if (/^[a-z0-9._=-]+$/i.test(v) && v.includes('.')) return `@${v.toLowerCase()}:${CONFIG.serverName}`;
    return null;
  }

  protected choisirManuel(id: string): void {
    this.choisir.emit({ matrixId: id, username: id.slice(1).split(':')[0], nom: id, ministere: null });
  }

  protected seConnecter(): void {
    this.keycloak.seConnecter();
  }
}
