import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { Profil } from '../api/modeles';

/** Profil de l'agent connecté (GET /api/v1/me) : nom, ministère, matricule, rôles. */
@Injectable({ providedIn: 'root' })
export class ProfilService {
  private readonly api = inject(ApiService);
  readonly profil = signal<Profil | null>(null);
  readonly erreur = signal(false);

  async charger(): Promise<void> {
    try {
      this.profil.set(await this.api.moi());
      this.erreur.set(false);
    } catch {
      this.erreur.set(true);
    }
  }

  /** Création de canaux institutionnels réservée aux chefs de service et au-delà (contrat §4). */
  peutCreerCanal(): boolean {
    const roles = this.profil()?.roles ?? [];
    return roles.some((r) => ['chef_service', 'admin_ministere', 'super_admin'].includes(r));
  }

  vider(): void {
    this.profil.set(null);
  }
}
