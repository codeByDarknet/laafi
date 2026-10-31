import { Injectable, computed, inject } from '@angular/core';
import {
  EventStatus,
  EventType,
  ICreateRoomOpts,
  KnownMembership,
  MatrixEvent,
  NotificationCountType,
  Preset,
  ReceiptType,
  Room,
  Visibility,
} from 'matrix-js-sdk';
import { Niveau, champsLaafi } from '../classification/classification';
import { MatrixClientService } from './matrix-client.service';
import { MessageAffiche, estMessage, versMessage } from './messages';

/**
 * Salons Matrix : liste, création, envoi.
 *
 * RÈGLE DE SÉCURITÉ (contrat §5) : TOUT salon créé par Laafi est chiffré dès sa création.
 * L'état `m.room.encryption` est placé dans `initial_state` : il n'existe donc aucun instant
 * où un message pourrait partir en clair. Le chiffrement ne peut plus être retiré ensuite.
 *  - history_visibility = joined : un nouveau membre ne lit pas l'historique antérieur ;
 *  - join_rule = invite          : on n'entre que sur invitation ;
 *  - guest_access = forbidden    : aucun invité anonyme.
 */

export type TypeSalon = 'direct' | 'groupe' | 'canal';

export interface ResumeSalon {
  id: string;
  nom: string;
  type: TypeSalon;
  invitation: boolean;
  invitePar: string | null;
  nonLus: number;
  dernier: MessageAffiche | null;
  activite: number;
  /** Interlocuteur d'une discussion directe. */
  correspondant: string | null;
}

/** Marqueur posé dans `creation_content` pour reconnaître un canal institutionnel. */
export const TYPE_CANAL = 'bf.laafi.type';

