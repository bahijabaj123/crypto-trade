import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

/**
 * Toutes les pages d'administration. Chacune est protégée par adminGuard :
 * il faut être connecté avec un compte au rôle ADMIN.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-home/admin-home.component').then(m => m.AdminHomeComponent),
    title: 'Tableau de bord Admin | Crypto Simulator',
  },
  { path: 'admin/stats', redirectTo: 'admin', pathMatch: 'full' },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-users/admin-users.component').then(m => m.AdminUsersComponent),
    title: 'Gestion Utilisateurs | Crypto Simulator',
  },
  {
    path: 'admin/game-scenarios',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-game-scenarios/admin-game-scenarios.component').then(m => m.AdminGameScenariosComponent),
    title: 'Scénarios du jeu | Crypto Simulator',
  },
  {
    path: 'admin/journal',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-journal/admin-journal.component').then(m => m.AdminJournalComponent),
    title: 'Journal d’audit | Crypto Simulator',
  },
  {
    path: 'admin/ai-models',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-ai-models/admin-ai-models.component').then(m => m.AdminAiModelsComponent),
    title: 'Modèles IA | Crypto Simulator',
  },
  {
    path: 'admin/stress-scenarios',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-stress-scenarios/admin-stress-scenarios.component').then(m => m.AdminStressScenariosComponent),
    title: 'Scénarios Stress | Crypto Simulator',
  },
];
