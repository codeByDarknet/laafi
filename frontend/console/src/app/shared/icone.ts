import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Jeu d'icônes dessiné pour Laafi (trait 1,75 px, grille 24, coins arrondis).
 * SVG en ligne : aucune bibliothèque ni police d'icônes externe.
 */
const TRACES: Record<string, string> = {
  tableau: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
  agents:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.2 2.6 3.5 5.2',
  enroler:
    'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9M18.5 14v6M15.5 17h6',
  canaux: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  politiques:
    'M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6zM9 12l2 2 4-4.5',
  journal:
    'M6 3.5h9l3.5 3.5v13.5H6zM14.5 3.5V7h4M9 11.5h6M9 15h6M9 18h3.5',
  audit: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4',
  deconnexion: 'M14.5 4H19v16h-4.5M10 8l-4 4 4 4M6 12h10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  telephone: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
  'telephone-barre': 'M8.5 3H16a1.5 1.5 0 0 1 1.5 1.5V14M17.5 18.5v1A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5V6.5M3 3l18 18',
  revoquer: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM6 6l12 12',
  reactiver: 'M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1M17.5 3.5v3.6h-3.6M6.5 20.5v-3.6h3.6',
  copier: 'M9 9h10.5v11.5H9zM15 9V3.5H4.5V15H9',
  verifier: 'M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6zM9 12l2 2 4-4.5',
  chaine:
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  'chaine-rompue': 'M10 14a4 4 0 0 0 5.7 0M14 10a4 4 0 0 0-5.7 0M8 3v3M3 8h3M16 21v-3M21 16h-3M7 13l-2 2a4 4 0 0 0 5.7 5.7l1-1M17 11l2-2a4 4 0 0 0-5.7-5.7l-1 1',
  alerte: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.3v.2',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.8v.2',
  retour: 'M19 12H5M11 6l-6 6 6 6',
  suivant: 'M9 6l6 6-6 6',
  precedent: 'M15 6l-6 6 6 6',
  cle: 'M14.5 14a5 5 0 1 0-4.6-3L3.5 17.5V20.5h3v-2h2v-2h2l1.4-1.4A5 5 0 0 0 14.5 14zM16 8.2v.1',
  rafraichir: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15',
  plus: 'M12 5v14M5 12h14',
  crayon: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  fermer: 'M6 6l12 12M18 6 6 18',
  oeil: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  cadenas: 'M6 10.5h12V20H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3M12 14v2.5',
  coche: 'M5 12.5l4.5 4.5L19 7.5',
};

@Component({
  selector: 'lc-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'lc-icone', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round" focusable="false">
      <path [attr.d]="trace()" />
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; width: var(--lc-icone, 1.25rem); height: var(--lc-icone, 1.25rem); }
    svg { width: 100%; height: 100%; }
  `,
})
export class Icone {
  readonly nom = input.required<string>();
  protected readonly trace = computed(() => TRACES[this.nom()] ?? TRACES['info']);
}
