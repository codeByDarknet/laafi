import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { CanalInstitutionnel, Classification } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/ui/toast.service';
import { BadgeClassification } from '../../shared/badges';
import { Icone } from '../../shared/icone';

export const CLASSIFICATIONS: Classification[] = ['NORMAL', 'DIFFUSION_RESTREINTE', 'CONFIDENTIEL'];

/**
 * Canaux institutionnels : salons Matrix officiels (ex. « DGTD — Cellule de crise ») que
 * l'administration référence avec un niveau de classification par défaut. La console ne
 * crée pas le salon (il est créé chiffré depuis la messagerie) : elle l'ENREGISTRE.
 * Le contenu des échanges n'est jamais visible ici : seul le serveur Matrix relaie des
 * messages chiffrés de bout en bout (Megolm) qu'il ne peut pas lire.
 */
@Component({
  selector: 'lc-canaux',
  imports: [ReactiveFormsModule, DatePipe, TranslocoPipe, Icone, BadgeClassification],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './canaux.html',
  styles: `
    .lc-filtres { grid-template-columns: minmax(0, 20rem); }
    .lf-modal .lf-field + .lf-field { margin-top: var(--lf-space-4); }
    .nom { font-weight: var(--lf-weight-semibold); }
    .desc { color: var(--lf-ink-2); font-size: var(--lf-text-xs); }
    .cls { margin: var(--lf-space-4) 0 0; padding: 0; border: 0; min-width: 0; }
    .cls + .lf-field { margin-top: var(--lf-space-4); }
  `,
})
export class Canaux {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);
  protected readonly classifications = CLASSIFICATIONS;

  protected readonly canaux = signal<CanalInstitutionnel[] | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly filtreMinistere = signal('');

  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly envoi = signal(false);
  protected readonly erreurForm = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    // Identifiant de salon Matrix : « !opaque:serveur ».
    roomId: ['', [Validators.required, Validators.maxLength(255), Validators.pattern(/^![^:\s]+(:[^\s]+)?$/)]], // « :serveur » absent en salons v12
    nom: ['', [Validators.required, Validators.maxLength(255)]],
    ministere: [this.auth.ministereImpose() ?? '', [Validators.required]],
    description: ['', [Validators.maxLength(1000)]],
    classification: ['NORMAL' as Classification, [Validators.required]],
  });

  constructor() {
    if (this.auth.ministereImpose()) this.form.controls.ministere.disable();
    this.charger();
  }

  protected charger(): void {
    this.canaux.set(null);
    this.erreur.set(null);
    this.api.canaux(this.auth.ministereImpose() ?? this.filtreMinistere()).subscribe({
      next: (l) => this.canaux.set(l),
      error: (e) => this.erreur.set(messageErreur(e, (c) => this.t.translate(c))),
    });
  }

  protected filtrer(code: string): void {
    this.filtreMinistere.set(code);
    this.charger();
  }

  protected invalide(nom: 'roomId' | 'nom' | 'ministere'): boolean {
    const c = this.form.controls[nom];
    return c.invalid && (c.touched || c.dirty);
  }

  protected ouvrir(): void {
    this.form.reset({ ministere: this.auth.ministereImpose() ?? '', classification: 'NORMAL' });
    this.erreurForm.set(null);
    this.dlg()?.nativeElement.showModal();
  }

  protected fermer(): void {
    if (!this.envoi()) this.dlg()?.nativeElement.close();
  }

  protected enregistrer(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.envoi.set(true);
    this.erreurForm.set(null);
    this.api
      .enregistrerCanal({
        roomId: v.roomId.trim(),
        nom: v.nom.trim(),
        ministere: this.auth.ministereImpose() ?? v.ministere,
        description: v.description.trim() || undefined,
        classification: v.classification,
      })
      .subscribe({
        next: (c) => {
          this.envoi.set(false);
          this.dlg()?.nativeElement.close();
          this.toast.succes(this.t.translate('canaux.succes', { nom: c.nom }));
          this.charger();
        },
        error: (e) => {
          this.envoi.set(false);
          this.erreurForm.set(messageErreur(e, (c) => this.t.translate(c)));
        },
      });
  }
}
