import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { PolitiqueClassification, Transfert } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { BadgeClassification } from '../../shared/badges';
import { Icone } from '../../shared/icone';

const TRANSFERTS: Transfert[] = ['AUTORISE', 'INTERNE_MINISTERE', 'INTERDIT'];

/**
 * Politiques de classification (contrat §5). Elles décrivent ce que les CLIENTS appliquent
 * à un message classé : transfert, copie, expiration, filigrane, floutage hors focus.
 * Ce sont des garde-fous d'usage (anti-fuite par maladresse), PAS de la cryptographie :
 * la confidentialité reste assurée par le chiffrement de bout en bout Olm/Megolm.
 * Lecture pour tout administrateur, modification réservée au super_admin (vérifiée aussi
 * par le backend, et tracée dans l'audit).
 */
@Component({
  selector: 'lc-politiques',
  imports: [ReactiveFormsModule, DatePipe, TranslocoPipe, Icone, BadgeClassification],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './politiques.html',
  styleUrl: './politiques.scss',
})
export class Politiques {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly transferts = TRANSFERTS;

  protected readonly politiques = signal<PolitiqueClassification[] | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly enEdition = signal<PolitiqueClassification | null>(null);
  protected readonly envoi = signal(false);
  protected readonly erreurForm = signal<string | null>(null);
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    libelle: ['', [Validators.required, Validators.maxLength(255)]],
    transfert: ['AUTORISE' as Transfert],
    copie: [true],
    expire: [false],
    expirationJours: [7, [Validators.min(1), Validators.max(3650)]],
    filigrane: [false],
    filigraneNominatif: [false],
    flouHorsFocus: [false],
  });

  constructor() {
    this.charger();
  }

  protected charger(): void {
    this.politiques.set(null);
    this.erreur.set(null);
    this.api.politiques().subscribe({
      next: (l) => this.politiques.set(l),
      error: (e) => this.erreur.set(messageErreur(e, (c) => this.t.translate(c))),
    });
  }

  protected editer(p: PolitiqueClassification): void {
    if (!this.auth.estSuperAdmin()) return;
    this.enEdition.set(p);
    this.erreurForm.set(null);
    this.form.reset({
      libelle: p.libelle,
      transfert: p.transfert,
      copie: p.copie,
      expire: p.expirationJours != null,
      expirationJours: p.expirationJours ?? 7,
      filigrane: p.filigrane,
      filigraneNominatif: p.filigraneNominatif,
      flouHorsFocus: p.flouHorsFocus,
    });
    this.dlg()?.nativeElement.showModal();
  }

  protected fermer(): void {
    if (!this.envoi()) this.dlg()?.nativeElement.close();
  }

  protected enregistrer(): void {
    const p = this.enEdition();
    if (!p) return;
    const v = this.form.getRawValue();
    if (this.form.invalid || (v.expire && !(v.expirationJours >= 1))) {
      this.form.markAllAsTouched();
      return;
    }
    this.envoi.set(true);
    this.api
      .modifierPolitique(p.niveau, {
        libelle: v.libelle.trim(),
        transfert: v.transfert,
        copie: v.copie,
        expirationJours: v.expire ? v.expirationJours : null,
        // Un filigrane nominatif suppose un filigrane.
        filigrane: v.filigrane || v.filigraneNominatif,
        filigraneNominatif: v.filigraneNominatif,
        flouHorsFocus: v.flouHorsFocus,
      })
      .subscribe({
        next: () => {
          this.envoi.set(false);
          this.dlg()?.nativeElement.close();
          this.toast.succes(this.t.translate('politiques.succes', { niveau: this.t.translate('classification.' + p.niveau) }));
          this.charger();
        },
        error: (e) => {
          this.envoi.set(false);
          this.erreurForm.set(messageErreur(e, (c) => this.t.translate(c)));
        },
      });
  }
}
