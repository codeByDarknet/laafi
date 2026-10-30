import { Injectable, signal } from '@angular/core';

export type GenreToast = 'succes' | 'avertissement' | 'erreur' | 'neutre';

export interface Toast {
  id: number;
  genre: GenreToast;
  titre: string;
  texte?: string;
}

/** Notifications éphémères (région aria-live dans le shell de l'application). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private compteur = 0;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  afficher(genre: GenreToast, titre: string, texte?: string, dureeMs = 6000): void {
    const id = ++this.compteur;
    this._toasts.update((l) => [...l.slice(-3), { id, genre, titre, texte }]);
    if (dureeMs > 0) setTimeout(() => this.fermer(id), dureeMs);
  }

  succes(titre: string, texte?: string): void {
    this.afficher('succes', titre, texte);
  }

  erreur(titre: string, texte?: string): void {
    // Les erreurs restent plus longtemps : l'administrateur doit pouvoir les lire.
    this.afficher('erreur', titre, texte, 10000);
  }

  fermer(id: number): void {
    this._toasts.update((l) => l.filter((t) => t.id !== id));
  }
}
