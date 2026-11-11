import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { AiAdvisorPanelComponent } from './ai-advisor-panel.component';

const ROUTES_ADVISOR = new Set(['/dashboard', '/trading']);

/** Bouton flottant et tiroir IA : visible seulement sur Dashboard et Trading. */
@Component({
  selector: 'app-ai-advisor-shell',
  imports: [CdkTrapFocus, AiAdvisorPanelComponent],
  templateUrl: './ai-advisor-shell.component.html',
})
export class AiAdvisorShellComponent {
  private readonly router = inject(Router);

  readonly visible = signal(false);
  readonly ouvert = signal(false);

  @ViewChild('boutonAdvisor') boutonAdvisor?: ElementRef<HTMLButtonElement>;

  private focusARestituer: HTMLElement | null = null;

  constructor() {
    this.actualiserRoute(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.actualiserRoute(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.restaurerDefilement();
  }

  ouvrir(): void {
    const actif = document.activeElement;
    this.focusARestituer =
      actif instanceof HTMLElement ? actif : (this.boutonAdvisor?.nativeElement ?? null);
    this.ouvert.set(true);
    document.body.style.overflow = 'hidden';
  }

  fermer(): void {
    if (!this.ouvert()) {
      return;
    }
    this.ouvert.set(false);
    this.restaurerDefilement();
    queueMicrotask(() => this.focusARestituer?.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.ouvert()) {
      this.fermer();
    }
  }

  private actualiserRoute(url: string): void {
    const chemin = url.split('?')[0].split('#')[0];
    const surPageAutorisee = ROUTES_ADVISOR.has(chemin);
    this.visible.set(surPageAutorisee);
    if (!surPageAutorisee) {
      this.fermer();
    }
  }

  private restaurerDefilement(): void {
    document.body.style.overflow = 'unset';
  }
}
