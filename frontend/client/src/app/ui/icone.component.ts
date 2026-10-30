import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Icônes dessinées pour Laafi (trait 1,75 px sur grille 24, coins arrondis).
 * Aucune bibliothèque ni police d'icônes externe. Décoratives par défaut (aria-hidden) :
 * le bouton qui les contient porte toujours un libellé accessible.
 */
const TRACES: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  recherche: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.6-4.6',
  envoyer: 'M4.5 12 3 4.5l18 7.5-18 7.5L4.5 12Zm0 0H11',
  trombone:
    'm20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h.01',
  micro: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  stop: 'M7 7h10v10H7z',
  lecture: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  pause: 'M8 5v14M16 5v14',
  retour: 'M15 5l-7 7 7 7',
  fermer: 'M6 6l12 12M18 6 6 18',
  cadenas: 'M6 10.5h12V20H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  bouclier: 'M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6l-7-3Zm-3 9 2.2 2.2L15.5 10',
  bouclierAlerte: 'M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6l-7-3Zm0 5.5v4M12 15.5h.01',
  alerte: 'M12 4 2.8 19.5h18.4L12 4Zm0 6v4.5M12 17h.01',
  personne: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  groupe:
    'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 19.5a6.5 6.5 0 0 1 13 0M16 4.7a3.5 3.5 0 0 1 0 6.6M18 13.6a6.5 6.5 0 0 1 3.5 5.9',
  canal: 'M4 10v4h3l6 4V6L7 10H4ZM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  annuaire: 'M6 3.5h12v17H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5ZM12 12a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM8.5 16a3.5 3.5 0 0 1 7 0',
  reglages:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  sortir: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9',
  transferer: 'M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1',
  poubelle: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
  horloge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  fichier: 'M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Zm0 0V8h4.5',
  telecharger: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  coche: 'M5 12.5l4.5 4.5L19 7.5',
  horsLigne: 'M3 3l18 18M8.5 8.6A5 5 0 0 0 7 18h10.5M20.6 16.3A4 4 0 0 0 17 10h-.4a6 6 0 0 0-5.4-4 6 6 0 0 0-1.6.2',
  recharger: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5.5M12 7.5h.01',
  instruction: 'M8 4.5h8l.5 2H19v14H5v-14h2.5L8 4.5ZM8.5 12.5l2.3 2.3 4.7-4.7',
  preuve: 'M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M10 13l1.8 1.8L15.5 11M10 17.5h5',
  oeil: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cle: 'M14.5 9.5a5 5 0 1 0-4.6 5l1.6-.1v2.1h2.2v2.2h2.1v2h3.7v-3.6l-5.1-5.1a5 5 0 0 0 .1-2.5ZM8.5 9h.01',
  appareil: 'M7.5 3h9A1.5 1.5 0 0 1 18 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3ZM11 18h2',
  langue: 'M4 5h9M8.5 3v2M6 5c.5 4 3 7 6 8.5M11 5c-.7 3.8-3 7-6.5 9M13 21l4-9 4 9M14.3 18h5.4',
  theme: 'M12 21a9 9 0 0 0 0-18v18ZM12 21a9 9 0 0 1 0-18',
  message: 'M4.5 5h15A1.5 1.5 0 0 1 21 6.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-5 3.5V18h-.5A1.5 1.5 0 0 1 3 16.5v-10A1.5 1.5 0 0 1 4.5 5Z',
};

export type NomIcone = keyof typeof TRACES;

@Component({
  selector: 'lf-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    viewBox="0 0 24 24"
    [attr.width]="taille()"
    [attr.height]="taille()"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="trace()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
})
export class IconeComponent {
  readonly nom = input.required<string>();
  readonly taille = input<number | string>(20);
  protected readonly trace = computed(() => TRACES[this.nom()] ?? TRACES['info']);
}
