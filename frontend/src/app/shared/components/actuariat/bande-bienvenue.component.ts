import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-bande-bienvenue',
  standalone: true,
  template: `
    <div [class]="classes" class="rounded-2xl p-5 sm:p-6 border shadow-sm">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
          [class]="iconeBg">
          {{ icone }}
        </div>
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wide opacity-80 mb-1">{{ cle }}</p>
          <h2 class="text-lg sm:text-xl font-black mb-1">{{ titre }}</h2>
          <p class="text-sm leading-relaxed opacity-90">{{ texte }}</p>
        </div>
      </div>
    </div>
  `
})
export class BandeBienvenueComponent {
  @Input({ required: true }) cle!: string;
  @Input({ required: true }) titre!: string;
  @Input({ required: true }) texte!: string;
  @Input() variante: 'brand' | 'purple' | 'teal' = 'brand';
  @Input() icone = '👋';

  get classes(): string {
    const map = {
      brand: 'bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-500/10 dark:to-brand-500/5 border-brand-200 dark:border-brand-500/30 text-brand-900 dark:text-brand-100',
      purple: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-500/10 dark:to-purple-500/5 border-purple-200 dark:border-purple-500/30 text-purple-900 dark:text-purple-100',
      teal: 'bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-500/10 dark:to-teal-500/5 border-teal-200 dark:border-teal-500/30 text-teal-900 dark:text-teal-100'
    };
    return map[this.variante];
  }

  get iconeBg(): string {
    const map = {
      brand: 'bg-brand-500/20',
      purple: 'bg-purple-500/20',
      teal: 'bg-teal-500/20'
    };
    return map[this.variante];
  }
}