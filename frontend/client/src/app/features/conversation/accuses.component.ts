import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { cleErreurApi } from '../../core/api/api.service';
import { EntreeAccuse, Preuve } from '../../core/api/modeles';
import { KeycloakService } from '../../core/auth/keycloak.service';
import { AccusesService } from '../../core/instruction/accuses.service';
import { MessageAffiche } from '../../core/matrix/messages';
import { SalonsService } from '../../core/matrix/salons.service';
import { DialogueComponent } from '../../ui/dialogue.component';
import { dateComplete } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';

/**
 * Côté émetteur d'une instruction : qui en a pris connaissance, et quand.
 * Pour chaque accusé, on RECALCULE localement l'empreinte SHA-256 du message déchiffré et on la
 * compare à celle enregistrée au journal : « conforme » prouve que le destinataire a reconnu
 * exactement ce texte-là. La preuve (chaînage + signature du serveur) est téléchargeable.
 */
@Component({
  selector: 'lf-accuses',
  imports: [TranslocoPipe, DialogueComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accuses.component.html',
  styleUrl: './accuses.component.scss',
})
export class AccusesComponent {
  private readonly accuses = inject(AccusesService);
  private readonly keycloak = inject(KeycloakService);
  private readonly salons = inject(SalonsService);

  readonly message = input<MessageAffiche | null>(null);
  readonly roomId = input.required<string>();
  readonly ferme = output<void>();

  protected readonly etat = signal<'chargement' | 'pret' | 'erreur'>('chargement');
  protected readonly erreur = signal<string>('erreurs.inconnue');
  protected readonly entrees = signal<EntreeAccuse[]>([]);
  protected readonly empreinteLocale = signal<string | null>(null);
  protected readonly preuve = signal<Preuve | null>(null);
  protected readonly chargementPreuve = signal<string | null>(null);
  protected readonly date = dateComplete;

  constructor() {
    effect(() => {
      const m = this.message();
      if (m) untracked(() => void this.charger(m));
    });
  }

  protected nom(userId: string): string {
    return this.salons.nomAffiche(userId, this.salons.salon(this.roomId()));
  }

  protected async charger(m: MessageAffiche): Promise<void> {
    this.etat.set('chargement');
    this.preuve.set(null);
    try {
      if (!(await this.keycloak.initialiser())) {
        this.erreur.set('instruction.session_api');
        this.etat.set('erreur');
        return;
      }
      const [entrees, empreinte] = await Promise.all([this.accuses.liste(m.eventId!), this.accuses.empreinte(m.evenement)]);
      this.entrees.set(entrees);
      this.empreinteLocale.set(empreinte);
      this.etat.set('pret');
    } catch (e) {
      this.erreur.set(cleErreurApi(e));
      this.etat.set('erreur');
    }
  }

  protected async ouvrirPreuve(e: EntreeAccuse): Promise<void> {
    this.chargementPreuve.set(String(e.id));
    try {
      this.preuve.set(await this.accuses.preuve(e.id));
    } catch (err) {
      this.erreur.set(cleErreurApi(err));
      this.etat.set('erreur');
    } finally {
      this.chargementPreuve.set(null);
    }
  }

  protected json(p: Preuve): string {
    return JSON.stringify(p, null, 2);
  }

  protected telecharger(p: Preuve): void {
    const url = URL.createObjectURL(new Blob([this.json(p)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `preuve-accuse-${p.entree?.id ?? 'laafi'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
