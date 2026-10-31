import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LANGUES, Langue, PreferencesService } from '../../core/ui/preferences.service';
import { IconeComponent } from '../../ui/icone.component';

/** Écran d'accueil : une seule action, la connexion par le compte agent (SSO Keycloak + TOTP). */
@Component({
  selector: 'lf-accueil',
  imports: [TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accueil.component.html',
  styleUrl: './accueil.component.scss',
})
export class AccueilComponent {
  private readonly auth = inject(AuthService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly langues = LANGUES;
  protected readonly enCours = computed(() => this.auth.etat() === 'connexion');
  protected readonly cleErreur = this.auth.cleErreur;

  protected connecter(): void {
    this.auth.connexion();
  }

  protected changerLangue(evt: Event): void {
    this.prefs.choisirLangue((evt.target as HTMLSelectElement).value as Langue);
  }

  protected recharger(): void {
    window.location.assign('/');
  }
}
