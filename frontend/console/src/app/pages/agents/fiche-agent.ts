import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ConfirmationInvalideError, MOTIF_MAX, MOTIF_MIN, RevocationService } from '../../core/agents/revocation.service';
import { ApiService, messageErreur } from '../../core/api/api.service';
import { AgentDetail, EvenementAudit } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/ui/toast.service';
import { BadgeStatut } from '../../shared/badges';
import { Icone } from '../../shared/icone';

/** Nombre de pages d'audit (50 événements chacune) parcourues pour l'historique de l'agent. */
const PAGES_AUDIT = 4;

type Dialogue = 'revocation' | 'appareils' | 'reactivation';

/**
 * Fiche d'un agent : identité, rôles, appareils Synapse, historique d'audit et actions de
 * révocation. Chaque action passe par une <dialog> native (piège du focus et touche Échap
 * gérés par le navigateur) et par RevocationService, qui refuse d'appeler l'API tant que
 * la confirmation forte n'est pas satisfaite.
 */
@Component({
  selector: 'lc-fiche-agent',
  imports: [RouterLink, DatePipe, TranslocoPipe, Icone, BadgeStatut],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fiche-agent.html',
  styleUrl: './fiche-agent.scss',
})
export class FicheAgent {
  private readonly api = inject(ApiService);
  private readonly revocation = inject(RevocationService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly referentiel = inject(ReferentielService);
  protected readonly motifMin = MOTIF_MIN;
  protected readonly motifMax = MOTIF_MAX;

  /** Paramètre de route :username (withComponentInputBinding). */
  readonly username = input.required<string>();

  protected readonly detail = signal<AgentDetail | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly historique = signal<EvenementAudit[] | null>(null);
  protected readonly erreurHistorique = signal<string | null>(null);

  // --- État des dialogues ---
  private readonly dlgRevocation = viewChild<ElementRef<HTMLDialogElement>>('dlgRevocation');
  private readonly dlgAppareils = viewChild<ElementRef<HTMLDialogElement>>('dlgAppareils');
  private readonly dlgReactivation = viewChild<ElementRef<HTMLDialogElement>>('dlgReactivation');
  protected readonly motif = signal('');
  protected readonly saisieUsername = signal('');
  protected readonly envoi = signal(false);
  protected readonly erreurAction = signal<string | null>(null);
  protected readonly tentative = signal(false);

  protected readonly verification = computed(() =>
    this.revocation.verifier(this.username(), this.saisieUsername(), this.motif()),
  );
  protected readonly longueurMotif = computed(() => this.motif().trim().length);

  protected readonly agent = computed(() => this.detail()?.agent ?? null);
  protected readonly estRevoque = computed(() => this.agent()?.statut === 'REVOQUE');

  constructor() {
    effect(() => {
      this.username(); // recharge si l'on navigue d'une fiche à une autre
      void this.charger();
    });
  }

  protected async charger(): Promise<void> {
    const u = this.username();
    const tr = (c: string) => this.t.translate(c);
    this.detail.set(null);
    this.erreur.set(null);
    this.historique.set(null);
    this.erreurHistorique.set(null);
    try {
      this.detail.set(await firstValueFrom(this.api.agent(u)));
    } catch (e) {
      this.erreur.set(messageErreur(e, tr));
      return;
    }
    // L'API n'offre pas de filtre /audit?cible= : on parcourt les pages récentes côté client.
    try {
      const evenements: EvenementAudit[] = [];
      for (let p = 0; p < PAGES_AUDIT; p++) {
        const page = await firstValueFrom(this.api.audit(p));
        evenements.push(...page.elements.filter((ev) => ev.cible === u));
        if (!page.pageSuivante) break;
      }
      this.historique.set(evenements);
    } catch (e) {
      this.erreurHistorique.set(messageErreur(e, tr));
    }
  }

  // --- Dialogues --------------------------------------------------------------

  private dialogue(d: Dialogue): HTMLDialogElement | undefined {
    const ref = { revocation: this.dlgRevocation, appareils: this.dlgAppareils, reactivation: this.dlgReactivation }[d]();
    return ref?.nativeElement;
  }

  protected ouvrir(d: Dialogue): void {
    this.motif.set('');
    this.saisieUsername.set('');
    this.erreurAction.set(null);
    this.tentative.set(false);
    this.dialogue(d)?.showModal();
  }

  protected fermer(d: Dialogue): void {
    if (this.envoi()) return;
    this.dialogue(d)?.close();
  }

  /** Empêche la fermeture par Échap pendant l'appel réseau. */
  protected surAnnulation(ev: Event): void {
    if (this.envoi()) ev.preventDefault();
  }

  protected async confirmerRevocation(): Promise<void> {
    this.tentative.set(true);
    if (!this.verification().peutConfirmer) return;
    await this.executer('revocation', () => this.revocation.revoquer(this.username(), this.saisieUsername(), this.motif()), 'fiche.revocation.succes');
  }

  protected async confirmerAppareils(): Promise<void> {
    await this.executer('appareils', () => this.revocation.revoquerAppareils(this.username(), this.motif()), 'fiche.appareils.succes');
  }

  protected async confirmerReactivation(): Promise<void> {
    await this.executer('reactivation', () => this.revocation.reactiver(this.username(), this.motif()), 'fiche.reactivation.succes');
  }

  private async executer(d: Dialogue, action: () => Promise<unknown>, cleSucces: string): Promise<void> {
    this.envoi.set(true);
    this.erreurAction.set(null);
    try {
      await action();
      this.envoi.set(false);
      this.dialogue(d)?.close();
      this.toast.succes(this.t.translate(cleSucces, { username: this.username() }));
      await this.charger();
    } catch (e) {
      this.envoi.set(false);
      this.erreurAction.set(
        e instanceof ConfirmationInvalideError ? e.message : messageErreur(e, (c) => this.t.translate(c)),
      );
    }
  }

  protected libelleAction(action: string): string {
    const cle = `audit.action.${action}`;
    const traduit = this.t.translate(cle);
    return traduit === cle ? action : traduit;
  }
}
