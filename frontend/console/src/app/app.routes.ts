import { Routes } from '@angular/router';

import { roleGuard } from './core/auth/role.guard';
import { Shell } from './layout/shell';

/**
 * Toutes les routes métier sont sous le Shell, protégé par roleGuard
 * (admin_ministere ou super_admin). Les écrans sont chargés à la demande.
 */
export const routes: Routes = [
  {
    path: 'acces-refuse',
    title: 'accesRefuse.titre',
    loadComponent: () => import('./pages/acces-refuse/acces-refuse').then((m) => m.AccesRefuse),
  },
  {
    path: '',
    component: Shell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      {
        path: 'tableau-de-bord',
        title: 'nav.tableau',
        loadComponent: () => import('./pages/tableau-de-bord/tableau-de-bord').then((m) => m.TableauDeBord),
      },
      {
        path: 'agents',
        title: 'nav.agents',
        loadComponent: () => import('./pages/agents/liste-agents').then((m) => m.ListeAgents),
      },
      {
        path: 'agents/enroler',
        title: 'nav.enroler',
        loadComponent: () => import('./pages/agents/enroler-agent').then((m) => m.EnrolerAgent),
      },
      {
        path: 'agents/:username',
        title: 'agent.titreOnglet',
        loadComponent: () => import('./pages/agents/fiche-agent').then((m) => m.FicheAgent),
      },
      {
        path: 'canaux',
        title: 'nav.canaux',
        loadComponent: () => import('./pages/canaux/canaux').then((m) => m.Canaux),
      },
      {
        path: 'politiques',
        title: 'nav.politiques',
        loadComponent: () => import('./pages/politiques/politiques').then((m) => m.Politiques),
      },
      {
        path: 'journal',
        title: 'nav.journal',
        loadComponent: () => import('./pages/journal/journal').then((m) => m.Journal),
      },
      {
        path: 'audit',
        title: 'nav.audit',
        loadComponent: () => import('./pages/audit/audit').then((m) => m.Audit),
      },
      { path: '**', redirectTo: 'tableau-de-bord' },
    ],
  },
];
