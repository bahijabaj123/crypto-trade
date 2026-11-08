import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { texteErreur } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-signup-form',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './signup-form.component.html'
})
export class SignupFormComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  nom = '';
  email = '';
  password = '';

  readonly showPassword = signal(false);
  readonly erreur = signal('');
  readonly enCours = signal(false);

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSignUp(): void {
    if (this.enCours()) return;
    if (this.password.length < 8) {
      this.erreur.set('Le mot de passe doit avoir au moins 8 caractères.');
      return;
    }
    this.erreur.set('');
    this.enCours.set(true);
    this.auth.inscrire(this.nom, this.email, this.password).subscribe({
      next: () => { this.enCours.set(false); this.router.navigateByUrl('/dashboard'); },
      error: (e) => { this.enCours.set(false); this.erreur.set(texteErreur(e, 'Inscription impossible.')); }
    });
  }
}
