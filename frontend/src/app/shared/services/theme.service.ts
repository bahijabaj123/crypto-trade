import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly CLE = 'theme';

  // Thème enregistré, sinon sombre (identité de l'app)
  private themeSubject = new BehaviorSubject<Theme>(this.lire());
  theme$ = this.themeSubject.asObservable();

  constructor() {
    this.appliquer(this.themeSubject.value);
  }

  get theme(): Theme { return this.themeSubject.value; }
  get isDark(): boolean { return this.themeSubject.value === 'dark'; }

  toggleTheme(): void {
    this.setTheme(this.isDark ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.themeSubject.next(theme);
    try { localStorage.setItem(this.CLE, theme); } catch { /* navigation privée */ }
    this.appliquer(theme);
  }

  private lire(): Theme {
    try {
      const v = localStorage.getItem(this.CLE);
      if (v === 'light' || v === 'dark') return v;
    } catch { /* ignore */ }
    return 'dark';
  }

  private appliquer(theme: Theme): void {
    const html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.setAttribute('data-color-scheme', theme);
    html.setAttribute('data-theme', theme);
  }
}