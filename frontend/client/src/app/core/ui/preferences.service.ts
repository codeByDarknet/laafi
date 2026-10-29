import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type Theme = 'systeme' | 'clair' | 'sombre';
export type Langue = 'fr' | 'mos' | 'dyu';

export const LANGUES: readonly Langue[] = ['fr', 'mos', 'dyu'];
const CLE_THEME = 'laafi.theme';
const CLE_LANGUE = 'laafi.langue';

/** Applique le thème sur <html data-theme> (lu par le design system partagé). */
export function appliquerTheme(theme: Theme): void {
  const racine = document.documentElement;
  if (theme === 'systeme') delete racine.dataset['theme'];
  else racine.dataset['theme'] = theme === 'sombre' ? 'dark' : 'light';
}

export function themeEnregistre(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME);
    return t === 'clair' || t === 'sombre' ? t : 'systeme';
  } catch {
    return 'systeme';
  }
}

export function langueEnregistree(): Langue {
  try {
    const l = localStorage.getItem(CLE_LANGUE);
    return (LANGUES as readonly string[]).includes(l ?? '') ? (l as Langue) : 'fr';
  } catch {
    return 'fr';
  }
}

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly transloco = inject(TranslocoService);
  readonly theme = signal<Theme>(themeEnregistre());
  readonly langue = signal<Langue>(langueEnregistree());

  initialiser(): void {
    appliquerTheme(this.theme());
    this.transloco.setActiveLang(this.langue());
    document.documentElement.lang = this.langue();
  }

  choisirTheme(theme: Theme): void {
    this.theme.set(theme);
    appliquerTheme(theme);
    ecrire(CLE_THEME, theme);
  }

  choisirLangue(langue: Langue): void {
    this.langue.set(langue);
    this.transloco.setActiveLang(langue);
    document.documentElement.lang = langue;
    ecrire(CLE_LANGUE, langue);
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    /* préférences non persistées : sans gravité */
  }
}
