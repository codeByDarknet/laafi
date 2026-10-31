import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { Icone } from '../../shared/icone';

/**
 * Page « Accès refusé » : l'utilisateur est bien authentifié (mot de passe + TOTP) mais son
 * jeton ne porte ni admin_ministere ni super_admin. On le dit clairement, on rappelle qui il
 * est (pour qu'il puisse changer de compte) et on oriente vers la messagerie.
 */
@Component({
  selector: 'lc-acces-refuse',
  imports: [TranslocoPipe, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lf-fani" aria-hidden="true"></span>
    <main class="page">
      <div class="carte">
        <img src="assets/brand/laafi-mark.svg" alt="" width="48" height="48" />
        <h1>{{ 'accesRefuse.titre' | transloco }}</h1>
        <p class="texte">
          {{ (raison() === 'role' ? 'accesRefuse.texteRole' : 'accesRefuse.texte') | transloco }}
        </p>
        @if (auth.utilisateur(); as u) {
          <p class="compte">
            {{ 'accesRefuse.connecteEnTantQue' | transloco }}
            <strong>{{ u.nom }}</strong> <span class="lf-mono">({{ u.username }})</span>
          </p>
        }
        <div class="actions">
          <a class="lf-btn lf-btn--primary" href="/">{{ 'accesRefuse.versMessagerie' | transloco }}</a>
          <button type="button" class="lf-btn lf-btn--secondary" (click)="auth.deconnexion()">
            <lc-icone nom="deconnexion" />
            {{ 'accesRefuse.changerDeCompte' | transloco }}
          </button>
        </div>
        <p class="aide">
          <lc-icone nom="info" />
          <span>{{ 'accesRefuse.aide' | transloco }}</span>
        </p>
      </div>
    </main>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100dvh; --lf-fani-height: 6px; }
    .page { flex: 1; display: grid; place-items: center; padding: var(--lf-space-6) var(--lf-gutter); }
    .carte {
      display: flex; flex-direction: column; align-items: flex-start; gap: var(--lf-space-4);
      width: min(100%, 34rem); padding: var(--lf-space-8) var(--lf-space-6);
      background: var(--lf-surface); border: 1px solid var(--lf-border);
      border-radius: var(--lf-radius-lg); box-shadow: var(--lf-shadow-2);
    }
    h1 { font-size: var(--lf-text-2xl); font-stretch: var(--lf-display-stretch); font-weight: var(--lf-weight-black); }
    .texte { color: var(--lf-ink-2); }
    .compte { font-size: var(--lf-text-sm); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--lf-space-2); margin-top: var(--lf-space-2); }
    .aide {
      display: flex; gap: var(--lf-space-2); padding-top: var(--lf-space-4);
      border-top: 1px solid var(--lf-border); color: var(--lf-ink-2); font-size: var(--lf-text-sm);
      --lc-icone: 1.1rem;
    }
  `,
})
export class AccesRefuse {
  protected readonly auth = inject(AuthService);
  /** Lu dans ?raison= (liaison des paramètres de requête aux inputs du routeur). */
  readonly raison = input<string>();
}
