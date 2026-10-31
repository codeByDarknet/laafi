import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SsoService } from '../../core/auth/sso.service';
import { RevocationService } from '../../core/security/revocation.service';
import { IconeComponent } from '../../ui/icone.component';

const MOTIFS = ['jeton-invalide', 'compte-desactive', 'deconnexion-distante', 'urgence'] as const;

/**
 * Écran « Accès révoqué » : affiché après l'effacement complet des données locales.
 * Aucune donnée n'est plus lisible sur cet appareil ; seule une nouvelle connexion SSO
 * (si le compte est toujours actif) permet de revenir, sur un appareil neuf.
 */
@Component({
  selector: 'lf-acces-revoque',
  imports: [TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="contenu" class="revoque">
      <div class="carte" role="alert" aria-labelledby="titre-revoque">
        <span class="sceau" aria-hidden="true"><lf-icone nom="bouclierAlerte" [taille]="40" /></span>
        <h1 id="titre-revoque">{{ 'revoque.titre' | transloco }}</h1>
        <p class="raison">{{ 'revoque.motif.' + motifAffiche() | transloco }}</p>

        <ul class="garanties">
          <li><lf-icone nom="coche" [taille]="18" /> {{ 'revoque.efface_cles' | transloco }}</li>
          <li><lf-icone nom="coche" [taille]="18" /> {{ 'revoque.efface_messages' | transloco }}</li>
          <li><lf-icone nom="coche" [taille]="18" /> {{ 'revoque.efface_session' | transloco }}</li>
        </ul>

        @if (rapport(); as r) {
          <details class="rapport">
            <summary>{{ 'revoque.rapport' | transloco }}</summary>
            <p class="lf-muted">{{ 'revoque.rapport_detail' | transloco: { bases: r.basesSupprimees.length, caches: r.cachesSupprimes.length } }}</p>
            @if (r.erreurs.length) {
              <p class="lf-error">{{ 'revoque.rapport_erreurs' | transloco: { n: r.erreurs.length } }}</p>
            }
          </details>
        }

        <p class="lf-muted aide">{{ 'revoque.aide' | transloco }}</p>
        <button type="button" class="lf-btn lf-btn--secondary lf-btn--block" (click)="reconnecter()">
          {{ 'revoque.reconnecter' | transloco }}
        </button>
      </div>
    </main>
  `,
  styles: `
    @use 'tokens' as lf;

    :host {
      display: block;
      min-height: 100dvh;
      background: var(--lf-bg);
    }

    .revoque {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: var(--lf-gutter);
    }

    .carte {
      width: 100%;
      max-width: 28rem;
      padding: var(--lf-space-6) var(--lf-space-5);
      border: 1px solid var(--lf-border);
      border-top: 4px solid var(--lf-danger);
      border-radius: var(--lf-radius-lg);
      background: var(--lf-surface);
      box-shadow: var(--lf-shadow-2);
      text-align: center;

      @include lf.bp(md) {
        padding: var(--lf-space-8) var(--lf-space-6);
      }
    }

    .sceau {
      display: inline-grid;
      place-items: center;
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 50%;
      background: color-mix(in srgb, var(--lf-danger) 14%, transparent);
      color: var(--lf-danger-text);
    }

    h1 {
      margin: var(--lf-space-4) 0 var(--lf-space-2);
      font-size: var(--lf-text-2xl);
    }

    .raison {
      margin: 0 0 var(--lf-space-5);
    }

    .garanties {
      display: grid;
      gap: var(--lf-space-2);
      margin: 0 0 var(--lf-space-5);
      padding: 0;
      list-style: none;
      text-align: start;

      li {
        display: flex;
        align-items: flex-start;
        gap: var(--lf-space-2);
      }

      lf-icone {
        margin-top: 0.15em;
        color: var(--lf-success-text);
      }
    }

    .rapport {
      margin-bottom: var(--lf-space-4);
      text-align: start;
      font-size: var(--lf-text-sm);

      summary {
        cursor: pointer;
      }
    }

    .aide {
      font-size: var(--lf-text-sm);
    }
  `,
})
export class AccesRevoqueComponent {
  private readonly revocation = inject(RevocationService);
  private readonly sso = inject(SsoService);

  /** Paramètre de requête ?motif=… (liaison des entrées du routeur). */
  readonly motif = input<string>();
  protected readonly rapport = this.revocation.dernierRapport;

  protected readonly motifAffiche = computed(() => {
    const m = this.revocation.motif() ?? this.motif();
    return (MOTIFS as readonly string[]).includes(m ?? '') ? m : 'jeton-invalide';
  });

  protected reconnecter(): void {
    // Rechargement complet : repart d'un état mémoire vierge avant la redirection SSO.
    this.sso.demarrer();
  }
}
