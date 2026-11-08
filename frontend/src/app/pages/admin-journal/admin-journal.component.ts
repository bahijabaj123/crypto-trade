import { Component, OnInit, inject, signal } from '@angular/core';
import { AdminService, LigneJournal, texteErreur } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-journal',
  standalone: true,
  templateUrl: './admin-journal.component.html'
})
export class AdminJournalComponent implements OnInit {
  private readonly admin = inject(AdminService);

  readonly limites = [50, 100, 200, 500];
  readonly limite = signal(100);
  readonly lignes = signal<LigneJournal[]>([]);
  readonly chargement = signal(true);
  readonly erreur = signal('');

  ngOnInit(): void {
    this.recharger();
  }

  choisirLimite(valeur: string): void {
    this.limite.set(Number(valeur));
    this.recharger();
  }

  recharger(): void {
    this.chargement.set(true);
    this.erreur.set('');
    this.admin.journal(this.limite()).subscribe({
      next: (l) => { this.lignes.set(l); this.chargement.set(false); },
      error: (e) => { this.erreur.set(texteErreur(e)); this.chargement.set(false); }
    });
  }

  date(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
  }

  /** Rouge pour les échecs, vert pour les connexions, jaune pour le reste. */
  classe(action: string): string {
    if (action.includes('ECHEC') || action.includes('REFUSEE') || action.includes('BLOQUE') || action.includes('SUPPRIME')) {
      return 'bg-crypto-red/15 text-crypto-red';
    }
    if (action.includes('CONNEXION') || action.includes('INSCRIPTION') || action.includes('DEBLOQUE') || action.includes('CREE')) {
      return 'bg-crypto-green/15 text-crypto-green';
    }
    return 'bg-crypto-yellow/15 text-crypto-yellow';
  }
}
