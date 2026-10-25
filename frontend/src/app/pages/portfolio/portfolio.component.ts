import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';

import { ProjectionChartComponent } from '../../shared/components/projection-chart/projection-chart.component';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { AnalyseRisque, PointValeur, PortefeuilleVue, ScenarioChoc } from '../../shared/models/crypto.models';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';

import { SimulatedOrdersService } from '../../core/services/simulated-orders.service';
import { SimulatedPortfolioService, SimulatedPosition } from '../../core/services/simulated-portfolio.service';
import { MarketService } from '../../core/services/market.service';
import { TickerData } from '../../core/models/ticker.model';


@Component({
  selector: 'app-portfolio',
  imports: [DecimalPipe, DatePipe, FormsModule, RouterLink, ProjectionChartComponent, PageBreadcrumbComponent],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
})
export class PortfolioComponent {

    public readonly simPortfolio = inject(SimulatedPortfolioService);
  public readonly marketService = inject(MarketService);
  public readonly activeMarket = signal(this.marketService.activeMarket);
  
  // Signal pour stocker les prix actuels des actifs simulés
  public readonly currentPrices = signal<{[symbol: string]: number}>({});


  private readonly api = inject(CryptoApiService);

  readonly portefeuille = signal<PortefeuilleVue | null>(null);
  readonly courbe = signal<PointValeur[]>([]);
  readonly erreur = signal<string | null>(null);
  readonly chargement = signal(true);
  readonly risque = signal<AnalyseRisque | null>(null);
  readonly scenario = signal<ScenarioChoc | null>(null);
  /** Baisse du marché simulée (en %) : 40 % = le crash de mai 2021 sur le Bitcoin. */
  choc = 40;

  /** Dimensions du dessin SVG de la courbe. */
  readonly largeur = 600;
  readonly hauteur = 160;

  /** Transforme les points (valeur dans le temps) en coordonnées du dessin. */
  readonly dessin = computed(() => {
    const points = this.courbe();
    if (points.length < 2) return null;
    const valeurs = points.map((p) => p.valeur);
    const min = Math.min(...valeurs);
    const max = Math.max(...valeurs);
    const ecart = max - min || 1; // courbe plate : évite une division par zéro
    const marge = 8;
    const y = (v: number) => marge + (this.hauteur - 2 * marge) * (1 - (v - min) / ecart);
    const x = (i: number) => (i / (points.length - 1)) * this.largeur;
    const ligne = points.map((p, i) => `${x(i).toFixed(1)},${y(p.valeur).toFixed(1)}`).join(' ');
    const premier = valeurs[0];
    const dernier = valeurs[valeurs.length - 1];
    return {
      ligne,
      aire: `0,${this.hauteur} ${ligne} ${this.largeur},${this.hauteur}`,
      min,
      max,
      premier,
      dernier,
      hausse: dernier >= premier,
      debut: points[0].date,
      fin: points[points.length - 1].date,
    };
  });

  /** Dessin du camembert : une part pour le cash (USDT) + une part par crypto détenue. */
  readonly camembert = computed(() => {
    const r = this.risque();
    if (!r || r.valeurTotale <= 0) return null;

    const palette = ['#465fff', '#12b76a', '#f79009', '#f04438', '#7a5af8', '#0ba5ec', '#ee46bc', '#2ed3b7', '#667085'];
    const valeurInvestie = r.expositions.reduce((somme, e) => somme + e.valeur, 0);
    const parts = [
      { nom: 'Cash (USDT)', valeur: Math.max(0, r.valeurTotale - valeurInvestie), couleur: '#98a2b3' },
      ...r.expositions.map((e, i) => ({ nom: e.symbole, valeur: e.valeur, couleur: palette[i % palette.length] })),
    ];

    // Un cercle de rayon 70 a une circonférence de 2π×70 : chaque part en occupe une fraction (stroke-dasharray)
    const rayon = 70;
    const circonference = 2 * Math.PI * rayon;
    let decalage = 0;
    const tranches = parts.map((p) => {
      const pct = (p.valeur / r.valeurTotale) * 100;
      const longueur = (pct / 100) * circonference;
      const tranche = {
        ...p,
        pct,
        rayon,
        dasharray: `${longueur.toFixed(2)} ${(circonference - longueur).toFixed(2)}`,
        dashoffset: (-decalage).toFixed(2),
      };
      decalage += longueur;
      return tranche;
    });
    return { tranches, total: r.valeurTotale };
  });

  constructor() {
    this.charger();
    this.simuler();
    // Les prix bougent : on actualise toutes les 10 secondes
    interval(10_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.charger());
  }

  charger(): void {
    this.api.getHistoriqueValeur().subscribe({
      next: (points) => this.courbe.set(points),
      error: () => this.courbe.set([]), // la courbe est un bonus : on n'affiche pas d'erreur pour elle
    });
    this.api.getRisque().subscribe({
      next: (r) => this.risque.set(r),
      error: () => this.risque.set(null), // les indicateurs sont un complément : pas de message d'erreur bloquant
    });
    this.api.getPortefeuille().subscribe({
      next: (p) => {
        this.portefeuille.set(p);
        this.erreur.set(null);
        this.chargement.set(false);
      },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.chargement.set(false);
      },
    });

     this.marketService.activeMarket$.subscribe(m => {
      this.activeMarket.set(m);
      this.marketService.getTickers().subscribe(tickers => {
        const prices: {[sym: string]: number} = {};
        tickers.forEach(t => prices[t.symbol] = t.price);
        this.currentPrices.set(prices);
      });
    });
  
  }

  /** Lance la simulation de crash avec la valeur du curseur. */
  simuler(): void {
    this.api.getScenario(this.choc).subscribe({
      next: (s) => {
        this.scenario.set(s);
      },
      error: () => this.scenario.set(null),
    });
  }

  /** Affiche un nombre ou « — » quand l'indicateur est indisponible. */
  nombre(valeur: number | null, suffixe = '', decimales = 2): string {
    if (valeur === null) return '—';
    return (
      valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + suffixe
    );
  }

  couleurNiveau(niveau: AnalyseRisque['niveauRisque']): string {
    switch (niveau) {
      case 'FAIBLE':
        return 'bg-success-500';
      case 'MODERE':
        return 'bg-warning-500';
      case 'ELEVE':
        return 'bg-error-500';
      default:
        return 'bg-gray-400';
    }
  }

  libelleNiveau(niveau: AnalyseRisque['niveauRisque']): string {
    switch (niveau) {
      case 'FAIBLE':
        return 'Risque faible';
      case 'MODERE':
        return 'Risque modéré';
      case 'ELEVE':
        return 'Risque élevé';
      default:
        return 'Indisponible';
    }
  }

  libelleDiversification(d: AnalyseRisque['diversification']): string {
    return { BONNE: 'Bonne', MOYENNE: 'Moyenne', FAIBLE: 'Faible', AUCUNE: 'Aucune position' }[d];
  }

  /** Vert si gain, rouge si perte, gris si nul. */
  couleur(valeur: number): string {
    if (valeur > 0) return 'text-success-600 dark:text-success-500';
    if (valeur < 0) return 'text-error-600 dark:text-error-500';
    return 'text-gray-500 dark:text-gray-400';
  }

  signe(valeur: number): string {
    return valeur > 0 ? '+' : '';
  }

  /** Vrai si au moins un prix n'a pas pu être récupéré chez Binance. */
  prixObsoletes(p: PortefeuilleVue): boolean {
    return p.positionsOuvertes.some((pos) => !pos.prixDisponible);
  }
}