export function etatInitialChiffre(): ICreateRoomOpts['initial_state'] {
  return [
    { type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    { type: EventType.RoomHistoryVisibility, state_key: '', content: { history_visibility: 'joined' } },
    { type: EventType.RoomJoinRules, state_key: '', content: { join_rule: 'invite' } },
    { type: EventType.RoomGuestAccess, state_key: '', content: { guest_access: 'forbidden' } },
  ];
}

export interface OptionsEnvoi {
  niveau: Niveau;
  expireAt: number | null;
  instruction: boolean;
}

@Injectable({ providedIn: 'root' })
export class SalonsService {
  private readonly matrix = inject(MatrixClientService);

  /** Liste réactive des conversations, triée par activité récente. */
  readonly salons = computed<ResumeSalon[]>(() => {
    this.matrix.version();
    if (!this.matrix.demarre) return [];
    const client = this.matrix.client;
    const directs = this.mapDirects();
    return client
      .getRooms()
      .filter((r) => {
        const m = r.getMyMembership();
        return (m === KnownMembership.Join || m === KnownMembership.Invite) && !r.isSpaceRoom();
      })
      .map((r) => this.resumer(r, directs))
      .sort((a, b) => Number(b.invitation) - Number(a.invitation) || b.activite - a.activite);
  });

  salon(roomId: string): Room | null {
    return this.matrix.demarre ? this.matrix.client.getRoom(roomId) : null;
  }

  typeDe(room: Room, directs = this.mapDirects()): TypeSalon {
    const creation = room.currentState.getStateEvents(EventType.RoomCreate, '');
    if (creation?.getContent()?.[TYPE_CANAL] === 'canal') return 'canal';
    if (directs.has(room.roomId)) return 'direct';
    // Invitation à une discussion directe (pas encore dans m.direct)
    const moi = room.getMember(this.matrix.monId);
    if (room.getMyMembership() === KnownMembership.Invite && moi?.events.member?.getContent()['is_direct']) return 'direct';
    return 'groupe';
  }

  /** Messages chargés du salon (ligne de temps « live » + envois en attente). */
  messages(room: Room): MessageAffiche[] {
    const monId = this.matrix.monId;
    const evenements = [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()];
    const vus = new Set<string>();
    const resultat: MessageAffiche[] = [];
    for (const ev of evenements) {
      if (!estMessage(ev)) continue;
      const id = ev.getId() ?? ev.getTxnId() ?? '';
      if (vus.has(id)) continue;
      vus.add(id);
      // Les remplacements (éditions) ne sont pas affichés comme messages distincts.
      if (ev.isRelation(EventType.RoomMessage) || ev.getRelation()?.rel_type === 'm.replace') continue;
      resultat.push(versMessage(ev, monId));
    }
    return resultat;
  }

  nomAffiche(userId: string, room?: Room | null): string {
    if (!this.matrix.demarre) return userId;
    const membre = room?.getMember(userId);
    if (membre?.name && membre.name !== userId) return membre.name;
    const utilisateur = this.matrix.client.getUser(userId);
    return utilisateur?.displayName || userId.replace(/^@/, '').replace(/:.*$/, '');
  }

  // ───────────────────────────── Création ─────────────────────────────

  /** Discussion directe : réutilise la conversation existante avec cet agent si elle existe. */
  async creerDirect(userId: string): Promise<string> {
    const existant = this.directAvec(userId);
    if (existant) return existant;
    const { room_id } = await this.matrix.client.createRoom({
      preset: Preset.TrustedPrivateChat,
      visibility: Visibility.Private,
      is_direct: true,
      invite: [userId],
      initial_state: etatInitialChiffre(),
    });
    await this.ajouterDirect(userId, room_id);
    return room_id;
  }

  async creerGroupe(nom: string, membres: string[], sujet?: string): Promise<string> {
    const { room_id } = await this.matrix.client.createRoom({
      preset: Preset.PrivateChat,
      visibility: Visibility.Private,
      name: nom,
      topic: sujet || undefined,
      invite: membres,
      initial_state: etatInitialChiffre(),
    });
    return room_id;
  }

  /**
   * Canal institutionnel : seuls les modérateurs (niveau 50) publient, les autres membres
   * lisent. Le backend n'enregistre que les métadonnées (POST /api/v1/canaux).
   */
  async creerCanal(nom: string, membres: string[], sujet?: string): Promise<string> {
    const { room_id } = await this.matrix.client.createRoom({
      preset: Preset.PrivateChat,
      visibility: Visibility.Private,
      name: nom,
      topic: sujet || undefined,
      invite: membres,
      creation_content: { [TYPE_CANAL]: 'canal' },
      power_level_content_override: { events_default: 50 },
      initial_state: etatInitialChiffre(),
    });
    return room_id;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  async inviter(roomId: string, userId: string): Promise<void> {
    await this.matrix.client.invite(roomId, userId);
  }

  async accepter(roomId: string): Promise<void> {
    await this.matrix.client.joinRoom(roomId);
    const room = this.salon(roomId);
    if (room && this.typeDe(room) === 'direct') {
      const invitant = room.getMember(this.matrix.monId)?.events.member?.getSender();
      if (invitant) await this.ajouterDirect(invitant, roomId);
    }
  }

  async quitter(roomId: string): Promise<void> {
    await this.matrix.client.leave(roomId);
    await this.matrix.client.forget(roomId).catch(() => undefined);
  }

  peutPublier(room: Room): boolean {
    return room.currentState.maySendMessage(this.matrix.monId);
  }

  peutInviter(room: Room): boolean {
    return room.canInvite(this.matrix.monId);
  }

  // ───────────────────────────── Envoi ─────────────────────────────

  /**
   * Les champs `bf.laafi.*` sont ajoutés AU CONTENU avant l'envoi : matrix-js-sdk chiffre
   * ensuite l'ensemble avec la clé Megolm du salon. Le serveur ne voit que `m.room.encrypted`.
   */
  async envoyerTexte(roomId: string, texte: string, options: OptionsEnvoi): Promise<void> {
    const contenu = {
      msgtype: 'm.text',
      body: texte,
      ...champsLaafi(options.niveau, options.expireAt, options.instruction),
    };
    await this.matrix.client.sendEvent(roomId, EventType.RoomMessage, contenu as never);
  }

  async envoyerContenu(roomId: string, contenu: Record<string, unknown>): Promise<void> {
    await this.matrix.client.sendEvent(roomId, EventType.RoomMessage, contenu as never);
  }

  /** Copie d'un message vers un autre salon (le contenu et sa classification sont conservés). */
  async transferer(message: MessageAffiche, roomCible: string): Promise<void> {
    const { ['m.relates_to']: _r, ['m.new_content']: _n, ...contenu } = message.evenement.getContent() as Record<string, unknown>;
    await this.envoyerContenu(roomCible, contenu);
  }

  /** Renvoie les messages restés en échec (file d'envoi hors ligne). */
  async renvoyerEnAttente(): Promise<number> {
    if (!this.matrix.demarre) return 0;
    const client = this.matrix.client;
    let n = 0;
    for (const room of client.getRooms()) {
      for (const ev of room.getPendingEvents()) {
        if (ev.status === EventStatus.NOT_SENT) {
          n++;
          await client.resendEvent(ev, room).catch(() => undefined);
        }
      }
    }
    return n;
  }

  renvoyer(message: MessageAffiche): Promise<unknown> {
    const room = this.salon(message.evenement.getRoomId() ?? '');
    if (!room) return Promise.resolve();
    return this.matrix.client.resendEvent(message.evenement, room);
  }

  annulerEnvoi(message: MessageAffiche): void {
    this.matrix.client.cancelPendingEvent(message.evenement);
  }

  /**
   * Accusé de lecture PRIVÉ (`m.read.private`) : le serveur sait où l'agent en est (compteur
   * de non-lus), mais les autres membres ne le voient pas. Moins de métadonnées exposées.
   */
  async marquerLu(room: Room): Promise<void> {
    const evenements = room.getLiveTimeline().getEvents();
    const dernier = [...evenements].reverse().find((e) => e.getId()?.startsWith('$'));
    if (!dernier) return;
    if (room.getEventReadUpTo(this.matrix.monId) === dernier.getId()) return;
    await this.matrix.client.sendReadReceipt(dernier, ReceiptType.ReadPrivate).catch(() => undefined);
  }

  async supprimer(roomId: string, eventId: string, raison?: string): Promise<void> {
    await this.matrix.client.redactEvent(roomId, eventId, undefined, raison ? { reason: raison } : undefined);
  }

  /** Charge des messages plus anciens (pagination arrière). */
  async chargerPlusAnciens(room: Room): Promise<boolean> {
    return this.matrix.client.scrollback(room, 20).then(() => room.oldState.paginationToken !== null);
  }

  // ───────────────────────────── Interne ─────────────────────────────

  private resumer(room: Room, directs: Map<string, string>): ResumeSalon {
    const type = this.typeDe(room, directs);
    const invitation = room.getMyMembership() === KnownMembership.Invite;
    const messages = invitation ? [] : this.messages(room);
    const dernier = messages.length ? messages[messages.length - 1] : null;
    const invitePar = invitation ? (room.getMember(this.matrix.monId)?.events.member?.getSender() ?? null) : null;
    return {
      id: room.roomId,
      nom: room.name || room.roomId,
      type,
      invitation,
      invitePar,
      nonLus: room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0,
      dernier,
      activite: dernier?.horodatage ?? room.getLastActiveTimestamp() ?? 0,
      correspondant: type === 'direct' ? (directs.get(room.roomId) ?? invitePar) : null,
    };
  }

  /** roomId → interlocuteur, d'après les données de compte `m.direct`. */
  private mapDirects(): Map<string, string> {
    const map = new Map<string, string>();
    const contenu = this.matrix.client.getAccountData(EventType.Direct)?.getContent() as Record<string, string[]> | undefined;
    for (const [userId, rooms] of Object.entries(contenu ?? {})) {
      for (const r of rooms ?? []) map.set(r, userId);
    }
    return map;
  }

  private directAvec(userId: string): string | null {
    const contenu = this.matrix.client.getAccountData(EventType.Direct)?.getContent() as Record<string, string[]> | undefined;
    for (const roomId of contenu?.[userId] ?? []) {
      const room = this.matrix.client.getRoom(roomId);
      if (room?.getMyMembership() === KnownMembership.Join) return roomId;
    }
    return null;
  }

  private async ajouterDirect(userId: string, roomId: string): Promise<void> {
    const client = this.matrix.client;
    const contenu = { ...((client.getAccountData(EventType.Direct)?.getContent() as Record<string, string[]>) ?? {}) };
    const liste = new Set(contenu[userId] ?? []);
    liste.add(roomId);
    contenu[userId] = [...liste];
    await client.setAccountData(EventType.Direct, contenu as never);
  }
}

/** Vrai si l'événement est un message envoyé par moi (pour l'expiration côté émetteur). */
export function estDeMoi(ev: MatrixEvent, monId: string): boolean {
  return ev.getSender() === monId;
}
