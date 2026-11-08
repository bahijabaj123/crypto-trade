import { Component, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, AuthService } from '../../../core/services/auth.service';
import { texteErreur } from '../../../core/services/admin.service';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Invitation à une salle de jeu : un lien direct (/game?salle=CODE) que l'on peut
 * copier, envoyer par email (le serveur l'envoie en SMTP ; sinon, repli sur la messagerie du joueur) ou par WhatsApp.
 * Usage : <app-invitation-salle [code]="salle.code" [scenario]="scenarioDeLaSalle?.nom" [hote]="pseudo" />
 */
@Component({
  selector: 'app-invitation-salle',
  standalone: true,
  template: `
    <div class="rounded-xl border border-gray-700 bg-[#0d121c] p-4 text-left">
      <p class="mb-3 text-sm font-semibold text-white">Inviter un joueur dans cette salle</p>

      <div class="flex gap-2">
        <input type="text" readonly [value]="lien()" (focus)="$any($event.target).select()"
          class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-[#05080f] px-3 py-2 text-xs text-gray-300 outline-none" />
        <button type="button" (click)="copier()"
          class="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
          {{ copie() ? 'Lien copié ✓' : 'Copier le lien' }}
        </button>
      </div>

      <div class="mt-3 flex gap-2">
        <input type="email" placeholder="Email de votre ami" autocomplete="off"
          [value]="email()" (input)="saisie($any($event.target).value)" (keyup.enter)="envoyerParServeur()"
          class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-[#05080f] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        <button type="button" (click)="envoyerParServeur()" [disabled]="enCours()"
          class="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {{ enCours() ? 'Envoi…' : 'Envoyer l’invitation' }}
        </button>
      </div>

      @if (message()) {
        <p class="mt-2 text-xs" [class]="erreur() ? 'text-red-400' : 'text-emerald-400'">{{ message() }}</p>
      }

      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        @if (emailValide()) {
          <a [href]="lienEmail()" class="text-gray-400 underline hover:text-white">Ouvrir ma messagerie à la place</a>
        }
        <a [href]="lienWhatsApp()" target="_blank" rel="noopener" class="text-gray-400 underline hover:text-white">Envoyer par WhatsApp</a>
      </div>
    </div>
  `
})
export class InvitationSalleComponent {
  readonly code = input.required<string>();
  readonly scenario = input<string | null | undefined>('');
  readonly hote = input<string | null | undefined>('');

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly email = signal('');
  readonly enCours = signal(false);
  readonly copie = signal(false);
  readonly message = signal('');
  readonly erreur = signal(false);

  readonly lien = computed(() => `${window.location.origin}/game?salle=${encodeURIComponent(this.code())}`);
  readonly emailValide = computed(() => EMAIL.test(this.email().trim()));

  private readonly texte = computed(() => {
    const qui = this.hote()?.trim() ? `${this.hote()!.trim()} t'invite` : `Tu es invité(e)`;
    const quoi = this.scenario() ? ` (scénario : ${this.scenario()})` : '';
    return `Bonjour,\n\n${qui} à rejoindre une salle de la Salle de Marché CryptoTrade${quoi}.\n\n`
      + `Code de la salle : ${this.code()}\nLien direct : ${this.lien()}\n\n`
      + `Clique sur le lien, choisis un pseudo et rejoins la partie. À bientôt !`;
  });

  readonly lienEmail = computed(() =>
    `mailto:${encodeURIComponent(this.email().trim())}`
    + `?subject=${encodeURIComponent('Invitation : rejoins ma salle de trading CryptoTrade')}`
    + `&body=${encodeURIComponent(this.texte())}`);

  readonly lienWhatsApp = computed(() => `https://wa.me/?text=${encodeURIComponent(this.texte())}`);

  saisie(valeur: string): void {
    this.email.set(valeur);
    this.message.set('');
    this.erreur.set(false);
  }

  async copier(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.lien());
      this.copie.set(true);
      setTimeout(() => this.copie.set(false), 2000);
    } catch {
      this.erreur.set(true);
      this.message.set('Copie impossible : sélectionnez le lien et copiez-le avec Ctrl+C.');
    }
  }

  /** Le serveur envoie l'email en SMTP. En cas d'échec, on propose d'ouvrir sa messagerie. */
  envoyerParServeur(): void {
    if (this.enCours()) return;
    if (!this.emailValide()) { this.erreur.set(true); this.message.set('Entrez une adresse email valide.'); return; }
    if (!this.auth.estConnecte()) {
      this.erreur.set(true);
      this.message.set('Connectez-vous pour envoyer l’email automatiquement, ou utilisez « Ouvrir ma messagerie ».');
      return;
    }
    this.enCours.set(true);
    this.erreur.set(false);
    this.message.set('');
    this.http.post<{ message: string }>(`${API_BASE}/invitations`, {
      email: this.email().trim(),
      code: this.code(),
      hote: this.hote() ?? '',
      scenario: this.scenario() ?? ''
    }).subscribe({
      next: (r) => {
        this.enCours.set(false);
        this.erreur.set(false);
        this.message.set(r.message);
        this.email.set('');
      },
      error: (e: unknown) => {
        this.enCours.set(false);
        this.erreur.set(true);
        this.message.set(texteErreur(e, 'L’envoi a échoué.') + ' Vous pouvez ouvrir votre messagerie à la place.');
      }
    });
  }
}
