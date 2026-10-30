/**
 * Classification des messages (contrat §5 et §6).
 *
 * Les champs `bf.laafi.*` sont placés DANS le contenu de l'événement `m.room.message`,
 * qui est ensuite chiffré par Megolm : le serveur ne voit jamais le niveau de
 * classification d'un message, seulement un `m.room.encrypted` opaque.
 *
 * Ce fichier ne contient que des fonctions pures (sans Angular) : elles sont testées
 * unitairement (classification.spec.ts) et décident, côté client, de ce qui est
 * autorisé pour chaque message (copie, transfert, filigrane, flou, expiration).
 */

export type Niveau = 'NORMAL' | 'DIFFUSION_RESTREINTE' | 'CONFIDENTIEL';
export type Transfert = 'AUTORISE' | 'INTERNE_MINISTERE' | 'INTERDIT';

export const NIVEAUX: readonly Niveau[] = ['NORMAL', 'DIFFUSION_RESTREINTE', 'CONFIDENTIEL'];

/** Clés des champs personnalisés dans le contenu chiffré. */
export const CHAMP_CLASSIFICATION = 'bf.laafi.classification';
export const CHAMP_EXPIRATION = 'bf.laafi.expire_at';
export const CHAMP_INSTRUCTION = 'bf.laafi.instruction';

/** Politique telle que renvoyée par GET /api/v1/politiques (entité PolitiqueClassification). */
export interface Politique {
  niveau: Niveau;
  libelle?: string;
  transfert: Transfert;
  copie: boolean;
  expirationJours: number | null;
  filigrane: boolean;
  filigraneNominatif: boolean;
  flouHorsFocus: boolean;
}

/** Défauts du contrat §6, utilisés si le backend est injoignable (mode dégradé). */
export const POLITIQUES_PAR_DEFAUT: Record<Niveau, Politique> = {
  NORMAL: {
    niveau: 'NORMAL',
    transfert: 'AUTORISE',
    copie: true,
    expirationJours: null,
    filigrane: false,
    filigraneNominatif: false,
    flouHorsFocus: false,
  },
  DIFFUSION_RESTREINTE: {
    niveau: 'DIFFUSION_RESTREINTE',
    transfert: 'INTERNE_MINISTERE',
    copie: true,
    expirationJours: 30,
    filigrane: true,
    filigraneNominatif: false,
    flouHorsFocus: false,
  },
  CONFIDENTIEL: {
    niveau: 'CONFIDENTIEL',
    transfert: 'INTERDIT',
    copie: false,
    expirationJours: 7,
    filigrane: true,
    filigraneNominatif: true,
    flouHorsFocus: true,
  },
};

const JOUR_MS = 24 * 60 * 60 * 1000;

export function estNiveau(valeur: unknown): valeur is Niveau {
  return typeof valeur === 'string' && (NIVEAUX as readonly string[]).includes(valeur);
}

/**
 * Lit le niveau dans un contenu déchiffré. Une valeur absente ou inconnue est traitée
 * comme NORMAL (un ancien client ou un autre client Matrix n'envoie pas ce champ).
 */
export function niveauDuContenu(contenu: Record<string, unknown> | null | undefined): Niveau {
  const v = contenu?.[CHAMP_CLASSIFICATION];
  return estNiveau(v) ? v : 'NORMAL';
}

