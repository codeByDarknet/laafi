import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { KeycloakService } from '../../core/auth/keycloak.service';
import { AppareilAffiche, CryptoService } from '../../core/matrix/crypto.service';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { ProfilService } from '../../core/profil/profil.service';
import { RevocationService } from '../../core/security/revocation.service';
import { LANGUES, Langue, PreferencesService, Theme } from '../../core/ui/preferences.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { DialogueComponent } from '../../ui/dialogue.component';
import { dateComplete, joindre } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';

/**
 * Profil et sécurité : identité officielle, état cryptographique de cet appareil, clé de
 * récupération, liste des appareils, langue, thème, et BOUTON D'URGENCE.
 */
@Component({
  selector: 'lf-profil',
  imports: [RouterLink, TranslocoPipe, AvatarComponent, IconeComponent, DialogueComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profil.component.html',
  styleUrls: ['../page.scss', './profil.component.scss'],
})
export class ProfilComponent {
  protected readonly profil = inject(ProfilService);
  protected readonly crypto = inject(CryptoService);
  protected readonly preferences = inject(PreferencesService);
  protected readonly keycloak = inject(KeycloakService);
  private readonly matrix = inject(MatrixClientService);
  private readonly revocation = inject(RevocationService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);

  protected readonly langues = LANGUES;
  protected readonly themes: Theme[] = ['systeme', 'clair', 'sombre'];
  protected readonly monId = this.matrix.monId;
  protected readonly date = dateComplete;
  protected readonly joindre = joindre;

  protected readonly appareils = signal<AppareilAffiche[] | null>(null);
  protected readonly erreurAppareils = signal(false);

  // Clé de récupération
  protected readonly cleAffichee = signal<string | null>(null);
  protected readonly cleNotee = signal(false);
  protected readonly configuration = signal(false);
  protected readonly saisieOuverte = signal(false);
  protected readonly cleSaisie = signal('');
  protected readonly deverrouillage = signal(false);
  protected readonly erreurCle = signal<string | null>(null);

  // Urgence
  protected readonly urgenceOuverte = signal(false);
  protected readonly confirmation = signal('');
  protected readonly urgenceEnCours = signal(false);
  protected readonly motAttendu = computed(() => {
    this.preferences.langue();
    return this.i18n.translate('urgence.mot');
  });
  protected readonly urgenceConfirmee = computed(
    () => this.confirmation().trim().toUpperCase() === this.motAttendu().toUpperCase(),
  );

  protected readonly nom = computed(() => this.profil.profil()?.nom || this.monId.slice(1).split(':')[0]);

  constructor() {
    void this.crypto.rafraichir();
    void this.chargerAppareils();
  }

  protected async chargerAppareils(): Promise<void> {
    this.erreurAppareils.set(false);
    try {
      this.appareils.set(await this.crypto.appareils());
    } catch {
      this.erreurAppareils.set(true);
    }
  }

  protected choisirLangue(l: string): void {
    this.preferences.choisirLangue(l as Langue);
  }

  /** Première configuration : crée signature croisée + stockage secret + sauvegarde des clés. */
  protected async configurer(): Promise<void> {
    this.configuration.set(true);
    try {
      this.cleAffichee.set(await this.crypto.configurerRecuperation());
      this.cleNotee.set(false);
      await this.chargerAppareils();
    } catch {
      this.toasts.erreur('securite.erreur_configuration');
    } finally {
      this.configuration.set(false);
    }
  }

  protected async deverrouiller(): Promise<void> {
    this.deverrouillage.set(true);
    this.erreurCle.set(null);
    try {
      await this.crypto.deverrouiller(this.cleSaisie());
      this.saisieOuverte.set(false);
      this.cleSaisie.set('');
      this.toasts.succes('securite.appareil_verifie');
      await this.chargerAppareils();
    } catch {
      this.erreurCle.set('securite.cle_incorrecte');
    } finally {
      this.deverrouillage.set(false);
    }
  }

  protected copierCle(cle: string): void {
    void navigator.clipboard?.writeText(cle).then(
      () => this.toasts.succes('securite.cle_copiee'),
      () => this.toasts.erreur('securite.copie_impossible'),
    );
  }

  protected telechargerCle(cle: string): void {
    const url = URL.createObjectURL(new Blob([`Laafi — clé de récupération\n${this.monId}\n\n${cle}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'laafi-cle-de-recuperation.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected fermerCle(): void {
    // La clé n'est conservée nulle part : une fois la fenêtre fermée, elle disparaît de la mémoire.
    this.cleAffichee.set(null);
  }

  protected async declencherUrgence(): Promise<void> {
    if (!this.urgenceConfirmee() || this.urgenceEnCours()) return;
    this.urgenceEnCours.set(true);
    await this.revocation.urgence();
  }
}
