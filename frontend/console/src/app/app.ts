import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { ToastService } from './core/ui/toast.service';

/** Racine : le routeur + la région de notifications (annoncée aux lecteurs d'écran). */
@Component({
  selector: 'lc-root',
  imports: [RouterOutlet, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <div class="lf-toast-region" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="lf-toast"
             [class.lf-toast--danger]="t.genre === 'erreur'"
             [class.lf-toast--warning]="t.genre === 'avertissement'"
             [class.lf-toast--neutral]="t.genre === 'neutre'"
             [attr.role]="t.genre === 'erreur' ? 'alert' : null">
          <div class="lf-toast__body">
            <p class="lf-toast__title">{{ t.titre }}</p>
            @if (t.texte) { <p>{{ t.texte }}</p> }
          </div>
          <button type="button" class="lf-close" (click)="toasts.fermer(t.id)"
                  [attr.aria-label]="'commun.fermer' | transloco">×</button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
