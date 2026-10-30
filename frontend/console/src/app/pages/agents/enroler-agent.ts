import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ApiService, messageErreur } from '../../core/api/api.service';
import { EnrolementReponse, EnrolementRequete, Role } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/ui/toast.service';
import { Icone } from '../../shared/icone';

/** Domaine fictif des adresses de démonstration (aucune vraie boîte aux lettres). */
export const DOMAINE_EMAIL = 'laafi.local';

/**
 * Même règle que le backend (AgentService) : accents retirés, minuscules,
 * seuls [a-z0-9] conservés, puis « prenom.nom ». Ex. « Aïcha Ouédraogo » → « aicha.ouedraogo ».
 */
export function normaliserIdentifiant(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function genererUsername(prenom: string, nom: string): string {
  const p = normaliserIdentifiant(prenom);
  const n = normaliserIdentifiant(nom);
  return p && n ? `${p}.${n}` : '';
}

type ChampEnrolement = 'prenom' | 'nom' | 'username' | 'email' | 'ministere' | 'fonction' | 'matricule';

interface RoleOption {
  role: Role;
  verrouille: boolean;
}

/**
 * Enrôlement d'un agent. Le backend crée le compte Keycloak (mot de passe temporaire +
 * action obligatoire CONFIGURE_TOTP) ; le compte Matrix naît à la première connexion OIDC.
 * Le mot de passe temporaire n'est affiché qu'UNE fois : il n'est stocké nulle part ici.
 */
@Component({
  selector: 'lc-enroler-agent',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './enroler-agent.html',
  styleUrl: './enroler-agent.scss',
})
export class EnrolerAgent {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);
  protected readonly domaine = DOMAINE_EMAIL;

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly form = this.fb.group({
    prenom: ['', [Validators.required, Validators.maxLength(100)]],
    nom: ['', [Validators.required, Validators.maxLength(100)]],
    username: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(64), Validators.pattern(/^[a-z0-9][a-z0-9._-]+$/)],
    ],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    ministere: [this.auth.ministereImpose() ?? '', [Validators.required, Validators.maxLength(32)]],
    direction: ['', [Validators.maxLength(255)]],
    fonction: ['', [Validators.required, Validators.maxLength(255)]],
    matricule: ['', [Validators.required, Validators.maxLength(64)]],
    chefService: [false],
    adminMinistere: [false],
  });

  /** Tant que l'admin n'a pas retouché l'identifiant, il suit le prénom et le nom. */
  private usernameManuel = false;
  private emailManuel = false;

  protected readonly envoi = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly resultat = signal<EnrolementReponse | null>(null);
  protected readonly revele = signal(false);
  protected readonly copie = signal(false);

  private readonly valeurs = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly apercuMatrix = computed(() => {
    const u = this.valeurs().username;
    return u ? `@${u}:${location.hostname || 'laafi'}` : '';
  });

  protected readonly roles = computed<RoleOption[]>(() => [
    { role: 'agent', verrouille: true },
    { role: 'chef_service', verrouille: false },
    ...(this.auth.estSuperAdmin() ? [{ role: 'admin_ministere' as Role, verrouille: false }] : []),
  ]);

  constructor() {
    if (this.auth.ministereImpose()) this.form.controls.ministere.disable();
    this.form.controls.prenom.valueChanges.subscribe(() => this.synchroniser());
    this.form.controls.nom.valueChanges.subscribe(() => this.synchroniser());
  }

  private synchroniser(): void {
    const { prenom, nom } = this.form.getRawValue();
    const u = genererUsername(prenom, nom);
    if (!this.usernameManuel) this.form.controls.username.setValue(u, { emitEvent: true });
    if (!this.emailManuel) this.form.controls.email.setValue(u ? `${u}@${DOMAINE_EMAIL}` : '');
  }

  protected usernameSaisi(): void {
    this.usernameManuel = true;
  }

  protected emailSaisi(): void {
    this.emailManuel = true;
  }

  protected regenererUsername(): void {
    this.usernameManuel = false;
    this.synchroniser();
  }

  protected invalide(nom: ChampEnrolement): boolean {
    const c = this.form.controls[nom];
    return c.invalid && (c.touched || c.dirty);
  }

  protected soumettre(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Amène le focus sur le premier champ invalide (accessibilité clavier / lecteur d'écran).
      queueMicrotask(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus());
      return;
    }
    const v = this.form.getRawValue();
    const roles: Role[] = ['agent'];
    if (v.chefService) roles.push('chef_service');
    if (v.adminMinistere && this.auth.estSuperAdmin()) roles.push('admin_ministere');
    const req: EnrolementRequete = {
      username: v.username.trim(),
      prenom: v.prenom.trim(),
      nom: v.nom.trim(),
      email: v.email.trim() || undefined,
      // Pour un admin_ministere, le backend impose de toute façon son propre ministère.
      ministere: this.auth.ministereImpose() ?? v.ministere,
      direction: v.direction.trim() || undefined,
      fonction: v.fonction.trim(),
      matricule: v.matricule.trim(),
      roles,
    };
    this.envoi.set(true);
    this.erreur.set(null);
    this.api.enroler(req).subscribe({
      next: (r) => {
        this.envoi.set(false);
        this.resultat.set(r);
        this.toast.succes(this.t.translate('enroler.succes', { username: r.username }));
        queueMicrotask(() => document.getElementById('resultat-titre')?.focus());
      },
      error: (e) => {
        this.envoi.set(false);
        this.erreur.set(messageErreur(e, (c) => this.t.translate(c)));
      },
    });
  }

  protected async copier(): Promise<void> {
    const r = this.resultat();
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.motDePasseTemporaire);
      this.copie.set(true);
      setTimeout(() => this.copie.set(false), 2500);
    } catch {
      this.toast.erreur(this.t.translate('enroler.copieImpossible'));
    }
  }

  /** Oublie le mot de passe affiché et repart d'un formulaire vierge. */
  protected nouveau(): void {
    this.resultat.set(null);
    this.revele.set(false);
    this.usernameManuel = false;
    this.emailManuel = false;
    this.form.reset({ ministere: this.auth.ministereImpose() ?? '' });
  }
}
