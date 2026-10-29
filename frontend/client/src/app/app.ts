import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from './core/auth/auth.service';
import { PreferencesService } from './core/ui/preferences.service';
import { ToastService } from './core/ui/toast.service';
import { IconeComponent } from './ui/icone.component';

@Component({
  selector: 'lf-root',
  imports: [RouterOutlet, TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  protected readonly toasts = inject(ToastService);
  protected readonly chargement = computed(() => ['initialisation', 'connexion'].includes(this.auth.etat()));
  protected readonly connexion = computed(() => this.auth.etat() === 'connexion');

  constructor() {
    inject(PreferencesService).initialiser();
    void this.auth.pret();
  }
}
