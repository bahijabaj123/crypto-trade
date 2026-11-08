import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router'; // 👈 IMPORT AJOUTÉ
import { GlossaireService } from '../../../core/services/glossaire.service';
import { CoursDrawerComponent } from './cours-drawer.component';

@Component({
  selector: 'app-terme',
  standalone: true,
  imports: [CommonModule, CoursDrawerComponent],
  template: `
    <span class="relative inline-block">
      <button
        type="button"
        (click)="ouvrir()"
        class="underline decoration-dotted decoration-brand-500/50 underline-offset-2 text-brand-500 hover:text-brand-600 hover:decoration-brand-500 transition cursor-help">
        <ng-content></ng-content>
      </button>

      @if (ouvert() && terme(); as t) {
        <div class="absolute z-40 top-full left-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-2xl p-4">
          <div class="flex items-start justify-between gap-2 mb-2">
            <h4 class="text-sm font-bold text-gray-800 dark:text-white/90">{{ t.titre }}</h4>
            <button (click)="fermer()" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{{ t.definition }}</p>
          @if (t.exemple) {
            <p class="text-[11px] font-mono text-brand-500 mt-2 p-2 rounded-lg bg-brand-50 dark:bg-brand-500/10">{{ t.exemple }}</p>
          }
          @if (t.cours) {
            <button
              type="button"
              (click)="ouvrirCours()"
              class="mt-3 w-full text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg py-2 transition">
              📚 Voir le cours : {{ t.cours.titre }}
            </button>
          }
        </div>
      }
    </span>

    @if (drawerOuvert() && terme()?.cours; as c) {
      <app-cours-drawer
        [titre]="c.titre"
        [route]="c.route"
        (fermer)="drawerOuvert.set(false)">
      </app-cours-drawer>
    }
  `
})
export class TermeComponent {
  @Input({ required: true }) cle!: string;

  private readonly glossaire = inject(GlossaireService);
  private readonly router = inject(Router); // 👈 INJECTION AJOUTÉE

  readonly ouvert = signal(false);
  readonly drawerOuvert = signal(false);

  terme() { return this.glossaire.get(this.cle); }

  ouvrir() { this.ouvert.set(true); }
  fermer() { this.ouvert.set(false); }
  
  ouvrirCours() {
    this.ouvert.set(false);
    if (this.terme()?.cours) {
      // 👇 Redirection directe vers le bon cours et la bonne leçon
      this.router.navigate([this.terme()!.cours!.route]); 
    }
  }
}