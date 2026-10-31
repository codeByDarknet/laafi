import { Injectable, signal } from '@angular/core';

export type TypeToast = 'succes' | 'attention' | 'erreur' | 'info';

export interface Toast {
  id: number;
  type: TypeToast;
  /** Clé i18n du message. */
  cle: string;
  params?: Record<string, unknown>;
  action?: { cle: string; faire: () => void };
}

/** Notifications éphémères (région aria-live dans l'application). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private suivant = 1;

  afficher(type: TypeToast, cle: string, params?: Record<string, unknown>, action?: Toast['action'], dureeMs = 6000): void {
    const id = this.suivant++;
    this.toasts.update((t) => [...t.slice(-3), { id, type, cle, params, action }]);
    if (dureeMs > 0) setTimeout(() => this.fermer(id), dureeMs);
  }

  succes(cle: string, params?: Record<string, unknown>): void {
    this.afficher('succes', cle, params);
  }

  erreur(cle: string, params?: Record<string, unknown>, action?: Toast['action']): void {
    this.afficher('erreur', cle, params, action, 9000);
  }

  fermer(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  vider(): void {
    this.toasts.set([]);
  }
}
