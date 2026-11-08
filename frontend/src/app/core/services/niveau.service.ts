import { Injectable, signal } from '@angular/core';

export type Niveau = 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE';

@Injectable({ providedIn: 'root' })
export class NiveauService {
  readonly niveau = signal<Niveau>('INTERMEDIAIRE');

  setNiveau(n: Niveau): void {
    this.niveau.set(n);
  }

  /** true si le niveau courant est au moins celui demandé */
  auMoins(n: Niveau): boolean {
    const ordre: Niveau[] = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];
    return ordre.indexOf(this.niveau()) >= ordre.indexOf(n);
  }

  /** Affiche un bloc uniquement pour un niveau donné ou supérieur */
  visiblePour(n: Niveau): boolean {
    return this.auMoins(n);
  }
}