import { Component, OnInit, inject, signal } from '@angular/core';
import { AdminService, texteErreur } from '../../core/services/admin.service';
import { AuthService, RoleUtilisateur, UtilisateurVue } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  templateUrl: './admin-users.component.html'
})
export class AdminUsersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  readonly auth = inject(AuthService);

  readonly utilisateurs = signal<UtilisateurVue[]>([]);
  readonly chargement = signal(true);
  readonly erreur = signal('');
  readonly message = signal('');

  ngOnInit(): void {
    this.recharger();
  }

  recharger(): void {
    this.chargement.set(true);
    this.erreur.set('');
    this.admin.utilisateurs().subscribe({
      next: (l) => { this.utilisateurs.set(l); this.chargement.set(false); },
      error: (e) => { this.erreur.set(texteErreur(e)); this.chargement.set(false); }
    });
  }

  estMoi(u: UtilisateurVue): boolean {
    return u.id === this.auth.utilisateur()?.id;
  }

  changerRole(u: UtilisateurVue): void {
    const nouveau: RoleUtilisateur = u.role === 'ADMIN' ? 'JOUEUR' : 'ADMIN';
    this.admin.changerRole(u.id, nouveau).subscribe({
      next: (maj) => this.appliquer(maj, `${maj.nom} est maintenant ${maj.role === 'ADMIN' ? 'administrateur' : 'joueur'}.`),
      error: (e) => this.erreur.set(texteErreur(e))
    });
  }

  basculerActif(u: UtilisateurVue): void {
    this.admin.changerActif(u.id, !u.actif).subscribe({
      next: (maj) => this.appliquer(maj, maj.actif ? `Le compte de ${maj.nom} est débloqué.` : `Le compte de ${maj.nom} est bloqué.`),
      error: (e) => this.erreur.set(texteErreur(e))
    });
  }

  date(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
  }

  private appliquer(maj: UtilisateurVue, texte: string): void {
    this.erreur.set('');
    this.utilisateurs.update(l => l.map(x => x.id === maj.id ? maj : x));
    this.message.set(texte);
    setTimeout(() => { if (this.message() === texte) this.message.set(''); }, 4000);
  }
}
