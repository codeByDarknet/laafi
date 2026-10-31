import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AgentDetail,
  AgentResume,
  CanalInstitutionnel,
  CanalRequete,
  Classification,
  EnrolementReponse,
  EnrolementRequete,
  EntreeAccuse,
  ErreurApi,
  EvenementAudit,
  FiltreAgents,
  Ministere,
  Page,
  PolitiqueClassification,
  PolitiqueRequete,
  Preuve,
  Profil,
  RapportVerification,
  ResultatOperation,
} from './models';

/** Préfixe de l'API, relatif à l'origine (la passerelle nginx route /api/ vers le backend). */
export const API = '/api/v1';

/**
 * Accès typé à l'API du backend Laafi. Une méthode = un endpoint du contrat §4.
 * Le jeton Bearer est ajouté par authInterceptor, pas ici.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  moi(): Observable<Profil> {
    return this.http.get<Profil>(`${API}/me`);
  }

  ministeres(): Observable<Ministere[]> {
    return this.http.get<Ministere[]>(`${API}/ministeres`);
  }

  // --- Agents ---------------------------------------------------------------

  agents(filtre: FiltreAgents = {}): Observable<AgentResume[]> {
    return this.http.get<AgentResume[]>(`${API}/agents`, { params: parametres({ ...filtre }) });
  }

  agent(username: string): Observable<AgentDetail> {
    return this.http.get<AgentDetail>(`${API}/agents/${encodeURIComponent(username)}`);
  }

  enroler(req: EnrolementRequete): Observable<EnrolementReponse> {
    return this.http.post<EnrolementReponse>(`${API}/agents`, req);
  }

  /** Révocation totale : compte Keycloak désactivé + compte Matrix désactivé (motif obligatoire). */
  revoquer(username: string, motif: string): Observable<ResultatOperation> {
    return this.http.post<ResultatOperation>(`${API}/agents/${encodeURIComponent(username)}/revocation`, { motif });
  }

  /** Perte de téléphone : suppression de tous les appareils Matrix + déconnexion Keycloak. */
  revoquerAppareils(username: string, motif?: string): Observable<ResultatOperation> {
    return this.http.post<ResultatOperation>(
      `${API}/agents/${encodeURIComponent(username)}/appareils/revocation`,
      motif ? { motif } : {},
    );
  }

  /** Réactivation (super_admin uniquement, vérifié aussi côté backend). */
  reactiver(username: string, motif?: string): Observable<ResultatOperation> {
    return this.http.post<ResultatOperation>(
      `${API}/agents/${encodeURIComponent(username)}/reactivation`,
      motif ? { motif } : {},
    );
  }

  // --- Politiques, canaux ---------------------------------------------------

  politiques(): Observable<PolitiqueClassification[]> {
    return this.http.get<PolitiqueClassification[]>(`${API}/politiques`);
  }

  modifierPolitique(niveau: Classification, req: PolitiqueRequete): Observable<PolitiqueClassification> {
    return this.http.put<PolitiqueClassification>(`${API}/politiques/${niveau}`, req);
  }

  canaux(ministere?: string): Observable<CanalInstitutionnel[]> {
    return this.http.get<CanalInstitutionnel[]>(`${API}/canaux`, { params: parametres({ ministere }) });
  }

  enregistrerCanal(req: CanalRequete): Observable<CanalInstitutionnel> {
    return this.http.post<CanalInstitutionnel>(`${API}/canaux`, req);
  }

  // --- Journal probant, audit -----------------------------------------------

  accuses(eventId: string): Observable<EntreeAccuse[]> {
    return this.http.get<EntreeAccuse[]>(`${API}/accuses`, { params: parametres({ eventId }) });
  }

  preuve(id: number): Observable<Preuve> {
    return this.http.get<Preuve>(`${API}/accuses/${id}/preuve`);
  }

  verifierJournal(): Observable<RapportVerification> {
    return this.http.get<RapportVerification>(`${API}/journal/verification`);
  }

  audit(page = 0): Observable<Page<EvenementAudit>> {
    return this.http.get<Page<EvenementAudit>>(`${API}/audit`, { params: parametres({ page }) });
  }
}

/** Construit des paramètres de requête en ignorant les valeurs vides. */
function parametres(valeurs: Record<string, string | number | undefined | null>): HttpParams {
  let p = new HttpParams();
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (valeur !== undefined && valeur !== null && `${valeur}`.trim() !== '') {
      p = p.set(cle, `${valeur}`.trim());
    }
  }
  return p;
}

/**
 * Message lisible à partir d'une erreur HTTP : on privilégie le message (déjà en français) renvoyé
 * par le backend `{ code, message }`, sinon un message générique traduit selon le statut.
 */
export function messageErreur(err: unknown, traduire: (cle: string) => string): string {
  if (err instanceof HttpErrorResponse) {
    const corps = err.error as Partial<ErreurApi> | null;
    if (corps && typeof corps === 'object' && typeof corps.message === 'string' && corps.message) {
      return corps.message;
    }
    if (err.status === 0) return traduire('erreurs.reseau');
    if (err.status === 401) return traduire('erreurs.session');
    if (err.status === 403) return traduire('erreurs.interdit');
    if (err.status === 404) return traduire('erreurs.introuvable');
    if (err.status >= 500) return traduire('erreurs.serveur');
  }
  return traduire('erreurs.generique');
}
