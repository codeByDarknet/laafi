/**
 * Formats d'affichage (dates, tailles, durées). On utilise Intl avec la locale « fr-BF » :
 * le mooré et le dioula n'ont pas de données Intl complètes, le français du Burkina sert de base.
 */
const LOCALE = 'fr-BF';
const heureFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const jourFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const jourLongFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const completFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function heure(ts: number): string {
  return heureFmt.format(ts);
}

/** Heure si aujourd'hui, sinon date courte (liste des conversations). */
export function horodatageCourt(ts: number, maintenant = Date.now()): string {
  if (!ts) return '';
  const d = new Date(ts);
  const n = new Date(maintenant);
  if (d.toDateString() === n.toDateString()) return heureFmt.format(d);
  return jourFmt.format(d);
}

export function jourLong(ts: number): string {
  return jourLongFmt.format(ts);
}

export function dateComplete(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : completFmt.format(d);
}

export function cleJour(ts: number): string {
  return new Date(ts).toDateString();
}

export function taille(octets: number | null | undefined): string {
  if (octets == null) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function duree(ms: number | null | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Joint les éléments renseignés par « · » (ex. fonction · direction · ministère). */
export function joindre(...parties: (string | null | undefined)[]): string {
  return parties.filter((p) => !!p).join(' · ');
}
