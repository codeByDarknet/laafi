import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconeComponent } from './icone.component';

let compteur = 0;

/**
 * Modale accessible sur l'élément natif <dialog> (focus piégé, Échap, arrière-plan inerte).
 * Sur mobile, le design system l'affiche comme une feuille ancrée en bas.
 */
@Component({
  selector: 'lf-dialogue',
  imports: [TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #d
      class="lf-modal"
      [class.lf-modal--danger]="danger()"
      [class.lf-modal--wide]="large()"
      [attr.aria-labelledby]="idTitre"
      (close)="ferme.emit()"
      (cancel)="annulation($event)"
    >
      <header class="lf-modal__header">
        <h2 class="lf-modal__title" [id]="idTitre">{{ titre() }}</h2>
        <button type="button" class="lf-close" [attr.aria-label]="'commun.fermer' | transloco" (click)="d.close()">
          <lf-icone nom="fermer" [taille]="18" />
        </button>
      </header>
      <div class="lf-modal__body">
        <ng-content />
      </div>
      <ng-content select="[pied]" />
    </dialog>
  `,
})
export class DialogueComponent {
  readonly ouvert = input(false);
  readonly titre = input.required<string>();
  readonly danger = input(false);
  readonly large = input(false);
  /** Empêche Échap de fermer pendant une opération en cours. */
  readonly bloque = input(false);
  readonly ferme = output<void>();

  protected readonly idTitre = `lf-dialogue-${++compteur}`;
  private readonly dialogue = viewChild.required<ElementRef<HTMLDialogElement>>('d');

  constructor() {
    effect(() => {
      const d = this.dialogue().nativeElement;
      if (this.ouvert() && !d.open) d.showModal();
      if (!this.ouvert() && d.open) d.close();
    });
  }

  protected annulation(evt: Event): void {
    if (this.bloque()) evt.preventDefault();
  }
}
