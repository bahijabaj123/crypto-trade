import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, switchMap, timer } from 'rxjs';

import { ProjectionRisque } from '../../models/crypto.models';
import { CryptoApiService, messageErreur } from '../../services/crypto-api.service';

/** Projection du portefeuille (Monte-Carlo) dessinée en « éventail » : pire cas, cas médian, meilleur cas. */
@Component({
  selector: 'app-projection-chart',
  imports: [DecimalPipe],
  templateUrl: './projection-chart.component.html',
})
export class ProjectionChartComponent {
  private readonly api = inject(CryptoApiService);

  readonly horizons = [
    { jours: 7, nom: '7 jours' },
    { jours: 30, nom: '30 jours' },
    { jours: 90, nom: '90 jours' },
  ];
  readonly jours = signal(30);
  readonly projection = signal<ProjectionRisque | null>(null);
  readonly erreur = signal<string | null>(null);

  readonly largeur = 800;
  readonly hauteur = 300;
  private readonly margeDroite = 76;
  private readonly margeBas = 26;
  private readonly margeHaut = 10;

  constructor() {
    // À chaque changement d'horizon : on recharge, puis on actualise toutes les 30 s (la composition du portefeuille évolue)
    toObservable(this.jours)
      .pipe(
        switchMap((j) => {
          this.projection.set(null);
          return timer(0, 30_000).pipe(
            exhaustMap(() =>
              this.api.getProjection(j).pipe(
                catchError((e) => {
                  this.erreur.set(messageErreur(e));
                  return EMPTY;
                }),
              ),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((p) => {
        this.projection.set(p);
        this.erreur.set(null);
      });
  }

  choisir(jours: number): void {
    this.jours.set(jours);
  }

  /** Transforme les valeurs (en USDT, par jour) en formes à dessiner. */
  readonly dessin = computed(() => {
    const p = this.projection();
    if (!p || !p.disponible || p.trajectoire.length < 2) return null;

    const zoneL = this.largeur - this.margeDroite;
    const zoneH = this.hauteur - this.margeBas - this.margeHaut;
    const t = p.trajectoire;
    const min = Math.min(...t.map((x) => x.p5), p.valeurInitiale);
    const max = Math.max(...t.map((x) => x.p95), p.valeurInitiale);
    const ecart = max - min || 1;
    const x = (jour: number) => (jour / p.jours) * zoneL;
    const y = (valeur: number) => this.margeHaut + zoneH * (1 - (valeur - min) / ecart);
    const point = (jour: number, valeur: number) => `${x(jour).toFixed(1)},${y(valeur).toFixed(1)}`;

    // Une bande = le contour du haut (de gauche à droite) puis celui du bas (de droite à gauche)
    const bande = (haut: (q: (typeof t)[number]) => number, bas: (q: (typeof t)[number]) => number) =>
      [...t.map((q) => point(q.jour, haut(q))), ...[...t].reverse().map((q) => point(q.jour, bas(q)))].join(' ');

    const grille = Array.from({ length: 5 }, (_, k) => {
      const valeur = min + (ecart * k) / 4;
      return { y: y(valeur), libelle: Math.round(valeur).toLocaleString('fr-FR') };
    });

    return {
      bande90: bande((q) => q.p95, (q) => q.p5),
      bande50: bande((q) => q.p75, (q) => q.p25),
      mediane: t.map((q) => point(q.jour, q.p50)).join(' '),
      yInitial: y(p.valeurInitiale),
      zoneL,
      grille,
      xFin: x(p.jours),
      yFin: { p5: y(t[t.length - 1].p5), p50: y(t[t.length - 1].p50), p95: y(t[t.length - 1].p95) },
    };
  });
}
