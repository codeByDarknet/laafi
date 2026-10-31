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
import { TranslocoPipe } from '@jsverse/transloco';
import { MessageAffiche } from '../../core/matrix/messages';
import { PiecesJointesService } from '../../core/matrix/pieces-jointes.service';
import { duree, taille } from '../../ui/format';
import { IconeComponent } from '../../ui/icone.component';

/** Au-delà de cette taille, une image n'est téléchargée qu'à la demande (connexion lente). */
const AUTO_IMAGE_MAX = 1.5 * 1024 * 1024;

/**
 * Affichage d'une pièce jointe CHIFFRÉE (image, fichier, audio, vocal).
 * Le fichier est téléchargé chiffré, son SHA-256 vérifié, puis déchiffré localement
 * (clé AES de la pièce jointe transportée dans le message Megolm). Rien n'est mis en cache disque.
 */
@Component({
  selector: 'lf-piece-jointe',
  imports: [TranslocoPipe, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './piece-jointe.component.html',
  styleUrl: './piece-jointe.component.scss',
})
export class PieceJointeComponent {
  private readonly pj = inject(PiecesJointesService);
  readonly message = input.required<MessageAffiche>();
  /** Copie interdite (CONFIDENTIEL) : pas de bouton d'enregistrement. */
  readonly copieAutorisee = input(true);

  protected readonly url = signal<string | null>(null);
  protected readonly etat = signal<'attente' | 'chargement' | 'pret' | 'erreur'>('attente');
  protected readonly lecture = signal(false);
  protected readonly position = signal(0);
  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audio');

  protected readonly taille = computed(() => taille(this.message().taille));
  protected readonly duree = computed(() => duree(this.message().dureeMs));
  protected readonly ecoule = computed(() => duree(this.position() * 1000));
  protected readonly ratio = computed(() => {
    const m = this.message();
    return m.largeur && m.hauteur ? `${m.largeur} / ${m.hauteur}` : '4 / 3';
  });
  protected readonly progression = computed(() => {
    const total = (this.message().dureeMs ?? 0) / 1000;
    return total > 0 ? Math.min(1, this.position() / total) : 0;
  });

  /** Forme d'onde (MSC1767), ramenée à 40 barres de 0 à 1. */
  protected readonly barres = computed(() => {
    const brut = (this.message().evenement.getContent()['org.matrix.msc1767.audio'] as { waveform?: number[] } | undefined)
      ?.waveform;
    const source = Array.isArray(brut) && brut.length ? brut : Array.from({ length: 40 }, () => 300);
    const n = 40;
    const max = Math.max(...source, 1);
    return Array.from({ length: n }, (_, i) => {
      const v = source[Math.floor((i * source.length) / n)] ?? 0;
      return Math.max(0.12, v / max);
    });
  });

  constructor() {
    effect(() => {
      const m = this.message();
      if (m.genre === 'image' && (m.taille ?? 0) <= AUTO_IMAGE_MAX && this.etat() === 'attente') void this.charger();
    });
  }

  async charger(): Promise<string | null> {
    const m = this.message();
    if (!m.fichier) {
      this.etat.set('erreur');
      return null;
    }
    if (this.url()) return this.url();
    this.etat.set('chargement');
    try {
      const url = await this.pj.urlDechiffree(m.fichier, m.mimetype);
      this.url.set(url);
      this.etat.set('pret');
      return url;
    } catch {
      this.etat.set('erreur');
      return null;
    }
  }

  protected async basculerLecture(): Promise<void> {
    if (!(await this.charger())) return;
    // Laisse Angular poser [src] avant de lancer la lecture.
    await Promise.resolve();
    const el = this.audio()?.nativeElement;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        this.etat.set('erreur');
      }
    } else {
      el.pause();
    }
  }

  protected chercher(evt: MouseEvent): void {
    const el = this.audio()?.nativeElement;
    const total = (this.message().dureeMs ?? 0) / 1000 || el?.duration || 0;
    if (!el || !total || !this.url()) return;
    const zone = (evt.currentTarget as HTMLElement).getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (evt.clientX - zone.left) / zone.width)) * total;
  }

  protected async telecharger(): Promise<void> {
    const url = await this.charger();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = this.message().nomFichier || 'fichier';
    a.click();
  }
}
