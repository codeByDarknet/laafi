import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { EventType } from 'matrix-js-sdk';
import { MatrixClientService } from '../matrix/matrix-client.service';
import { estExpire, expirationDuContenu } from './classification';

/**
 * Expiration automatique des messages (`bf.laafi.expire_at`, contrat §5).
 *
 *  1. Tous les clients MASQUENT un message dès son échéance (signal `maintenant`).
 *  2. Le client de l'ÉMETTEUR « rédige » ensuite l'événement (redaction Matrix) : Synapse
 *     efface alors le contenu chiffré de sa base et le retire chez tous les destinataires.
 *     Seul l'émetteur (ou un modérateur) peut rédiger ; d'où cette répartition des rôles.
 */
@Injectable({ providedIn: 'root' })
export class ExpirationService {
  private readonly matrix = inject(MatrixClientService);
  /** Horloge partagée (rafraîchie toutes les 15 s) qui fait disparaître les messages échus. */
  readonly maintenant = signal(Date.now());
  private readonly dejaRediges = new Set<string>();
  private minuteur: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.arreter());
  }

  demarrer(): void {
    if (this.minuteur) return;
    this.minuteur = setInterval(() => {
      this.maintenant.set(Date.now());
      void this.redigerMesMessagesEchus();
    }, 15_000);
  }

  arreter(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  async redigerMesMessagesEchus(): Promise<void> {
    if (!this.matrix.demarre || this.matrix.etat() !== 'pret') return;
    const client = this.matrix.client;
    const monId = this.matrix.monId;
    const maintenant = Date.now();
    for (const room of client.getRooms()) {
      for (const ev of room.getLiveTimeline().getEvents()) {
        const id = ev.getId();
        if (!id?.startsWith('$') || ev.getSender() !== monId || ev.isRedacted()) continue;
        if (ev.getType() !== EventType.RoomMessage && ev.getType() !== EventType.RoomMessageEncrypted) continue;
        if (this.dejaRediges.has(id)) continue;
        const expire = expirationDuContenu(ev.getContent());
        if (!estExpire(expire, maintenant)) continue;
        this.dejaRediges.add(id);
        try {
          await client.redactEvent(room.roomId, id, undefined, { reason: 'expiration' });
        } catch {
          this.dejaRediges.delete(id); // nouvel essai au prochain passage (réseau)
        }
      }
    }
  }
}
