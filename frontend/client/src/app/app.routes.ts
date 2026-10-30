import { Routes } from '@angular/router';
import { accueilGuard, connecteGuard } from './core/auth/gardes';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [accueilGuard],
    loadComponent: () => import('./features/accueil/accueil.component').then((m) => m.AccueilComponent),
  },
  {
    path: 'acces-revoque',
    loadComponent: () => import('./features/revoque/acces-revoque.component').then((m) => m.AccesRevoqueComponent),
  },
  {
    path: '',
    canActivate: [connecteGuard],
    loadComponent: () => import('./features/coquille/coquille.component').then((m) => m.CoquilleComponent),
    children: [
      {
        path: 'salons',
        loadComponent: () => import('./features/salons/accueil-salons.component').then((m) => m.AccueilSalonsComponent),
      },
      {
        path: 'salons/:roomId',
        loadComponent: () => import('./features/conversation/conversation.component').then((m) => m.ConversationComponent),
      },
      {
        path: 'salons/:roomId/details',
        loadComponent: () => import('./features/details/details-salon.component').then((m) => m.DetailsSalonComponent),
      },
      {
        path: 'nouveau',
        loadComponent: () => import('./features/nouveau/nouvelle-conversation.component').then((m) => m.NouvelleConversationComponent),
      },
      {
        path: 'annuaire',
        loadComponent: () => import('./features/annuaire/annuaire.component').then((m) => m.AnnuaireComponent),
      },
      {
        path: 'profil',
        loadComponent: () => import('./features/profil/profil.component').then((m) => m.ProfilComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
