import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-demarche',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h3 class="text-sm font-bold text-gray-800 dark:text-white/90">🔗 La démarche, de bout en bout</h3>
        <span class="text-xs text-gray-500 hidden sm:inline">Chaque étape alimente la suivante</span>
      </div>

      <div class="flex items-stretch gap-1 overflow-x-auto pb-1">
        @for (s of etapes; track s.id; let i = $index) {
          <a [routerLink]="s.route"
            [class]="s.id === etape
              ? 'bg-brand-500 text-white border-brand-500 shadow-md'
              : 'bg-gray-50 dark:bg-white/[0.04] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-brand-500'"
            class="group flex items-center gap-2 shrink-0 rounded-xl border px-3 py-2.5 transition-all">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              [class]="s.id === etape ? 'bg-white/20' : 'bg-white dark:bg-gray-800 text-brand-600'">{{ i + 1 }}</span>
            <span class="text-sm font-medium whitespace-nowrap">{{ s.label }}</span>
          </a>
          @if (i < etapes.length - 1) {
            <span class="flex items-center text-gray-300 dark:text-gray-600 shrink-0">›</span>
          }
        }
      </div>

      @if (courante(); as c) {
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <div class="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
            <p class="text-[11px] font-semibold text-gray-500 mb-0.5">Cette étape reçoit</p>
            <p class="text-gray-700 dark:text-gray-300">{{ c.recoit }}</p>
          </div>
          <div class="rounded-xl bg-brand-50 dark:bg-brand-500/10 p-3">
            <p class="text-[11px] font-semibold text-brand-600 mb-0.5">Elle alimente</p>
            <p class="text-gray-700 dark:text-gray-300">{{ c.alimente }}</p>
          </div>
        </div>
      }
    </div>
  `
})
export class DemarcheComponent {
  @Input() etape = '';

  readonly etapes = [
    { id: 'marche', label: 'Marché', route: '/dashboard', recoit: 'Les cours réels de Binance.', alimente: 'La volatilité, base de la prime et de la sinistralité.' },
    { id: 'tarification', label: 'Tarification', route: '/actuariat', recoit: 'La volatilité et le comportement du trader.', alimente: 'La prime et la probabilité de sinistre.' },
    { id: 'contrat', label: 'Contrat paramétrique', route: '/assurance-parametrique', recoit: 'La probabilité de déclenchement estimée.', alimente: 'Les contrats vendus et les indemnités à payer.' },
    { id: 'provisions', label: 'Provisions', route: '/provisions', recoit: 'Les sinistres déjà survenus mais pas réglés.', alimente: 'Le résultat et le capital requis.' },
    { id: 'assureur', label: 'Mode Assureur', route: '/mode-assureur', recoit: 'Le capital, les provisions et la sinistralité.', alimente: 'La décision finale : survivre ou faire faillite.' }
  ];

  courante() {
    return this.etapes.find(e => e.id === this.etape) ?? null;
  }
}