import { Component, Input } from '@angular/core';

export type MarketIconType = 'crypto' | 'stocks' | 'forex' | 'commodities';

/**
 * Icône vectorielle (SVG) d'un marché : remplace les émojis, rendus différents selon l'ordinateur.
 * Elle prend la couleur du texte du bouton (currentColor) et suit sa taille (1.15em).
 * Utilisation : <app-market-icon type="crypto" />
 */
@Component({
  selector: 'app-market-icon',
  standalone: true,
  host: { style: 'display:inline-flex;vertical-align:-0.2em;margin-right:0.4em' },
  template: `
    <svg width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (type) {
        @case ('crypto') {
          <circle cx="12" cy="12" r="9.5"></circle>
          <path d="M9.5 7.5v9M9.5 7.5h3.2a2.2 2.2 0 0 1 0 4.5H9.5m0 0h3.6a2.25 2.25 0 0 1 0 4.5H9.5M11 6v1.5M11 16.5V18M13.5 6v1.5M13.5 16.5V18"></path>
        }
        @case ('stocks') {
          <path d="M22 7l-8.5 8.5-5-5L2 17"></path>
          <path d="M16 7h6v6"></path>
        }
        @case ('forex') {
          <path d="M3 8h15"></path><path d="M14 4l4 4-4 4"></path>
          <path d="M21 16H6"></path><path d="M10 12l-4 4 4 4"></path>
        }
        @case ('commodities') {
          <path d="M12 2.5S5.5 9.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z"></path>
          <path d="M9 15a3 3 0 0 0 3 3"></path>
        }
      }
    </svg>
  `
})
export class MarketIconComponent {
  @Input() type: MarketIconType = 'crypto';
}
