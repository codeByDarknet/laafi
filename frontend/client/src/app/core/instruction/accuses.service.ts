import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { MatrixEvent } from 'matrix-js-sdk';
import { ApiService } from '../api/api.service';
import { EntreeAccuse, Preuve } from '../api/modeles';
import { empreinteInstruction } from './empreinte';

const CLE_LOCALE = 'laafi.accuses';

/**
 * Accusés de lecture PROBANTS des instructions de service.
 *
 * Le destinataire clique « J'en ai pris connaissance » :
 *   empreinte = SHA-256( JSON canonique du contenu DÉCHIFFRÉ )  → POST /api/v1/accuses
 * Le backend horodate, chaîne (hash de l'entrée précédente) et signe (Ed25519) l'entrée.
 * L'émetteur consulte la liste et peut recalculer l'empreinte de SON message : si elles
 * concordent, c'est la preuve que le destinataire a reconnu exactement ce texte.
 *
 * Localement, on ne mémorise que « eventId → identifiant de preuve » (aucun contenu).
 */
@Injectable({ providedIn: 'root' })
export class AccusesService {
  private readonly api = inject(ApiService);
  /** Instructions déjà reconnues par moi : eventId → id de la preuve (ou 'oui'). */
  readonly reconnues = signal<Record<string, string>>(lireLocal());

  dejaReconnue(eventId: string | null): boolean {
    return !!eventId && eventId in this.reconnues();
  }

  async empreinte(ev: MatrixEvent): Promise<string> {
    return empreinteInstruction(ev.getContent() as Record<string, unknown>);
  }

  async prendreConnaissance(roomId: string, ev: MatrixEvent): Promise<Preuve | null> {
    const eventId = ev.getId();
    if (!eventId) throw new Error('evenement-non-envoye');
    const empreinte = await this.empreinte(ev);
    try {
      const preuve = await this.api.accuser(roomId, eventId, empreinte);
      this.memoriser(eventId, String(preuve.entree?.id ?? 'oui'));
      return preuve;
    } catch (e) {
      // 409 : accusé déjà enregistré (par exemple depuis un autre appareil).
      if (e instanceof HttpErrorResponse && e.status === 409) {
        this.memoriser(eventId, 'oui');
        return null;
      }
      throw e;
    }
  }

  liste(eventId: string): Promise<EntreeAccuse[]> {
    return this.api.accusesDe(eventId);
  }

  preuve(id: number | string): Promise<Preuve> {
    return this.api.preuve(id);
  }

  private memoriser(eventId: string, id: string): void {
    this.reconnues.update((r) => ({ ...r, [eventId]: id }));
    try {
      localStorage.setItem(CLE_LOCALE, JSON.stringify(this.reconnues()));
    } catch {
      /* stockage plein ou indisponible : sans conséquence, le serveur fait foi */
    }
  }
}

function lireLocal(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLE_LOCALE) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
