import { EventStatus, EventType, MatrixEvent, MsgType } from 'matrix-js-sdk';
import {
  Niveau,
  estInstruction,
  expirationDuContenu,
  niveauDuContenu,
} from '../classification/classification';
import type { FichierChiffre } from './pieces-jointes.service';

/** Clé non standard (MSC3245) qui distingue un message vocal d'un simple fichier audio. */
export const CHAMP_VOCAL = 'org.matrix.msc3245.voice';

export type GenreMessage = 'texte' | 'image' | 'fichier' | 'audio' | 'vocal' | 'indechiffrable' | 'dechiffrement' | 'supprime' | 'inconnu';
export type StatutEnvoi = 'envoye' | 'en-cours' | 'echec';

/** Vue d'un message prête pour l'affichage (contenu DÉJÀ déchiffré localement). */
export interface MessageAffiche {
  id: string;
  eventId: string | null;
  expediteur: string;
  sortant: boolean;
  horodatage: number;
  genre: GenreMessage;
  texte: string;
  niveau: Niveau;
  expireAt: number | null;
  instruction: boolean;
  statut: StatutEnvoi;
  fichier: FichierChiffre | null;
  mimetype: string;
  nomFichier: string;
  taille: number | null;
  largeur: number | null;
  hauteur: number | null;
  dureeMs: number | null;
  evenement: MatrixEvent;
}

/** Événements affichés comme messages (le reste — état du salon, réactions… — est ignoré). */
export function estMessage(ev: MatrixEvent): boolean {
  const type = ev.getType();
  return type === EventType.RoomMessage || type === EventType.RoomMessageEncrypted;
}

export function versMessage(ev: MatrixEvent, monId: string): MessageAffiche {
  const contenu = (ev.getContent() ?? {}) as Record<string, unknown>;
  const info = (contenu['info'] ?? {}) as Record<string, unknown>;
  const fichier = (contenu['file'] as FichierChiffre | undefined) ?? null;
  const statut: StatutEnvoi =
    ev.status === EventStatus.NOT_SENT
      ? 'echec'
      : ev.status === null || ev.status === EventStatus.SENT
        ? 'envoye'
        : 'en-cours';

  return {
    id: ev.getId() ?? ev.getTxnId() ?? `local-${ev.localTimestamp}`,
    eventId: ev.getId()?.startsWith('$') ? ev.getId()! : null,
    expediteur: ev.getSender() ?? '',
    sortant: ev.getSender() === monId,
    horodatage: ev.getTs(),
    genre: genreDe(ev, contenu),
    texte: typeof contenu['body'] === 'string' ? (contenu['body'] as string) : '',
    niveau: niveauDuContenu(contenu),
    expireAt: expirationDuContenu(contenu),
    instruction: estInstruction(contenu),
    statut,
    fichier,
    mimetype: typeof info['mimetype'] === 'string' ? (info['mimetype'] as string) : (fichier?.mimetype ?? ''),
    nomFichier: typeof contenu['filename'] === 'string' ? (contenu['filename'] as string) : String(contenu['body'] ?? ''),
    taille: typeof info['size'] === 'number' ? (info['size'] as number) : null,
    largeur: typeof info['w'] === 'number' ? (info['w'] as number) : null,
    hauteur: typeof info['h'] === 'number' ? (info['h'] as number) : null,
    dureeMs: typeof info['duration'] === 'number' ? (info['duration'] as number) : null,
    evenement: ev,
  };
}

function genreDe(ev: MatrixEvent, contenu: Record<string, unknown>): GenreMessage {
  if (ev.isRedacted()) return 'supprime';
  if (ev.isDecryptionFailure()) return 'indechiffrable';
  if (ev.isBeingDecrypted() || ev.getType() === EventType.RoomMessageEncrypted) return 'dechiffrement';
  switch (contenu['msgtype']) {
    case MsgType.Text:
    case MsgType.Notice:
    case MsgType.Emote:
      return 'texte';
    case MsgType.Image:
      return 'image';
    case MsgType.Audio:
      return contenu[CHAMP_VOCAL] ? 'vocal' : 'audio';
    case MsgType.File:
    case MsgType.Video:
      return 'fichier';
    default:
      return 'inconnu';
  }
}

/** Texte court pour l'aperçu dans la liste des conversations (clé i18n ou texte). */
export function apercu(m: MessageAffiche): { cle: string | null; texte: string } {
  switch (m.genre) {
    case 'texte':
      return { cle: null, texte: m.texte };
    case 'image':
      return { cle: 'apercu.image', texte: '' };
    case 'vocal':
      return { cle: 'apercu.vocal', texte: '' };
    case 'audio':
    case 'fichier':
      return { cle: 'apercu.fichier', texte: '' };
    case 'supprime':
      return { cle: 'apercu.supprime', texte: '' };
    case 'indechiffrable':
      return { cle: 'apercu.indechiffrable', texte: '' };
    case 'dechiffrement':
      return { cle: 'apercu.dechiffrement', texte: '' };
    default:
      return { cle: 'apercu.inconnu', texte: '' };
  }
}

/** Initiales pour les avatars (« Issa Kaboré » → « IK », « @paul.zongo:… » → « PZ »). */
export function initiales(nom: string): string {
  const propre = nom.replace(/^@/, '').replace(/:.*$/, '').replace(/[._-]+/g, ' ').trim();
  const mots = propre.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2);
  return (mots[0][0] + mots[mots.length - 1][0]);
}

/** Teinte d'avatar stable (0–5) dérivée de l'identifiant. */
export function teinte(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 6;
}
