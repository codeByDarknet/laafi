/**
 * Formes des réponses du backend Laafi (/api/v1), relevées dans le code Java du backend
 * (contrat §4). Toutes les données de démonstration sont fictives.
 */

export interface Profil {
  username: string;
  matrixId: string;
  nom: string;
  prenom?: string;
  nomFamille?: string;
  ministere: string | null;
  direction?: string | null;
  fonction?: string | null;
  matricule?: string | null;
  roles: string[];
}

export interface EntreeAnnuaire {
  matrixId: string;
  username: string;
  nom: string;
  ministere: string | null;
  direction?: string | null;
  fonction?: string | null;
}

export interface Page<T> {
  elements: T[];
  page: number;
  taille: number;
  total: number;
  pageSuivante: boolean;
}

export interface Ministere {
  code: string;
  sigle: string;
  nom: string;
}

export interface Canal {
  roomId: string;
  nom: string;
  ministere: string | null;
  description?: string | null;
  classification?: string | null;
}

/** Entrée du journal probant des accusés de lecture (chaîne de hachage signée). */
export interface EntreeAccuse {
  id: number | string;
  roomId: string;
  eventId: string;
  agent: string;
  empreinte: string;
  horodatage: string;
}

/** Preuve vérifiable d'un accusé : entrée + chaînage + signature du serveur. */
export interface Preuve {
  entree: EntreeAccuse;
  serialisationCanonique?: string;
  hashPrecedent?: string;
  hashEntree?: string;
  signature?: string;
  algorithme?: string;
  clePublique?: string;
  verifieeParLeServeur?: boolean;
  methode?: string;
}

export interface ResultatOperation {
  succes?: boolean;
  message?: string;
  [cle: string]: unknown;
}

/** Erreur normalisée du backend : { code, message }. */
export interface ErreurApi {
  code: string;
  message: string;
}
