/**
 * Types de l'API REST /api/v1 (contrat d'architecture §4).
 * Ils reflètent exactement les records Java du backend (bf.gov.laafi.*) ;
 * les dates (Instant) arrivent en chaînes ISO-8601.
 * Le backend omet les champs null (Jackson non_null) : ils sont donc optionnels ici.
 */

export type Role = 'agent' | 'chef_service' | 'admin_ministere' | 'super_admin';

export type StatutAgent = 'ACTIF' | 'REVOQUE' | 'APPAREILS_REVOQUES';

export type Classification = 'NORMAL' | 'DIFFUSION_RESTREINTE' | 'CONFIDENTIEL';

export type Transfert = 'AUTORISE' | 'INTERNE_MINISTERE' | 'INTERDIT';

export type ActionAudit =
  | 'ENROLEMENT'
  | 'REVOCATION_TOTALE'
  | 'REVOCATION_APPAREILS'
  | 'REACTIVATION'
  | 'URGENCE'
  | 'POLITIQUE_MODIFIEE'
  | 'CANAL_ENREGISTRE';

/** Corps JSON de toutes les erreurs de l'API. */
export interface ErreurApi {
  code: string;
  message: string;
}

/** Page de résultats (endpoints paginés : /audit, /annuaire). */
export interface Page<T> {
  elements: T[];
  page: number;
  taille: number;
  total?: number;
  pageSuivante: boolean;
}

/** GET /me */
export interface Profil {
  username: string;
  matrixId: string;
  nom: string;
  prenom?: string;
  nomFamille?: string;
  ministere?: string;
  direction?: string;
  fonction?: string;
  matricule?: string;
  roles: Role[];
}

/** GET /ministeres */
export interface Ministere {
  code: string;
  sigle: string;
  nom: string;
}

/** Élément de GET /agents */
export interface AgentResume {
  username: string;
  matrixId: string;
  prenom?: string;
  nom?: string;
  nomComplet?: string;
  email?: string;
  ministere?: string;
  direction?: string;
  fonction?: string;
  matricule?: string;
  statut: StatutAgent;
  enrole: boolean;
  creeLe?: string;
}

/** Appareil (session) Synapse d'un agent. */
export interface Appareil {
  deviceId: string;
  nom?: string;
  derniereActivite?: string;
}

/** GET /agents/{username} */
export interface AgentDetail {
  agent: AgentResume;
  roles: Role[];
  appareils: Appareil[];
}

export interface FiltreAgents {
  q?: string;
  ministere?: string;
  statut?: StatutAgent | '';
}

/** POST /agents */
export interface EnrolementRequete {
  username?: string;
  prenom: string;
  nom: string;
  email?: string;
  ministere?: string;
  direction?: string;
  fonction: string;
  matricule: string;
  roles: Role[];
}

export interface EnrolementReponse {
  username: string;
  matrixId: string;
  motDePasseTemporaire: string;
}

/** Réponse des actions de révocation / réactivation. */
export interface ResultatOperation {
  username: string;
  matrixId: string;
  statut: StatutAgent;
  appareilsSupprimes?: number;
  message?: string;
}

/** GET /politiques */
export interface PolitiqueClassification {
  niveau: Classification;
  libelle: string;
  transfert: Transfert;
  copie: boolean;
  expirationJours?: number | null;
  filigrane: boolean;
  filigraneNominatif: boolean;
  flouHorsFocus: boolean;
  modifiePar?: string;
  modifieLe?: string;
}

/** PUT /politiques/{niveau} */
export interface PolitiqueRequete {
  libelle?: string;
  transfert: Transfert;
  copie: boolean;
  expirationJours: number | null;
  filigrane: boolean;
  filigraneNominatif: boolean;
  flouHorsFocus: boolean;
}

/** GET /canaux */
export interface CanalInstitutionnel {
  id: number;
  roomId: string;
  nom: string;
  ministere: string;
  description?: string;
  classification: Classification;
  creePar: string;
  creeLe: string;
}

/** POST /canaux */
export interface CanalRequete {
  roomId: string;
  nom: string;
  ministere?: string;
  description?: string;
  classification: Classification;
}

/** Entrée du journal probant (GET /accuses?eventId=). */
export interface EntreeAccuse {
  id: number;
  roomId: string;
  eventId: string;
  agent: string;
  empreinte: string;
  horodatage: string;
}

/** GET /accuses/{id}/preuve : preuve autoportante (SHA-256 + Ed25519). */
export interface Preuve {
  entree: EntreeAccuse;
  serialisationCanonique: string;
  hashPrecedent: string;
  hashEntree: string;
  signature: string;
  algorithme: string;
  clePublique: string;
  verifieeParLeServeur: boolean;
  methode: string;
}

/** GET /journal/verification */
export interface RapportVerification {
  integre: boolean;
  nombreEntrees: number;
  premiereEntreeInvalide?: number;
  raison?: string;
  dernierHash?: string;
  verifieLe: string;
}

/** Élément de GET /audit — jamais de contenu de message, par conception. */
export interface EvenementAudit {
  id: number;
  horodatage: string;
  acteur: string;
  action: ActionAudit | string;
  cible?: string;
  ministere?: string;
  motif?: string;
}
