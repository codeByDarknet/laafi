import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initiales, teinte } from '../core/matrix/messages';

/** Avatar à initiales (aucune photo téléchargée : économie de données et vie privée). */
@Component({
  selector: 'lf-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="lf-avatar"
    [class.lf-avatar--group]="groupe()"
    [class.lf-avatar--xs]="taille() === 'xs'"
    [class.lf-avatar--sm]="taille() === 'sm'"
    [class.lf-avatar--lg]="taille() === 'lg'"
    [class.lf-avatar--xl]="taille() === 'xl'"
    [attr.data-tint]="teinte()"
    aria-hidden="true"
    >{{ lettres() }}@if (verifie()) {<span class="lf-avatar__verified"></span>}</span
  >`,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class AvatarComponent {
  readonly nom = input.required<string>();
  readonly id = input<string>('');
  readonly groupe = input(false);
  readonly verifie = input(false);
  readonly taille = input<'xs' | 'sm' | 'md' | 'lg' | 'xl'>('md');
  protected readonly lettres = computed(() => initiales(this.nom()));
  protected readonly teinte = computed(() => teinte(this.id() || this.nom()));
}
