import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, switchMap, timer } from 'rxjs';

import { BougieVue, IntervalleBougie } from '../../models/crypto.models';
import { CryptoApiService, messageErreur } from '../../services/crypto-api.service';

/** Graphique en chandeliers (bougies japonaises) avec moyenne mobile sur 20 périodes. */
@Component({
  selector: 'app-candle-chart',
  templateUrl: './candle-chart.component.html',
})
export class CandleChartComponent {
  private readonly api = inject(CryptoApiService);

  /** Crypto affichée, ex. « BTCUSDT » (fournie par la page qui utilise le graphique). */
  readonly symbole = input.required<string>();

  readonly intervalles: { code: IntervalleBougie; nom: string }[] = [
    { code: '5m', nom: '5 min' },
    { code: '15m', nom: '15 min' },
    { code: '1h', nom: '1 h' },
    { code: '4h', nom: '4 h' },
    { code: '1d', nom: '1 jour' },
  ];
  readonly intervalle = signal<IntervalleBougie>('1h');
  readonly bougies = signal<BougieVue[]>([]);
  readonly erreur = signal<string | null>(null);

  /** Dimensions du dessin (viewBox) : la zone de bougies + de la place pour les prix (droite) et les dates (bas). */
  readonly largeur = 800;
  readonly hauteur = 320;
  private readonly margeDroite = 74;
  private readonly margeBas = 26;
  private readonly margeHaut = 10;
  private readonly periodeMoyenne = 20;

  constructor() {
    // À chaque changement de crypto ou d'intervalle : on repart de zéro, puis on actualise toutes les 10 s.
    toObservable(computed(() => ({ s: this.symbole(), i: this.intervalle() })))
      .pipe(
        switchMap(({ s, i }) => {
          this.bougies.set([]);
          return timer(0, 10_000).pipe(
            exhaustMap(() =>
              this.api.getBougies(s, i, 60).pipe(
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
      .subscribe((liste) => {
        this.bougies.set(liste);
        this.erreur.set(null);
      });
  }

  /** Transforme les bougies (prix, dates) en formes à dessiner (coordonnées x, y). */
  readonly dessin = computed(() => {
    const liste = this.bougies();
    if (liste.length < 2) return null;

    const zoneL = this.largeur - this.margeDroite;
    const zoneH = this.hauteur - this.margeBas - this.margeHaut;
    const min = Math.min(...liste.map((b) => b.bas));
    const max = Math.max(...liste.map((b) => b.haut));
    const ecart = max - min || 1;
    const y = (prix: number) => this.margeHaut + zoneH * (1 - (prix - min) / ecart);
    const pas = zoneL / liste.length;
    const x = (i: number) => pas * i + pas / 2;
    const largeurBougie = Math.max(1.5, pas * 0.65);

    const formes = liste.map((b, i) => {
      const haussier = b.cloture >= b.ouverture;
      const yCorpsHaut = y(Math.max(b.ouverture, b.cloture));
      const yCorpsBas = y(Math.min(b.ouverture, b.cloture));
      return {
        x: x(i),
        xCorps: x(i) - largeurBougie / 2,
        largeurCorps: largeurBougie,
        yHaut: y(b.haut),
        yBas: y(b.bas),
        yCorps: yCorpsHaut,
        hauteurCorps: Math.max(1, yCorpsBas - yCorpsHaut), // une bougie plate reste visible
        haussier,
        info: `${this.date(b.temps)} · O ${this.prix(b.ouverture)} · H ${this.prix(b.haut)} · B ${this.prix(b.bas)} · C ${this.prix(b.cloture)}`,
      };
    });

    // Moyenne mobile : moyenne des 20 dernières clôtures, bougie par bougie
    const points: string[] = [];
    for (let i = this.periodeMoyenne - 1; i < liste.length; i++) {
      const somme = liste.slice(i - this.periodeMoyenne + 1, i + 1).reduce((t, b) => t + b.cloture, 0);
      points.push(`${x(i).toFixed(1)},${y(somme / this.periodeMoyenne).toFixed(1)}`);
    }

    // 5 lignes horizontales de repère avec leur prix
    const grille = Array.from({ length: 5 }, (_, k) => {
      const valeur = min + (ecart * k) / 4;
      return { y: y(valeur), libelle: this.prix(valeur) };
    });

    const dernier = liste[liste.length - 1];
    const premier = liste[0];
    const hausse = dernier.cloture >= premier.ouverture;
    const variation = ((dernier.cloture - premier.ouverture) / premier.ouverture) * 100;
    const milieu = liste[Math.floor(liste.length / 2)];

    return {
      formes,
      moyenne: points.join(' '),
      grille,
      yDernier: y(dernier.cloture),
      dernierPrix: this.prix(dernier.cloture),
      zoneL,
      xDates: [
        { x: x(0), texte: this.date(premier.temps), ancre: 'start' },
        { x: x(Math.floor(liste.length / 2)), texte: this.date(milieu.temps), ancre: 'middle' },
        { x: x(liste.length - 1), texte: this.date(dernier.temps), ancre: 'end' },
      ],
      hausse,
      variation,
      plusHaut: this.prix(max),
      plusBas: this.prix(min),
    };
  });

  choisirIntervalle(code: IntervalleBougie): void {
    this.intervalle.set(code);
  }

  /** Prix lisible : peu de décimales pour un gros prix (BTC), plus pour un petit prix (XRP). */
  prix(valeur: number): string {
    const decimales = valeur >= 1000 ? 2 : valeur >= 1 ? 3 : 5;
    return valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  private date(temps: number): string {
    const d = new Date(temps);
    return this.intervalle() === '1d'
      ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
