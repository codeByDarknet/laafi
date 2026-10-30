import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { EntreeAccuse, Preuve, RapportVerification } from '../../core/api/models';
import { Icone } from '../../shared/icone';

/** Nombre de maillons dessinés dans la représentation visuelle de la chaîne. */
const MAILLONS = 24;

export type EtatMaillon = 'ok' | 'rompu' | 'nonverifie';

/**
 * Répartit les N entrées du journal sur au plus MAILLONS maillons dessinés et indique l'état
 * de chacun : vérifié, premier maillon invalide, ou non vérifié (après la rupture, la
 * vérification s'arrête : rien n'est garanti au-delà).
 */
export function maillons(r: RapportVerification, max = MAILLONS): EtatMaillon[] {
  const n = r.nombreEntrees;
  if (n <= 0) return [];
  const k = Math.min(n, max);
  if (r.integre) return Array<EtatMaillon>(k).fill('ok');
  // Les identifiants sont séquentiels à partir de 1 : l'identifiant donne la position.
  const pos = Math.min(k - 1, Math.max(0, Math.floor((((r.premiereEntreeInvalide ?? n) - 1) / n) * k)));
  return Array.from({ length: k }, (_, i) => (i < pos ? 'ok' : i === pos ? 'rompu' : 'nonverifie'));
}

/**
 * Journal probant des accusés de lecture (contrat §6).
 *
 * Chaque accusé « lu » est une entrée chaînée : hash_entree = SHA-256(hash_precedent ‖
 * sérialisation canonique), puis signée en Ed25519 par la clé du serveur. Supprimer,
 * modifier ou réordonner une entrée casse la chaîne à cet endroit. C'est de l'INTÉGRITÉ
 * (preuve d'horodatage et de non-altération), pas du chiffrement : le contenu des messages
 * n'y figure jamais, seule l'empreinte de l'événement Matrix est conservée.
 *
 * Le bouton « Vérifier l'intégrité » demande au backend de rejouer toute la chaîne.
 * L'API ne propose pas (encore) de liste paginée du journal entier : on consulte les
 * accusés d'un message par son eventId, puis la preuve autoportante d'une entrée.
 */
@Component({
  selector: 'lc-journal',
  imports: [DatePipe, TranslocoPipe, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journal.html',
  styleUrl: './journal.scss',
})
export class Journal {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);

  protected readonly rapport = signal<RapportVerification | null>(null);
  protected readonly verification = signal(false);
  protected readonly erreurVerif = signal<string | null>(null);
  protected readonly chaine = computed(() => {
    const r = this.rapport();
    return r ? maillons(r) : [];
  });

  protected readonly eventId = signal('');
  protected readonly accuses = signal<EntreeAccuse[] | null>(null);
  protected readonly recherche = signal(false);
  protected readonly erreurRecherche = signal<string | null>(null);

  protected readonly preuve = signal<Preuve | null>(null);
  protected readonly chargementPreuve = signal<number | null>(null);
  protected readonly erreurPreuve = signal<string | null>(null);
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  private tr = (c: string) => this.t.translate(c);

  protected verifier(): void {
    this.verification.set(true);
    this.erreurVerif.set(null);
    this.api.verifierJournal().subscribe({
      next: (r) => {
        this.rapport.set(r);
        this.verification.set(false);
      },
      error: (e) => {
        this.erreurVerif.set(messageErreur(e, this.tr));
        this.verification.set(false);
      },
    });
  }

  protected chercher(): void {
    const id = this.eventId().trim();
    if (!id) return;
    this.recherche.set(true);
    this.erreurRecherche.set(null);
    this.accuses.set(null);
    this.api.accuses(id).subscribe({
      next: (l) => {
        this.accuses.set(l);
        this.recherche.set(false);
      },
      error: (e) => {
        this.erreurRecherche.set(messageErreur(e, this.tr));
        this.recherche.set(false);
      },
    });
  }

  protected voirPreuve(id: number): void {
    this.chargementPreuve.set(id);
    this.erreurPreuve.set(null);
    this.api.preuve(id).subscribe({
      next: (p) => {
        this.preuve.set(p);
        this.chargementPreuve.set(null);
        this.dlg()?.nativeElement.showModal();
      },
      error: (e) => {
        this.erreurPreuve.set(messageErreur(e, this.tr));
        this.chargementPreuve.set(null);
      },
    });
  }

  protected fermerPreuve(): void {
    this.dlg()?.nativeElement.close();
  }

  /** Télécharge la preuve en JSON : elle se vérifie hors ligne avec la clé publique incluse. */
  protected telecharger(): void {
    const p = this.preuve();
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preuve-accuse-${p.entree.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
