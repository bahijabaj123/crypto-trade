import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../../../core/api.config';

/**
 * Sondage de fin de partie : note 1..5, pistes à cocher et commentaire libre.
 * Utilisation (dans la fenêtre de fin de partie) :
 *   <app-sondage-fin [pseudo]="pseudo ?? ''" [salle]="roomCode ?? ''" />
 */
@Component({
  selector: 'app-sondage-fin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="rounded-2xl border border-gray-700/70 bg-[#0d121c] p-4 mt-4 text-left">
  @if (!envoye) {
    <div class="font-bold text-white text-sm">Ton avis nous aide</div>
    <p class="text-xs text-gray-500 mb-3">30 secondes, anonyme pour les autres joueurs.</p>

    <div class="flex items-center gap-1 mb-3" (mouseleave)="survol = 0">
      @for (n of [1,2,3,4,5]; track n) {
        <button type="button" (click)="note = n" (mouseenter)="survol = n"
                class="text-3xl leading-none transition"
                [class]="(survol || note) >= n ? 'text-amber-300' : 'text-gray-700'"
                [attr.aria-label]="n + ' sur 5'">★</button>
      }
      <span class="ml-2 text-xs text-gray-500">{{ libelleNote() }}</span>
    </div>

    <div class="text-xs text-gray-400 mb-1.5">Qu'est-ce qui t'a gêné ? <span class="text-gray-600">(facultatif)</span></div>
    <div class="flex flex-wrap gap-1.5 mb-2">
      @for (p of pistes; track p) {
        <button type="button" (click)="basculer(p)"
                class="px-2.5 py-1 rounded-full border text-[11px] transition"
                [class]="choisies.has(p) ? 'border-indigo-400 text-indigo-200 bg-indigo-500/10' : 'border-gray-700 text-gray-400 hover:text-white'">
          {{ p }}
        </button>
      }
    </div>
    <textarea [(ngModel)]="commentaire" rows="3" maxlength="500"
              placeholder="Dis-nous ce qui n'allait pas ou ce qu'on pourrait améliorer…"
              class="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-none"></textarea>

    <div class="flex items-center justify-between mt-2">
      <span class="text-[11px] text-gray-600">{{ commentaire.length }}/500</span>
      <button type="button" (click)="envoyer()" [disabled]="!note || envoi"
              class="px-4 py-1.5 rounded-lg border border-indigo-400/50 text-indigo-300 text-sm font-semibold hover:bg-indigo-500/10 disabled:opacity-40 transition">
        {{ envoi ? 'Envoi…' : 'Envoyer mon avis' }}
      </button>
    </div>
    @if (erreur) { <p class="text-xs text-red-400 mt-2">Envoi impossible pour le moment. Réessaie dans un instant.</p> }
  } @else {
    <div class="text-center py-3">
      <div class="text-emerald-300 font-bold">Merci pour ton avis ! ✔</div>
      <p class="text-xs text-gray-500 mt-1">Il sera lu par l'équipe.</p>
    </div>
  }
</div>
  `
})
export class SondageFinComponent {
  @Input() pseudo = '';
  @Input() salle = '';

  private readonly http = inject(HttpClient);

  readonly pistes = ['Trop lent', 'Pas clair', 'Bug / erreur', 'Prix peu réaliste', 'Interface chargée', 'Chat gênant', 'Trop court', 'Trop long'];
  choisies = new Set<string>();
  note = 0;
  survol = 0;
  commentaire = '';
  envoi = false;
  envoye = false;
  erreur = false;

  libelleNote(): string {
    return ['', 'Décevant', 'Moyen', 'Correct', 'Bien', 'Excellent'][this.survol || this.note] ?? '';
  }

  basculer(p: string): void {
    if (this.choisies.has(p)) this.choisies.delete(p); else this.choisies.add(p);
  }

  envoyer(): void {
    if (!this.note || this.envoi) return;
    this.envoi = true;
    this.erreur = false;
    this.http.post(`${API_URL}/api/sondage`, {
      pseudo: this.pseudo, salle: this.salle, note: this.note,
      commentaire: this.commentaire.trim(), tags: [...this.choisies]
    }).subscribe({
      next: () => { this.envoye = true; this.envoi = false; },
      error: () => { this.erreur = true; this.envoi = false; }
    });
  }
}