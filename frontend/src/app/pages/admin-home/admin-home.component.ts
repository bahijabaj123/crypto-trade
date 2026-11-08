import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService, StatsAdmin, texteErreur } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

interface Raccourci {
  titre: string;
  texte: string;
  chemin: string;
}

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-home.component.html'
})
export class AdminHomeComponent implements OnInit {
  private readonly admin = inject(AdminService);
  readonly auth = inject(AuthService);

  readonly stats = signal<StatsAdmin | null>(null);
  readonly chargement = signal(true);
  readonly erreur = signal('');

  readonly raccourcis: Raccourci[] = [
    { titre: 'Utilisateurs', texte: 'Comptes, rôles et blocage', chemin: '/admin/users' },
    { titre: 'Scénarios du jeu', texte: 'Ajouter, modifier, masquer', chemin: '/admin/game-scenarios' },
    { titre: 'Journal d’audit', texte: 'Qui a fait quoi, et quand', chemin: '/admin/journal' },
    { titre: 'Modèles IA', texte: 'Modèles et données (à venir)', chemin: '/admin/ai-models' },
    { titre: 'Scénarios de stress', texte: 'Chocs de marché (à venir)', chemin: '/admin/stress-scenarios' }
  ];

  ngOnInit(): void {
    this.recharger();
  }

  recharger(): void {
    this.chargement.set(true);
    this.erreur.set('');
    this.admin.stats().subscribe({
      next: (s) => { this.stats.set(s); this.chargement.set(false); },
      error: (e) => { this.erreur.set(texteErreur(e)); this.chargement.set(false); }
    });
  }

  /** 12345.6 -> « 12 345,6 » */
  nombre(n: number, decimales = 0): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(n);
  }

  deconnecter(): void {
    this.auth.deconnecter();
  }
}
