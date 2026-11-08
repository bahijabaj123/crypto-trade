import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { MarketService } from '../../core/services/market.service';

type Fiabilite = 'faible' | 'moyenne' | 'bonne';

@Component({
  selector: 'app-assurance-parametrique',
  standalone: true,
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent],
  templateUrl: './assurance-parametrique.component.html',
  styleUrls: ['./assurance-parametrique.component.css']
})
export class AssuranceParametriqueComponent implements OnDestroy {
  private readonly marketService = inject(MarketService);
  private sub?: Subscription;

  // ---------- Hypothèses de tarification (à documenter dans le rapport) ----------
  private readonly NB_SIMULATIONS = 5000;   // trajectoires Monte-Carlo
  private readonly TAILLE_BLOC = 5;         // bootstrap par blocs de 5 jours (conserve les enchaînements de volatilité)
  private readonly K_CREDIBILITE = 5;       // Z = événements / (événements + K)
  private readonly LAMBDA_RISQUE = 0.10;    // chargement : 10 % de l'écart-type de l'indemnité
  private readonly PRIME_INCERTITUDE = 0.25;// +25 % de la prime pure quand les données sont pauvres (Z = 0)
  private readonly TAUX_FRAIS = 0.10;       // frais = 10 % de la prime commerciale
  private readonly PROBA_MIN = 0.0005;      // plancher : on ne vend jamais un risque à 0 €

  // ---------- Paramètres du contrat ----------
  public actif = 'BTCUSDT';
  public seuilBaisse = 30;      // %
  public dureeJours = 7;        // jours
  public montantGaranti = 10000;// €

  // ---------- Données ----------
  public historiquePrix: number[] = [];   // clôtures journalières
  private historiqueBas: number[] = [];   // plus bas journaliers (l'indice de déclenchement)
  private rendements: number[] = [];      // ln(clôture_t / clôture_t-1)
  private rendementsBas: number[] = [];   // ln(plus bas_t / clôture_t-1)
  public chargement = signal(false);

  // ---------- Résultats ----------
  public probabilite = 0;         // probabilité retenue (%)
  public probaHistorique = 0;     // fréquence observée (%)
  public probaSimulee = 0;        // Monte-Carlo (%)
  public probaMin = 0;            // borne basse de l'intervalle (%)
  public probaMax = 0;            // borne haute de l'intervalle (%)
  public evenements = 0;          // événements indépendants observés
  public fenetres = 0;            // fenêtres glissantes testées
  public credibilite = 0;         // Z (0 à 1) : poids accordé à l'historique
  public fiabilite: Fiabilite = 'faible';
  public regimeVol = 1;           // volatilité récente / volatilité de long terme
  public pireBaisse = 0;          // pire baisse observée sur la fenêtre (%)
  public periodeRetourAns = 0;    // « 1 fois tous les X ans »
  public ratioSPHistorique = 0;   // sinistres/primes si le contrat avait été vendu à chaque fenêtre (%)

  public primePure = 0;
  public chargementRisque = 0;
  public chargementIncertitude = 0;
  public frais = 0;
  public prime = 0;
  public tauxPrime = 0;           // prime / montant garanti (%)

