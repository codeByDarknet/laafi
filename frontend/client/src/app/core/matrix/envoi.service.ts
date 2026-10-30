import { Injectable, inject, signal } from '@angular/core';
import { MsgType } from 'matrix-js-sdk';
import { champsLaafi } from '../classification/classification';
import { CHAMP_VOCAL } from './messages';
import { PiecesJointesService, compresserImage } from './pieces-jointes.service';
import { OptionsEnvoi } from './salons.service';
import { MatrixClientService } from './matrix-client.service';

/**
 * File d'envoi des pièces jointes (réseau faible).
 *
 * Les messages TEXTE en échec restent gérés par matrix-js-sdk (statut NOT_SENT, renvoyés
 * au retour du réseau). Pour les fichiers, le chiffrement + téléversement peut échouer
 * avant même la création de l'événement : on garde alors la tâche EN MÉMOIRE et on la
 * relance automatiquement. Rien n'est écrit en clair sur le disque : si l'onglet est fermé,
 * la file est perdue (choix volontaire de confidentialité).
 */

export type GenrePieceJointe = 'image' | 'fichier' | 'vocal';

export interface EnvoiEnAttente {
  id: number;
  roomId: string;
  genre: GenrePieceJointe;
  nom: string;
  taille: number;
  statut: 'preparation' | 'televersement' | 'echec';
  creeLe: number;
}

interface Tache extends EnvoiEnAttente {
  donnees: Blob;
  mimetype: string;
  options: OptionsEnvoi;
  dureeMs?: number;
  forme?: number[];
}

@Injectable({ providedIn: 'root' })
export class EnvoiService {
  private readonly matrix = inject(MatrixClientService);
  private readonly pj = inject(PiecesJointesService);
  private readonly taches = new Map<number, Tache>();
  private suivant = 1;
  readonly enAttente = signal<EnvoiEnAttente[]>([]);

  envoyerImage(roomId: string, fichier: File, options: OptionsEnvoi): void {
    this.ajouter({ roomId, genre: 'image', nom: fichier.name || 'image', donnees: fichier, mimetype: fichier.type, options });
  }

  envoyerFichier(roomId: string, fichier: File, options: OptionsEnvoi): void {
    this.ajouter({
      roomId,
      genre: 'fichier',
      nom: fichier.name || 'document',
      donnees: fichier,
      mimetype: fichier.type || 'application/octet-stream',
      options,
    });
  }

  envoyerVocal(roomId: string, audio: Blob, dureeMs: number, forme: number[], options: OptionsEnvoi): void {
    const extension = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'm4a' : 'webm';
    this.ajouter({
      roomId,
      genre: 'vocal',
      nom: `message-vocal.${extension}`,
      donnees: audio,
      mimetype: audio.type || 'audio/webm',
      options,
      dureeMs,
      forme,
    });
  }

  /** Relance toutes les tâches en échec (appelé au retour du réseau). */
  relancer(): void {
    for (const t of this.taches.values()) if (t.statut === 'echec') void this.executer(t);
  }

  reessayer(id: number): void {
    const t = this.taches.get(id);
    if (t) void this.executer(t);
  }

  abandonner(id: number): void {
    this.taches.delete(id);
    this.publier();
  }

  vider(): void {
    this.taches.clear();
    this.publier();
  }

  private ajouter(t: Omit<Tache, 'id' | 'statut' | 'creeLe' | 'taille'>): void {
    const tache: Tache = { ...t, id: this.suivant++, statut: 'preparation', creeLe: Date.now(), taille: t.donnees.size };
    this.taches.set(tache.id, tache);
    this.publier();
    void this.executer(tache);
  }

  private async executer(t: Tache): Promise<void> {
    try {
      this.maj(t, 'preparation');
      const contenu = await this.construireContenu(t);
      if (!this.taches.has(t.id)) return; // abandonnée entre-temps
      await this.matrix.client.sendMessage(t.roomId, contenu as never);
      this.taches.delete(t.id);
      this.publier();
    } catch {
      if (this.taches.has(t.id)) this.maj(t, 'echec');
    }
  }

  private async construireContenu(t: Tache): Promise<Record<string, unknown>> {
    const laafi = champsLaafi(t.options.niveau, t.options.expireAt, t.options.instruction);
    if (t.genre === 'image') {
      const image = await compresserImage(t.donnees as File).catch(() => null);
      const blob = image?.blob ?? t.donnees;
      const mimetype = image?.mimetype ?? t.mimetype;
      this.maj(t, 'televersement');
      const file = await this.pj.chiffrerEtTeleverser(blob, mimetype);
      return {
        msgtype: MsgType.Image,
        body: t.nom,
        info: { mimetype, size: blob.size, w: image?.largeur, h: image?.hauteur },
        file,
        ...laafi,
      };
    }
    this.maj(t, 'televersement');
    const file = await this.pj.chiffrerEtTeleverser(t.donnees, t.mimetype);
    if (t.genre === 'vocal') {
      return {
        msgtype: MsgType.Audio,
        body: t.nom,
        info: { mimetype: t.mimetype, size: t.donnees.size, duration: t.dureeMs },
        file,
        // Forme d'onde (MSC1767) et marqueur « message vocal » (MSC3245) : compris par Element.
        'org.matrix.msc1767.audio': { duration: t.dureeMs, waveform: t.forme ?? [] },
        [CHAMP_VOCAL]: {},
        ...laafi,
      };
    }
    return {
      msgtype: MsgType.File,
      body: t.nom,
      filename: t.nom,
      info: { mimetype: t.mimetype, size: t.donnees.size },
      file,
      ...laafi,
    };
  }

  private maj(t: Tache, statut: Tache['statut']): void {
    t.statut = statut;
    this.publier();
  }

  private publier(): void {
    this.enAttente.set(
      [...this.taches.values()].map(({ id, roomId, genre, nom, taille, statut, creeLe }) => ({
        id,
        roomId,
        genre,
        nom,
        taille,
        statut,
        creeLe,
      })),
    );
  }
}
