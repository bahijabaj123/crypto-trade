import { Component, inject } from '@angular/core';
import { Niveau, NiveauService } from '../../../core/services/niveau.service';

@Component({
  selector: 'app-niveau-switch',
  standalone: true,
  template: `
    <div class="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
      @for (n of niveaux; track n.code) {
        <button
          type="button"
          (click)="niveau.setNiveau(n.code)"
          [class]="niveau.niveau() === n.code
            ? 'bg-white dark:bg-gray-700 text-brand-500 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'"
          class="px-3 py-1.5 text-xs font-medium rounded-lg transition">
          {{ n.label }}
        </button>
      }
    </div>
  `
})
export class NiveauSwitchComponent {
  readonly niveau = inject(NiveauService);

  readonly niveaux: { code: Niveau; label: string }[] = [
    { code: 'DEBUTANT', label: 'Débutant' },
    { code: 'INTERMEDIAIRE', label: 'Intermédiaire' },
    { code: 'AVANCE', label: 'Avancé' }
  ];
}