  constructor() {
    this.chargerHistorique();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ======================= Chargement =======================
  private chargerHistorique(): void {
    this.sub?.unsubscribe();
    this.chargement.set(true);
    // Astuce : si getKlines accepte une limite, demande 1000 bougies (~2,7 ans) pour avoir plus d'événements extrêmes.
    this.sub = this.marketService.getKlines(this.actif, '1d').subscribe({
      next: (candles) => {
        this.historiquePrix = candles.map(c => c.close);
        this.historiqueBas = candles.map(c => c.low ?? c.close);
        this.preparerRendements();
        this.calculerTout();
        this.chargement.set(false);
      },
      error: (e) => {
        console.error('Erreur chargement historique:', e);
        this.chargement.set(false);
      }
    });
  }

  public changerActif(actif: string): void {
    this.actif = actif;
    this.historiquePrix = [];
    this.historiqueBas = [];
    this.calculerTout();
    this.chargerHistorique();
  }

  private preparerRendements(): void {
    const C = this.historiquePrix;
    const L = this.historiqueBas;
    this.rendements = [];
    this.rendementsBas = [];
    for (let t = 1; t < C.length; t++) {
      this.rendements.push(Math.log(C[t] / C[t - 1]));
      this.rendementsBas.push(Math.log(L[t] / C[t - 1]));
    }
    // Régime de volatilité : 30 derniers jours vs historique complet, borné entre 0,7 et 1,5
    if (this.rendements.length > 40) {
      const ratio = this.ecartType(this.rendements.slice(-30)) / this.ecartType(this.rendements);
      this.regimeVol = Math.min(1.5, Math.max(0.7, ratio));
    } else {
      this.regimeVol = 1;
    }
  }

  // ======================= Calcul principal =======================
  public calculerTout(): void {
    const N = this.dureeJours;
    const x = this.seuilBaisse / 100;
    const C = this.historiquePrix;
    const L = this.historiqueBas;

    if (C.length < N + 30) {
      this.remettreAZero();
      return;
    }

    // 1. Fréquence historique : le déclencheur est le PLUS BAS atteint dans la fenêtre (pas le prix final)
    const fen = C.length - N;
    let touches = 0;
    let evenements = 0;
    let dernier = -Infinity;
    let pire = 0;
    for (let i = 0; i < fen; i++) {
      let min = Infinity;
      for (let j = i + 1; j <= i + N; j++) min = Math.min(min, L[j]);
      const baisse = (C[i] - min) / C[i];
      pire = Math.max(pire, baisse);
      if (baisse >= x) {
        touches++;
        if (i - dernier >= N) evenements++; // fenêtres qui se chevauchent = un seul événement
        dernier = i;
      }
    }
    const pHist = touches / fen;
    const nIndep = Math.max(1, Math.floor(fen / N)); // nombre de fenêtres indépendantes
    const [bas, haut] = this.wilson(Math.min(evenements, nIndep), nIndep);

    // 2. Probabilité simulée (Monte-Carlo, bootstrap par blocs, plus bas intrajournalier inclus)
    const pSim = this.simuler(N, x);

    // 3. Crédibilité : peu d'événements observés => on s'appuie davantage sur la simulation
    const Z = evenements / (evenements + this.K_CREDIBILITE);
    const p = Math.max(this.PROBA_MIN, Z * pHist + (1 - Z) * pSim);

    // 4. Prime : prime pure + chargement de risque + chargement d'incertitude + frais
    const M = this.montantGaranti;
    const pure = M * p;
    const risque = this.LAMBDA_RISQUE * M * Math.sqrt(p * (1 - p));
    const incertitude = (1 - Z) * this.PRIME_INCERTITUDE * pure;
    const net = pure + risque + incertitude;
    const commerciale = net / (1 - this.TAUX_FRAIS);

    // Résultats exposés
    this.fenetres = fen;
    this.evenements = evenements;
    this.credibilite = Z;
    this.fiabilite = evenements < 3 ? 'faible' : evenements < 8 ? 'moyenne' : 'bonne';
    this.probaHistorique = this.arrondi(pHist * 100, 1);
    this.probaSimulee = this.arrondi(pSim * 100, 1);
    this.probaMin = this.arrondi(bas * 100, 1);
    this.probaMax = this.arrondi(haut * 100, 1);
    this.probabilite = this.arrondi(p * 100, 1);
    this.pireBaisse = this.arrondi(pire * 100, 1);
    this.periodeRetourAns = this.arrondi(N / p / 365, 1);

    this.primePure = Math.round(pure);
    this.chargementRisque = Math.round(risque);
    this.chargementIncertitude = Math.round(incertitude);
    this.prime = Math.round(commerciale);
    this.frais = Math.max(0, this.prime - this.primePure - this.chargementRisque - this.chargementIncertitude);
    this.tauxPrime = this.arrondi((commerciale / M) * 100, 2);
    this.ratioSPHistorique = commerciale > 0 ? Math.round(((pHist * M) / commerciale) * 100) : 0;
  }

  // ======================= Monte-Carlo =======================
  private simuler(N: number, x: number): number {
    const m = this.rendements.length;
    const k = this.regimeVol;
    const seuil = Math.log(1 - x); // négatif
    const nbBlocs = Math.ceil(N / this.TAILLE_BLOC);
    const alea = this.mulberry32(20260107 + m); // graine fixe : le résultat ne « tremble » pas quand on bouge un curseur
    let touche = 0;

    for (let s = 0; s < this.NB_SIMULATIONS; s++) {
      let cumul = 0;
      let jours = 0;
      let declenche = false;
      while (jours < N && !declenche) {
        const debut = Math.floor(alea() * (m - this.TAILLE_BLOC + 1));
        for (let u = 0; u < this.TAILLE_BLOC && jours < N; u++) {
          const idx = debut + u;
          if (cumul + k * this.rendementsBas[idx] <= seuil) { declenche = true; break; }
          cumul += k * this.rendements[idx];
          jours++;
        }
      }
      if (declenche) touche++;
    }
    return touche / this.NB_SIMULATIONS;
  }

  // ======================= Utilitaires =======================
  private wilson(k: number, n: number): [number, number] {
    const z = 1.96;
    const p = k / n;
    const d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const a = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [Math.max(0, (c - a) / d), Math.min(1, (c + a) / d)];
  }

  private ecartType(a: number[]): number {
    const mu = a.reduce((s, v) => s + v, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1));
  }

  private mulberry32(graine: number): () => number {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private arrondi(v: number, d: number): number {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  private remettreAZero(): void {
    this.probabilite = this.probaHistorique = this.probaSimulee = this.probaMin = this.probaMax = 0;
    this.evenements = this.fenetres = this.credibilite = this.pireBaisse = this.periodeRetourAns = this.ratioSPHistorique = 0;
    this.primePure = this.chargementRisque = this.chargementIncertitude = this.frais = this.prime = this.tauxPrime = 0;
    this.fiabilite = 'faible';
  }

  // ======================= Pour le template =======================
  public largeurBarre(): number {
    return Math.min(100, this.probabilite * 3);
  }

  public partie(valeur: number): number {
    return this.prime > 0 ? (valeur / this.prime) * 100 : 0;
  }
}