import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { Role } from '../api/models';
import { AuthService, ROLES_ADMIN, Utilisateur } from './auth.service';
import { roleGuard } from './role.guard';

/** Faux AuthService : mêmes signaux publics, alimentés par un utilisateur de test fictif. */
function fauxAuth(roles: Role[] | null) {
  const u = signal<Utilisateur | null>(
    roles ? { username: 'awa.sawadogo', nom: 'Awa Sawadogo', ministere: 'MTDPCE', fonction: 'Chargée SI', roles } : null,
  );
  const r = computed(() => u()?.roles ?? []);
  const aUnRole = (attendus: readonly Role[]) => r().some((x) => attendus.includes(x));
  return {
    utilisateur: u.asReadonly(),
    roles: r,
    estSuperAdmin: computed(() => r().includes('super_admin')),
    estAdmin: computed(() => aUnRole(ROLES_ADMIN)),
    aUnRole,
  };
}

function executer(roles: Role[] | null, data: Record<string, unknown> = {}): boolean | UrlTree {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: fauxAuth(roles) }],
  });
  const route = { data } as unknown as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() => roleGuard(route, {} as RouterStateSnapshot)) as boolean | UrlTree;
}

function url(res: boolean | UrlTree): string {
  expect(res).toBeInstanceOf(UrlTree);
  return TestBed.inject(Router).serializeUrl(res as UrlTree);
}

describe('roleGuard', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('laisse passer un admin_ministere', () => {
    expect(executer(['agent', 'admin_ministere'])).toBe(true);
  });

  it('laisse passer un super_admin', () => {
    expect(executer(['super_admin'])).toBe(true);
  });

  it('refuse un simple agent et le redirige vers /acces-refuse (raison console)', () => {
    expect(url(executer(['agent', 'chef_service']))).toBe('/acces-refuse?raison=console');
  });

  it('refuse un utilisateur sans jeton exploitable', () => {
    expect(url(executer(null))).toBe('/acces-refuse?raison=console');
  });

  it('respecte data.roles : route réservée au super_admin', () => {
    expect(url(executer(['admin_ministere'], { roles: ['super_admin'] }))).toBe('/acces-refuse?raison=role');
    TestBed.resetTestingModule();
    expect(executer(['super_admin'], { roles: ['super_admin'] })).toBe(true);
  });
});
