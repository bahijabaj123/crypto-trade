import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { texteErreur } from '../../../../core/services/admin.service';
import { AuthShowcaseComponent } from '../auth-showcase.component';

@Component({
  selector: 'app-signin-form',
  standalone: true,
  imports: [RouterModule, FormsModule,AuthShowcaseComponent],
  templateUrl: './signin-form.component.html'
})
export class SigninFormComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  password = '';

  readonly showPassword = signal(false);
  readonly erreur = signal('');
  readonly enCours = signal(false);

  /** Message d'information : arrivée depuis une page admin sans être connecté / sans être admin. */
  readonly info = signal(this.messageInitial());

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSignIn(): void {
    if (this.enCours()) return;
    this.erreur.set('');
    this.enCours.set(true);
    this.auth.connecter(this.email, this.password).subscribe({
      next: () => {
        this.enCours.set(false);
        const retour = this.route.snapshot.queryParamMap.get('retour');
        // un admin va sur son tableau de bord, un joueur sur le dashboard
        const cible = retour && retour.startsWith('/') && !retour.startsWith('//')
          ? retour : (this.auth.estAdmin() ? '/admin' : '/dashboard');
        this.router.navigateByUrl(cible);
      },
      error: (e) => {
        this.enCours.set(false);
        this.erreur.set(texteErreur(e, 'Connexion impossible.'));
      }
    });
  }

  private messageInitial(): string {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('refuse')) return 'Cette page est réservée aux administrateurs. Connectez-vous avec un compte administrateur.';
    if (q.get('retour')) return 'Connectez-vous pour accéder à cette page.';
    return '';
  }
}
