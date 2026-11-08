import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { texteErreur } from '../../core/services/admin.service';

/** « Mon compte » : les informations du compte connecté. */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './profile.component.html'
})
export class ProfileComponent {
  readonly auth = inject(AuthService);

  // ----- Changer son mot de passe -----
  readonly formulaireOuvert = signal(false);
  readonly enCours = signal(false);
  readonly erreur = signal('');
  readonly succes = signal(false);

  ouvrirFormulaire(): void {
    this.erreur.set('');
    this.succes.set(false);
    this.formulaireOuvert.set(true);
  }

  fermerFormulaire(): void {
    this.formulaireOuvert.set(false);
    this.erreur.set('');
  }

  changerMotDePasse(ancien: string, nouveau: string, confirmation: string, form: HTMLFormElement): void {
    this.erreur.set('');
    if (!ancien || !nouveau) { this.erreur.set('Remplissez tous les champs.'); return; }
    if (nouveau.length < 8) { this.erreur.set('Le nouveau mot de passe doit avoir au moins 8 caractères.'); return; }
    if (nouveau !== confirmation) { this.erreur.set('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    if (nouveau === ancien) { this.erreur.set('Le nouveau mot de passe doit être différent de l’ancien.'); return; }

    this.enCours.set(true);
    this.auth.changerMotDePasse(ancien, nouveau).subscribe({
      next: () => {
        this.enCours.set(false);
        this.succes.set(true);
        this.formulaireOuvert.set(false);
        form.reset();
      },
      error: (e: unknown) => {
        this.enCours.set(false);
        this.erreur.set(texteErreur(e, 'Changement impossible.'));
      }
    });
  }

  date(iso: string | null | undefined): string {
    return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '—';
  }

  initiales(nom: string): string {
    const mots = nom.trim().split(/\s+/).filter(m => m.length > 0);
    return (mots.length > 1 ? mots[0][0] + mots[1][0] : nom.slice(0, 2)).toUpperCase();
  }
}
