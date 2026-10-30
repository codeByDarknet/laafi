import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONFIG } from '../config';
import {
  Canal,
  EntreeAccuse,
  EntreeAnnuaire,
  Ministere,
  Page,
  Preuve,
  Profil,
  ResultatOperation,
} from './modeles';

/** Accès typé au backend Laafi (contrat §4). Le JWT est ajouté par jetonInterceptor. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = CONFIG.apiBase;

  moi(): Promise<Profil> {
    return firstValueFrom(this.http.get<Profil>(`${this.base}/me`));
  }

  annuaire(q: string, ministere: string | null, page = 0): Promise<Page<EntreeAnnuaire>> {
    let params = new HttpParams().set('page', page);
    if (q) params = params.set('q', q);
    if (ministere) params = params.set('ministere', ministere);
    return firstValueFrom(this.http.get<Page<EntreeAnnuaire>>(`${this.base}/annuaire`, { params }));
  }

  ministeres(): Promise<Ministere[]> {
    return firstValueFrom(this.http.get<Ministere[]>(`${this.base}/ministeres`));
  }

  politiques(): Promise<unknown> {
    return firstValueFrom(this.http.get<unknown>(`${this.base}/politiques`));
  }

  canaux(): Promise<Canal[]> {
    return firstValueFrom(this.http.get<Canal[]>(`${this.base}/canaux`));
  }

  declarerCanal(canal: Canal): Promise<Canal> {
    return firstValueFrom(this.http.post<Canal>(`${this.base}/canaux`, canal));
  }

  /** Accusé probant : seule l'EMPREINTE du message part, jamais son contenu. */
  accuser(roomId: string, eventId: string, empreinte: string): Promise<Preuve> {
    return firstValueFrom(this.http.post<Preuve>(`${this.base}/accuses`, { roomId, eventId, empreinte }));
  }

  accusesDe(eventId: string): Promise<EntreeAccuse[]> {
    const params = new HttpParams().set('eventId', eventId);
    return firstValueFrom(this.http.get<EntreeAccuse[]>(`${this.base}/accuses`, { params }));
  }

  preuve(id: number | string): Promise<Preuve> {
    return firstValueFrom(this.http.get<Preuve>(`${this.base}/accuses/${encodeURIComponent(String(id))}/preuve`));
  }

  /** Bouton d'urgence : le serveur supprime tous les appareils de l'agent. */
  urgence(): Promise<ResultatOperation> {
    return firstValueFrom(this.http.post<ResultatOperation>(`${this.base}/me/urgence`, {}));
  }
}

/** Clé i18n du message d'erreur à afficher pour une erreur HTTP du backend. */
export function cleErreurApi(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'erreurs.reseau';
    if (err.status === 401) return 'erreurs.session_api';
    if (err.status === 403) return 'erreurs.interdit';
    if (err.status === 404) return 'erreurs.introuvable';
    if (err.status === 409) return 'erreurs.conflit';
    if (err.status >= 500) return 'erreurs.serveur';
  }
  return 'erreurs.inconnue';
}
