import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  Niveau,
  Regles,
  estExpire,
  niveauMax,
  reglesPour,
  texteFiligrane,
} from '../../core/classification/classification';
import { ExpirationService } from '../../core/classification/expiration.service';
import { EnvoiService } from '../../core/matrix/envoi.service';
import { MatrixClientService } from '../../core/matrix/matrix-client.service';
import { MessageAffiche } from '../../core/matrix/messages';
import { SalonsService } from '../../core/matrix/salons.service';
import { PolitiquesService } from '../../core/classification/politiques.service';
import { ProfilService } from '../../core/profil/profil.service';
import { PreferencesService } from '../../core/ui/preferences.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { DialogueComponent } from '../../ui/dialogue.component';
import { cleJour, jourLong, taille } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';
import { AccusesComponent } from './accuses.component';
import { ComposeurComponent } from './composeur.component';
import { MessageComponent } from './message.component';
import { TransfertComponent } from './transfert.component';

type ElementFil =
  | { type: 'jour'; id: string; libelle: string }
  | { type: 'message'; id: string; message: MessageAffiche; auteur: string | null; regles: Regles };

/**
 * Écran de conversation. Les protections de classification s'appliquent ici :
 *  - expiration : un message échu disparaît de l'écran (et l'émetteur le supprime du serveur) ;
 *  - CONFIDENTIEL : filigrane nominatif sur le fil, flou quand la fenêtre perd le focus,
 *    copie/menu contextuel bloqués, transfert impossible ;
 *  - bandeau : rappelle le niveau le plus élevé présent dans la conversation.
 * Rappel honnête : une capture d'écran ou une photo de l'écran reste possible ; ces mesures
 * dissuadent et rendent la fuite traçable (filigrane nominatif), elles ne l'empêchent pas.
 */