export function expirationDuContenu(contenu: Record<string, unknown> | null | undefined): number | null {
  const v = contenu?.[CHAMP_EXPIRATION];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function estInstruction(contenu: Record<string, unknown> | null | undefined): boolean {
  return contenu?.[CHAMP_INSTRUCTION] === true;
}

/** Ordre de sensibilité : sert à afficher le niveau le plus élevé d'une conversation. */
export function rang(niveau: Niveau): number {
  return NIVEAUX.indexOf(niveau);
}

export function niveauMax(niveaux: Iterable<Niveau>): Niveau {
  let max: Niveau = 'NORMAL';
  for (const n of niveaux) if (rang(n) > rang(max)) max = n;
  return max;
}

/**
 * Fusionne la réponse du backend avec les défauts : un niveau manquant ou mal formé
 * garde sa valeur par défaut (on ne relâche jamais une règle par erreur de réseau).
 */
export function fusionnerPolitiques(recues: unknown): Record<Niveau, Politique> {
  const resultat: Record<Niveau, Politique> = { ...POLITIQUES_PAR_DEFAUT };
  if (!Array.isArray(recues)) return resultat;
  for (const p of recues as Partial<Politique>[]) {
    if (!p || !estNiveau(p.niveau)) continue;
    const defaut = POLITIQUES_PAR_DEFAUT[p.niveau];
    resultat[p.niveau] = {
      niveau: p.niveau,
      libelle: typeof p.libelle === 'string' ? p.libelle : defaut.libelle,
      transfert:
        p.transfert === 'AUTORISE' || p.transfert === 'INTERNE_MINISTERE' || p.transfert === 'INTERDIT'
          ? p.transfert
          : defaut.transfert,
      copie: typeof p.copie === 'boolean' ? p.copie : defaut.copie,
      expirationJours:
        p.expirationJours === null || (typeof p.expirationJours === 'number' && p.expirationJours > 0)
          ? p.expirationJours
          : defaut.expirationJours,
      filigrane: typeof p.filigrane === 'boolean' ? p.filigrane : defaut.filigrane,
      filigraneNominatif:
        typeof p.filigraneNominatif === 'boolean' ? p.filigraneNominatif : defaut.filigraneNominatif,
      flouHorsFocus: typeof p.flouHorsFocus === 'boolean' ? p.flouHorsFocus : defaut.flouHorsFocus,
    };
  }
  return resultat;
}

/** Date d'expiration par défaut d'un nouveau message (null = jamais). */
export function expirationParDefaut(politique: Politique, maintenant: number): number | null {
  return politique.expirationJours ? maintenant + politique.expirationJours * JOUR_MS : null;
}

/**
 * Durées proposées à l'émetteur : il peut raccourcir la durée de vie d'un message,
 * jamais l'allonger au-delà de la politique de son niveau.
 */
export function dureesProposees(politique: Politique): number[] {
  const toutes = [JOUR_MS / 24, JOUR_MS, 7 * JOUR_MS, 30 * JOUR_MS];
  if (!politique.expirationJours) return [0, ...toutes];
  const max = politique.expirationJours * JOUR_MS;
  return toutes.filter((d) => d <= max);
}

export function estExpire(expireAt: number | null, maintenant: number): boolean {
  return expireAt !== null && expireAt <= maintenant;
}

/** Contenu `bf.laafi.*` à fusionner dans le contenu d'un message avant envoi. */
export function champsLaafi(niveau: Niveau, expireAt: number | null, instruction: boolean): Record<string, unknown> {
  const champs: Record<string, unknown> = { [CHAMP_CLASSIFICATION]: niveau };
  if (expireAt) champs[CHAMP_EXPIRATION] = expireAt;
  if (instruction) champs[CHAMP_INSTRUCTION] = true;
  return champs;
}

/** Règles effectives pour l'affichage d'un message donné. */
export interface Regles {
  copieAutorisee: boolean;
  transfert: Transfert;
  filigrane: boolean;
  filigraneNominatif: boolean;
  flouHorsFocus: boolean;
}

export function reglesPour(niveau: Niveau, politiques: Record<Niveau, Politique>): Regles {
  const p = politiques[niveau] ?? POLITIQUES_PAR_DEFAUT[niveau];
  return {
    copieAutorisee: p.copie,
    transfert: p.transfert,
    filigrane: p.filigrane,
    filigraneNominatif: p.filigraneNominatif,
    flouHorsFocus: p.flouHorsFocus,
  };
}

/**
 * Un message peut-il être transféré vers un salon donné ?
 *  - AUTORISE          : partout ;
 *  - INTERNE_MINISTERE : seulement si TOUS les membres du salon cible appartiennent au
 *                        ministère de l'émetteur (vérifié via l'annuaire officiel) ;
 *  - INTERDIT          : jamais.
 */
export function transfertAutorise(
  transfert: Transfert,
  monMinistere: string | null,
  ministeresDesMembres: (string | null)[],
): boolean {
  if (transfert === 'AUTORISE') return true;
  if (transfert === 'INTERDIT') return false;
  if (!monMinistere) return false;
  return ministeresDesMembres.length > 0 && ministeresDesMembres.every((m) => m === monMinistere);
}

/** Texte du filigrane : nominatif (nom · matricule · date) ou simple niveau + date. */
export function texteFiligrane(
  nominatif: boolean,
  agent: { nom: string; matricule?: string | null },
  libelleNiveau: string,
  date: Date,
): string {
  const jour = date.toISOString().slice(0, 10);
  if (!nominatif) return `${libelleNiveau} · ${jour}`;
  return [agent.nom, agent.matricule || null, jour].filter(Boolean).join(' · ');
}
