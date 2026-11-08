import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cours-drawer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="fixed inset-0 z-50 flex justify-end">
      <div class="absolute inset-0 bg-black/40" (click)="fermer.emit()"></div>
      <div class="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl p-6 overflow-y-auto">
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-800 dark:text-white/90">📚 {{ titre }}</h3>
          <button (click)="fermer.emit()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
          Ce terme est expliqué dans un module de formation. Clique ci-dessous pour ouvrir le cours complet (vidéo, quiz, progression).
        </p>
        <a [routerLink]="route" (click)="fermer.emit()"
          class="block w-full text-center bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-xl py-3 transition">
          Ouvrir le cours
        </a>
      </div>
    </div>
  `
})
export class CoursDrawerComponent {
  @Input({ required: true }) titre!: string;
  @Input({ required: true }) route!: string;
  @Output() fermer = new EventEmitter<void>();
}