@Component({
  selector: 'lf-conversation',
  imports: [
    RouterLink,
    TranslocoPipe,
    AvatarComponent,
    IconeComponent,
    MessageComponent,
    ComposeurComponent,
    TransfertComponent,
    AccusesComponent,
    DialogueComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
})
export class ConversationComponent {
  private readonly salons = inject(SalonsService);
  private readonly matrix = inject(MatrixClientService);
  private readonly expiration = inject(ExpirationService);
  private readonly politiques = inject(PolitiquesService);
  private readonly profil = inject(ProfilService);
  private readonly preferences = inject(PreferencesService);
  private readonly i18n = inject(TranslocoService);
  private readonly toasts = inject(ToastService);
  protected readonly envoi = inject(EnvoiService);

  /** Paramètre de route (:roomId), lié par withComponentInputBinding. */
  readonly roomId = input.required<string>();

  private readonly fil = viewChild<ElementRef<HTMLElement>>('fil');
  protected readonly colle = signal(true);
  protected readonly chargementAnciens = signal(false);
  protected readonly plusAnciens = signal(true);
  protected readonly flou = signal(false);
  protected readonly aTransferer = signal<MessageAffiche | null>(null);
  protected readonly accusesDe = signal<MessageAffiche | null>(null);
  protected readonly aSupprimer = signal<MessageAffiche | null>(null);
  protected readonly suppression = signal(false);
  protected readonly acceptation = signal(false);

  // L'objet Room du SDK est toujours le MÊME objet (muté en place à chaque synchro) :
  // sans `equal: () => false`, Angular le jugerait inchangé et les écrans dérivés
  // (messages, membres) ne se mettraient pas à jour à l'arrivée d'un message.
  protected readonly room = computed(
    () => {
      this.matrix.version();
      return this.salons.salon(this.roomId());
    },
    { equal: () => false },
  );
  protected readonly resume = computed(() => this.salons.salons().find((s) => s.id === this.roomId()) ?? null);
  protected readonly invitation = computed(() => this.resume()?.invitation ?? false);
  protected readonly peutPublier = computed(() => {
    const r = this.room();
    return !!r && this.salons.peutPublier(r);
  });
  protected readonly sousTitre = computed(() => {
    const r = this.room();
    const s = this.resume();
    if (!r || !s) return '';
    if (s.type === 'direct') return 'conversation.direct';
    return s.type === 'canal' ? 'conversation.canal' : 'conversation.groupe';
  });
  protected readonly nbMembres = computed(() => this.room()?.getJoinedMemberCount() ?? 0);

  /** Messages chargés, sans les messages expirés (masqués dès l'échéance). */
  private readonly messages = computed(() => {
    const r = this.room();
    if (!r || this.invitation()) return [];
    const maintenant = this.expiration.maintenant();
    return this.salons.messages(r).filter((m) => !estExpire(m.expireAt, maintenant));
  });

  protected readonly niveauSalon = computed<Niveau>(() =>
    niveauMax(this.messages().filter((m) => m.genre !== 'supprime').map((m) => m.niveau)),
  );
  private readonly reglesParNiveau = computed(() => {
    const p = this.politiques.politiques();
    return {
      NORMAL: reglesPour('NORMAL', p),
      DIFFUSION_RESTREINTE: reglesPour('DIFFUSION_RESTREINTE', p),
      CONFIDENTIEL: reglesPour('CONFIDENTIEL', p),
    } satisfies Record<Niveau, Regles>;
  });
  protected readonly reglesSalon = computed(() => this.reglesParNiveau()[this.niveauSalon()]);

  protected readonly elements = computed<ElementFil[]>(() => {
    const r = this.room();
    const type = this.resume()?.type;
    const regles = this.reglesParNiveau();
    const resultat: ElementFil[] = [];
    let jour = '';
    let precedent: MessageAffiche | null = null;
    for (const m of this.messages()) {
      const j = cleJour(m.horodatage);
      if (j !== jour) {
        jour = j;
        precedent = null;
        resultat.push({ type: 'jour', id: `j-${j}`, libelle: jourLong(m.horodatage) });
      }
      const nouveauBloc = !precedent || precedent.expediteur !== m.expediteur || m.horodatage - precedent.horodatage > 5 * 60_000;
      const auteur = type !== 'direct' && !m.sortant && nouveauBloc ? this.salons.nomAffiche(m.expediteur, r) : null;
      resultat.push({ type: 'message', id: m.id, message: m, auteur, regles: regles[m.niveau] });
      precedent = m;
    }
    return resultat;
  });

  /** Filigrane : nominatif (nom · matricule · date) si la politique l'exige. */
  protected readonly filigrane = computed(() => {
    const regles = this.reglesSalon();
    if (!regles.filigrane) return null;
    this.preferences.langue();
    const p = this.profil.profil();
    const nom = p?.nom || this.salons.nomAffiche(this.matrix.monId);
    const libelle = this.i18n.translate(`classification.niveau.${this.niveauSalon()}`);
    return texteFiligrane(regles.filigraneNominatif, { nom, matricule: p?.matricule }, libelle, new Date(this.expiration.maintenant()));
  });

  protected readonly envoisEnAttente = computed(() => this.envoi.enAttente().filter((e) => e.roomId === this.roomId()));
  protected readonly taille = taille;

  constructor() {
    // Flou hors focus (CONFIDENTIEL) : fenêtre en arrière-plan, autre onglet, sélecteur d'apps.
    const majFlou = () => this.flou.set(document.visibilityState === 'hidden' || !document.hasFocus());
    window.addEventListener('blur', majFlou);
    window.addEventListener('focus', majFlou);
    document.addEventListener('visibilitychange', majFlou);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('blur', majFlou);
      window.removeEventListener('focus', majFlou);
      document.removeEventListener('visibilitychange', majFlou);
    });

    // Changement de conversation : on repart en bas du fil.
    effect(() => {
      this.roomId();
      untracked(() => {
        this.colle.set(true);
        this.plusAnciens.set(true);
        this.aTransferer.set(null);
        this.accusesDe.set(null);
      });
    });

    // Nouveaux messages : défilement en bas si l'agent y était déjà ; accusé de lecture privé.
    effect(() => {
      const n = this.elements().length;
      const r = this.room();
      untracked(() => {
        if (n && this.colle()) requestAnimationFrame(() => this.allerEnBas());
        if (r && !this.invitation() && document.visibilityState === 'visible') void this.salons.marquerLu(r);
      });
    });
  }

  protected defilement(): void {
    const el = this.fil()?.nativeElement;
    if (!el) return;
    this.colle.set(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  protected allerEnBas(): void {
    const el = this.fil()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  protected async chargerAnciens(): Promise<void> {
    const r = this.room();
    const el = this.fil()?.nativeElement;
    if (!r || this.chargementAnciens()) return;
    this.chargementAnciens.set(true);
    const hauteurAvant = el?.scrollHeight ?? 0;
    try {
      this.plusAnciens.set(await this.salons.chargerPlusAnciens(r));
      // Conserve la position de lecture après l'insertion des messages au-dessus.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - hauteurAvant;
      });
    } catch {
      this.toasts.erreur('erreurs.reseau');
    } finally {
      this.chargementAnciens.set(false);
    }
  }

  protected async accepter(): Promise<void> {
    this.acceptation.set(true);
    try {
      await this.salons.accepter(this.roomId());
    } catch {
      this.toasts.erreur('salons.erreur_accepter');
    } finally {
      this.acceptation.set(false);
    }
  }

  protected async confirmerSuppression(): Promise<void> {
    const m = this.aSupprimer();
    if (!m?.eventId) return;
    this.suppression.set(true);
    try {
      await this.salons.supprimer(this.roomId(), m.eventId);
      this.aSupprimer.set(null);
    } catch {
      this.toasts.erreur('conversation.erreur_suppression');
    } finally {
      this.suppression.set(false);
    }
  }

  protected matrix_pret(): boolean {
    return this.matrix.etat() === 'pret' || this.matrix.etat() === 'hors-ligne';
  }

  protected reglesFor(m: MessageAffiche): Regles {
    return this.reglesParNiveau()[m.niveau];
  }
}
