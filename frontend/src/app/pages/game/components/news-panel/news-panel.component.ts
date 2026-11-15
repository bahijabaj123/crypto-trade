import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsItem } from '../../../../core/models/news-scenarios';

/** Panneau « Actualités » : affiche les news dont la date est atteinte par le temps du marché. */
@Component({
  selector: 'app-news-panel',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    @keyframes entree { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
    .nouvelle { animation: entree 0.45s ease-out; }
  `],
  template: `
    <div class="bg-[#0d121c] rounded-2xl border border-gray-800">
      <div class="px-4 py-2.5 border-b border-gray-800 flex justify-between items-center">
        <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Actualités</h3>
        <span class="text-[10px] font-bold text-amber-400 animate-pulse">● EN DIRECT</span>
      </div>
      <div class="max-h-60 overflow-y-auto p-3 space-y-2">
        @for (n of visibles(); track n.date; let i = $index) {
          <div class="nouvelle rounded-xl border p-2.5"
               [class]="i === 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-gray-800 bg-[#05080f]'">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-[10px] font-mono text-gray-400">{{ n.date | date: 'dd/MM/yyyy' }}</span>
              <span class="flex items-center gap-1.5">
                @if (i === 0) {
                  <span class="px-1.5 py-0.5 rounded bg-amber-400 text-[#1a1100] text-[9px] font-black uppercase">Nouveau</span>
                }
                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-800 text-gray-300">{{ n.categorie }}</span>
              </span>
            </div>
            <p class="text-sm font-semibold text-white leading-snug">{{ n.titre }}</p>
            @if (n.detail) { <p class="text-xs text-gray-400 mt-0.5">{{ n.detail }}</p> }
          </div>
        } @empty {
          <p class="text-xs text-gray-500 italic py-3 text-center">Aucune actualité pour le moment…</p>
        }
      </div>
    </div>
  `
})
export class NewsPanelComponent {
  /** Toutes les news du scénario. */
  readonly news = input.required<NewsItem[]>();
  /** Date actuelle du marché (ms). */
  readonly dateMarche = input<number | null>(null);

  /** News déjà atteintes, la plus récente en premier. */
  readonly visibles = computed(() => {
    const t = this.dateMarche();
    if (t === null) return [];
    return this.news()
      .filter(n => new Date(n.date).getTime() <= t)
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}