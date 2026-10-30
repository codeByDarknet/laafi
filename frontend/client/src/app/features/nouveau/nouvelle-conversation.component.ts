import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api/api.service';
import { EntreeAnnuaire } from '../../core/api/modeles';
import { SalonsService } from '../../core/matrix/salons.service';
import { ProfilService } from '../../core/profil/profil.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { IconeComponent } from '../../ui/icone.component';
import { RechercheAgentsComponent } from '../annuaire/recherche-agents.component';

type Onglet = 'direct' | 'groupe' | 'canal';

/**
 * Nouvelle conversation : directe (1-à-1), groupe, ou canal institutionnel (réservé aux
 * responsables : chef de service, admin ministère). Tous les salons sont créés chiffrés,
 * sur invitation, sans accès invité et sans historique visible avant l'arrivée d'un membre.
 */
@Component({
  selector: 'lf-nouvelle-conversation',
  imports: [RouterLink, TranslocoPipe, IconeComponent, AvatarComponent, RechercheAgentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nouvelle-conversation.component.html',
  styleUrls: ['../page.scss', './nouvelle-conversation.component.scss'],
})
export class NouvelleConversationComponent {
  private readonly salons = inject(SalonsService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly profil = inject(ProfilService);

  protected readonly onglet = signal<Onglet>('direct');
  protected readonly nom = signal('');
  protected readonly sujet = signal('');
  protected readonly membres = signal<EntreeAnnuaire[]>([]);
  protected readonly creation = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly ids = computed(() => this.membres().map((m) => m.matrixId));
  protected readonly onglets = computed<Onglet[]>(() =>
    this.profil.peutCreerCanal() ? ['direct', 'groupe', 'canal'] : ['direct', 'groupe'],
  );
  protected readonly valide = computed(() => this.nom().trim().length >= 2);

  protected changerOnglet(o: Onglet): void {
    this.onglet.set(o);
    this.erreur.set(null);
  }

  protected touche(evt: KeyboardEvent): void {
    const liste = this.onglets();
    const i = liste.indexOf(this.onglet());
    const suivant = evt.key === 'ArrowRight' ? i + 1 : evt.key === 'ArrowLeft' ? i - 1 : null;
    if (suivant === null) return;
    evt.preventDefault();
    const o = liste[(suivant + liste.length) % liste.length];
    this.changerOnglet(o);
    (document.getElementById(`onglet-${o}`) as HTMLElement | null)?.focus();
  }

  protected async choisir(agent: EntreeAnnuaire): Promise<void> {
    if (this.onglet() === 'direct') {
      await this.executer(() => this.salons.creerDirect(agent.matrixId));
      return;
    }
    this.membres.update((l) =>
      l.some((m) => m.matrixId === agent.matrixId) ? l.filter((m) => m.matrixId !== agent.matrixId) : [...l, agent],
    );
  }

  protected retirer(id: string): void {
    this.membres.update((l) => l.filter((m) => m.matrixId !== id));
  }

  protected async creer(): Promise<void> {
    if (!this.valide()) return;
    const nom = this.nom().trim();
    const sujet = this.sujet().trim() || undefined;
    if (this.onglet() === 'groupe') {
      await this.executer(() => this.salons.creerGroupe(nom, this.ids(), sujet));
      return;
    }
    await this.executer(async () => {
      const roomId = await this.salons.creerCanal(nom, this.ids(), sujet);
      // Déclaration au backend : le canal apparaît dans le registre officiel du ministère.
      try {
        await this.api.declarerCanal({ roomId, nom, ministere: this.profil.profil()?.ministere ?? null, description: sujet ?? null });
      } catch {
        this.toasts.afficher('attention', 'nouveau.canal_non_declare');
      }
      return roomId;
    });
  }

  private async executer(action: () => Promise<string>): Promise<void> {
    if (this.creation()) return;
    this.creation.set(true);
    this.erreur.set(null);
    try {
      const roomId = await action();
      await this.router.navigate(['/salons', roomId]);
    } catch {
      this.erreur.set('nouveau.erreur_creation');
    } finally {
      this.creation.set(false);
    }
  }
}
