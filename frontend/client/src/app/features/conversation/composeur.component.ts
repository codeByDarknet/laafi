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
import { TranslocoPipe } from '@jsverse/transloco';
import {
  NIVEAUX,
  Niveau,
  dureesProposees,
  expirationParDefaut,
} from '../../core/classification/classification';
import { PolitiquesService } from '../../core/classification/politiques.service';
import { EnvoiService } from '../../core/matrix/envoi.service';
import { OptionsEnvoi, SalonsService } from '../../core/matrix/salons.service';
import { ToastService } from '../../core/ui/toast.service';
import { duree } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const LIBELLES_DUREE: Record<number, string> = {
  0: 'composeur.duree.jamais',
  [HEURE]: 'composeur.duree.h1',
  [JOUR]: 'composeur.duree.j1',
  [7 * JOUR]: 'composeur.duree.j7',
  [30 * JOUR]: 'composeur.duree.j30',
};
/** Durée maximale d'un message vocal (données mobiles limitées). */
const VOCAL_MAX_MS = 5 * 60_000;
/** Taille maximale d'une pièce jointe (Synapse, configuration par défaut du projet). */
const FICHIER_MAX = 50 * 1024 * 1024;

/** Formats d'enregistrement par ordre de préférence (Opus : excellent à bas débit). */
function formatAudio(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/**
 * Zone de saisie : texte, niveau de classification, durée de vie, instruction de service,
 * pièces jointes et message vocal. La classification est choisie AVANT l'envoi et voyage
 * dans le contenu chiffré du message.
 */
@Component({
  selector: 'lf-composeur',
  imports: [TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composeur.component.html',
  styleUrl: './composeur.component.scss',
})
export class ComposeurComponent {
  private readonly salons = inject(SalonsService);
  private readonly envoi = inject(EnvoiService);
  private readonly politiques = inject(PolitiquesService);
  private readonly toasts = inject(ToastService);

  readonly roomId = input.required<string>();

  protected readonly niveaux = NIVEAUX;
  protected readonly texte = signal('');
  protected readonly niveau = signal<Niveau>('NORMAL');
  protected readonly dureeMs = signal(0);
  protected readonly instruction = signal(false);
  protected readonly options = signal(false);
  private readonly zone = viewChild<ElementRef<HTMLTextAreaElement>>('zone');

  protected readonly durees = computed(() => dureesProposees(this.politiques.politiques()[this.niveau()]));
  protected readonly peutEnvoyer = computed(() => this.texte().trim().length > 0);

  // Enregistrement vocal
  protected readonly enregistrement = signal(false);
  protected readonly ecoule = signal(0);
  protected readonly niveauxMicro = signal<number[]>([]);
  protected readonly vocalPossible = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!formatAudio();
  private recorder: MediaRecorder | null = null;
  private flux: MediaStream | null = null;
  private contexteAudio: AudioContext | null = null;
  private minuterie: ReturnType<typeof setInterval> | null = null;
  private morceaux: Blob[] = [];
  private forme: number[] = [];
  private debut = 0;
  private annule = false;

  protected readonly libelleDuree = (ms: number) => LIBELLES_DUREE[ms] ?? 'composeur.duree.j30';
  protected readonly format = duree;

  constructor() {
    // Changement de niveau : durée par défaut = maximum autorisé par la politique.
    effect(() => {
      const politique = this.politiques.politiques()[this.niveau()];
      const defaut = expirationParDefaut(politique, 0) ?? 0;
      untracked(() => this.dureeMs.set(defaut));
    });
    // Changement de conversation : brouillon remis à zéro (rien n'est conservé sur disque).
    effect(() => {
      this.roomId();
      untracked(() => {
        this.annulerVocal();
        this.texte.set('');
        this.niveau.set('NORMAL');
        this.instruction.set(false);
      });
    });
    inject(DestroyRef).onDestroy(() => this.annulerVocal());
  }

  private optionsEnvoi(): OptionsEnvoi {
    const d = this.dureeMs();
    return { niveau: this.niveau(), expireAt: d > 0 ? Date.now() + d : null, instruction: this.instruction() };
  }

  protected saisie(el: HTMLTextAreaElement): void {
    this.texte.set(el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  protected touche(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
      evt.preventDefault();
      this.envoyer();
    }
  }

  protected envoyer(): void {
    const texte = this.texte().trim();
    if (!texte) return;
    // matrix-js-sdk affiche le message immédiatement (écho local) et le garde en file
    // d'attente s'il n'y a pas de réseau : l'agent peut le renvoyer plus tard.
    void this.salons.envoyerTexte(this.roomId(), texte, this.optionsEnvoi()).catch(() => undefined);
    this.texte.set('');
    this.instruction.set(false);
    const zone = this.zone()?.nativeElement;
    if (zone) {
      zone.value = '';
      zone.style.height = 'auto';
      zone.focus();
    }
  }

  protected choisirFichiers(input: HTMLInputElement, image: boolean): void {
    const fichiers = Array.from(input.files ?? []);
    input.value = '';
    for (const f of fichiers) {
      if (f.size > FICHIER_MAX) {
        this.toasts.erreur('composeur.fichier_trop_gros', { nom: f.name });
        continue;
      }
      if (image && f.type.startsWith('image/')) this.envoi.envoyerImage(this.roomId(), f, this.optionsEnvoi());
      else this.envoi.envoyerFichier(this.roomId(), f, this.optionsEnvoi());
    }
    this.instruction.set(false);
  }

  // ───────────────────────────── Message vocal ─────────────────────────────

  protected async demarrerVocal(): Promise<void> {
    if (this.enregistrement()) return;
    try {
      this.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.toasts.erreur('composeur.micro_refuse');
      return;
    }
    const mime = formatAudio();
    // 24 kbit/s : voix intelligible, ~180 Ko par minute (adapté à la 2G/3G).
    this.recorder = new MediaRecorder(this.flux, { mimeType: mime, audioBitsPerSecond: 24_000 });
    this.morceaux = [];
    this.forme = [];
    this.annule = false;
    this.recorder.ondataavailable = (e) => e.data.size && this.morceaux.push(e.data);
    this.recorder.onstop = () => this.finaliserVocal(mime);

    // Analyse du volume pour dessiner la forme d'onde (envoyée avec le message, MSC1767).
    try {
      this.contexteAudio = new AudioContext();
      const analyseur = this.contexteAudio.createAnalyser();
      analyseur.fftSize = 512;
      this.contexteAudio.createMediaStreamSource(this.flux).connect(analyseur);
      const tampon = new Uint8Array(analyseur.fftSize);
      this.minuterie = setInterval(() => {
        analyseur.getByteTimeDomainData(tampon);
        let somme = 0;
        for (const v of tampon) somme += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(somme / tampon.length) * 3);
        this.forme.push(Math.round(rms * 1024));
        this.niveauxMicro.set(this.forme.slice(-32).map((x) => Math.max(0.1, x / 1024)));
        this.ecoule.set(Date.now() - this.debut);
        if (Date.now() - this.debut >= VOCAL_MAX_MS) this.arreterVocal();
      }, 100);
    } catch {
      this.minuterie = setInterval(() => this.ecoule.set(Date.now() - this.debut), 250);
    }

    this.debut = Date.now();
    this.ecoule.set(0);
    this.recorder.start(1000);
    this.enregistrement.set(true);
  }

  /** Arrêt + envoi. */
  protected arreterVocal(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  protected annulerVocal(): void {
    this.annule = true;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    else this.liberer();
  }

  private finaliserVocal(mime: string): void {
    const dureeMs = Date.now() - this.debut;
    const blob = new Blob(this.morceaux, { type: mime.split(';')[0] || 'audio/webm' });
    const forme = this.reduire(this.forme, 100);
    const annule = this.annule;
    this.liberer();
    if (annule) return;
    if (dureeMs < 800 || blob.size === 0) {
      this.toasts.afficher('info', 'composeur.vocal_trop_court');
      return;
    }
    this.envoi.envoyerVocal(this.roomId(), blob, dureeMs, forme, this.optionsEnvoi());
    this.instruction.set(false);
  }

  private liberer(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
    this.flux?.getTracks().forEach((t) => t.stop());
    this.flux = null;
    void this.contexteAudio?.close().catch(() => undefined);
    this.contexteAudio = null;
    this.recorder = null;
    this.morceaux = [];
    this.enregistrement.set(false);
    this.niveauxMicro.set([]);
  }

  private reduire(valeurs: number[], n: number): number[] {
    if (valeurs.length <= n) return valeurs;
    return Array.from({ length: n }, (_, i) => {
      const debut = Math.floor((i * valeurs.length) / n);
      const fin = Math.floor(((i + 1) * valeurs.length) / n);
      const tranche = valeurs.slice(debut, Math.max(fin, debut + 1));
      return Math.round(tranche.reduce((a, b) => a + b, 0) / tranche.length);
    });
  }
}
