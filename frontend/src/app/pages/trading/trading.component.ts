import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, debounceTime, interval, of, switchMap } from 'rxjs';
import {  UpperCasePipe } from '@angular/common';
// Composant graphique de SARRA (pour la Crypto)
import { CandleChartComponent as SarraCandleChart } from '../../shared/components/candle-chart/candle-chart.component';
// TON composant graphique (Dashboard) pour les autres marchés
import { CandleChartComponent as DashboardCandleChart } from '../dashboard/components/candle-chart/candle-chart.component';

import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { ApercuRisque, OrdreVue, PortefeuilleVue, PrixVue, SensOrdre, TypeOrdre } from '../../shared/models/crypto.models';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { LIBELLE_STATUT, LIBELLE_TYPE, conditionOrdre, couleurStatut } from '../../shared/utils/ordres';

import { MarketService } from '../../core/services/market.service';
import { CandleData } from '../../core/models/kline.model';
import { SimulatedOrdersService, SimulatedMarket } from '../../core/services/simulated-orders.service';

import { SimulatedPortfolioService } from '../../core/services/simulated-portfolio.service';
interface CryptoChoix { code: string; nom: string; }

@Component({
  selector: 'app-trading',
  imports: [
    DatePipe, DecimalPipe,UpperCasePipe, FormsModule, RouterLink,
    BadgeComponent, PageBreadcrumbComponent,
    SarraCandleChart,      // Pour la Crypto
    DashboardCandleChart   // Pour les autres marchés
  ],
  templateUrl: './trading.component.html',
  styleUrl: './trading.component.css',
})
export class TradingComponent {
  private readonly api = inject(CryptoApiService);
  public readonly marketService = inject(MarketService);
    private readonly simulatedPortfolio = inject(SimulatedPortfolioService);

  readonly libelleType = LIBELLE_TYPE;
  readonly libelleStatut = LIBELLE_STATUT;
  readonly couleurStatut = couleurStatut;
  readonly conditionOrdre = conditionOrdre;
  private readonly simulatedOrders = inject(SimulatedOrdersService);

  // Listes d'actifs
  readonly cryptosList: CryptoChoix[] = [
    { code: 'BTCUSDT', nom: 'Bitcoin' }, { code: 'ETHUSDT', nom: 'Ethereum' },
    { code: 'SOLUSDT', nom: 'Solana' }, { code: 'BNBUSDT', nom: 'BNB' },
    { code: 'XRPUSDT', nom: 'XRP' }, { code: 'ADAUSDT', nom: 'Cardano' },
  ];
  readonly stocksList: CryptoChoix[] = [
    { code: 'AAPL', nom: 'Apple' }, { code: 'MSFT', nom: 'Microsoft' },
    { code: 'TSLA', nom: 'Tesla' }, { code: 'AMZN', nom: 'Amazon' },
    { code: 'GOOGL', nom: 'Google' }, { code: 'NVDA', nom: 'Nvidia' },
    { code: 'META', nom: 'Meta' }, { code: 'NFLX', nom: 'Netflix' }
  ];
  readonly forexList: CryptoChoix[] = [
    { code: 'EUR/USD', nom: 'Euro / Dollar' }, { code: 'USD/JPY', nom: 'Dollar / Yen' },
    { code: 'GBP/USD', nom: 'Livre / Dollar' }, { code: 'USD/CHF', nom: 'Dollar / Franc Suisse' }
  ];
  readonly commoditiesList: CryptoChoix[] = [
    { code: 'GC=F', nom: 'Or (Gold)' }, { code: 'SI=F', nom: 'Argent (Silver)' },
    { code: 'CL=F', nom: 'Pétrole US (WTI)' }, { code: 'ZW=F', nom: 'Blé (Wheat)' }
  ];

  cryptos: CryptoChoix[] = [];
  symbole = 'BTCUSDT';
  
  // Le formulaire
  sens: SensOrdre = 'ACHAT';
  quantite: number | null = null;
  type: Extract<TypeOrdre, 'MARKET' | 'LIMIT'> = 'MARKET';
  prixLimite: number | null = null;

  // Données Sarra (Crypto)
  readonly prix = signal<PrixVue[]>([]);
  readonly portefeuille = signal<PortefeuilleVue | null>(null);
  readonly ordres = signal<OrdreVue[]>([]);
  
  // Données autres marchés
  readonly prixAutresMarches = signal<number | null>(null);
  
  // === GRAPHIQUE MULTI-MARCHÉS ===
  readonly tradingCandles = signal<CandleData[]>([]);
  readonly tradingInterval = signal<string>('1h');
  readonly klinesLoading = signal(false);
  readonly klinesErreur = signal<string | null>(null);
  readonly intervalles = [
    { code: '5m', nom: '5m' },
    { code: '15m', nom: '15m' },
    { code: '1h', nom: '1h' },
    { code: '1d', nom: '1J' },
  ];
  
  readonly erreurMarche = signal<string | null>(null);
  readonly retour = signal<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  readonly envoiEnCours = signal(false);
  readonly apercu = signal<ApercuRisque | null>(null);
  private readonly demandeApercu = new Subject<void>();

  constructor() {
    // Adapter la liste selon le marché
    this.marketService.activeMarket$.subscribe(market => {
      if (market === 'crypto') this.cryptos = this.cryptosList;
      else if (market === 'stocks') this.cryptos = this.stocksList;
      else if (market === 'forex') this.cryptos = this.forexList;
      else if (market === 'commodities') this.cryptos = this.commoditiesList;

      this.symbole = this.cryptos[0].code;
      this.chargerPrix();
      this.chargerKlines(); // ← NOUVEAU
    });

    this.chargerCompte();

    this.demandeApercu.pipe(
      debounceTime(400),
      switchMap(() => {
        if (this.marketService.activeMarket !== 'crypto') return of(null);
        if (this.quantite === null || this.quantite <= 0) return of(null);
        if (this.type === 'LIMIT' && !(this.prixLimite !== null && this.prixLimite > 0)) return of(null);
        
        return this.api.apercuRisque({
          symbole: this.symbole, sens: this.sens, quantite: this.quantite,
          ...(this.type === 'LIMIT' && this.prixLimite !== null ? { prix: this.prixLimite } : {}),
        }).pipe(catchError(() => of(null))); 
      }),
      takeUntilDestroyed(),
    ).subscribe((a) => this.apercu.set(a));

    // Rafraîchissement toutes les 30s (au lieu de 5s pour ne pas saturer les APIs)
    interval(30_000).pipe(takeUntilDestroyed()).subscribe(() => {
      this.chargerCompte();
      this.chargerPrix();
    });
  }

  /** Change de marché depuis la page Trading */
  changerMarche(market: 'crypto' | 'stocks' | 'forex' | 'commodities'): void {
    this.marketService.setActiveMarket(market);
  }

  /** Change l'intervalle du graphique */
  changerIntervalle(interval: string): void {
    this.tradingInterval.set(interval);
    this.chargerKlines();
  }

  /** Charge les klines pour le graphique multi-marchés */
  chargerKlines(): void {
    // En Crypto, c'est le composant de Sarra qui gère tout seul ses klines
    if (this.marketService.activeMarket === 'crypto') {
      this.tradingCandles.set([]);
      this.klinesErreur.set(null);
      return;
    }

    this.klinesLoading.set(true);
    this.klinesErreur.set(null);
    this.tradingCandles.set([]);

    this.marketService.getKlines(this.symbole, this.tradingInterval()).subscribe({
      next: (candles) => {
        if (candles && candles.length > 0) {
          this.tradingCandles.set(candles);
          this.klinesErreur.set(null);
        } else {
          this.klinesErreur.set('Aucune donnée historique disponible pour ce symbole.');
        }
        this.klinesLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur klines:', err);
        this.klinesErreur.set('Impossible de charger le graphique (API saturée ou quota atteint).');
        this.klinesLoading.set(false);
      }
    });
  }

     chargerPrix(): void {
    if (this.marketService.activeMarket === 'crypto') {
      this.api.getPrix(this.cryptos.map((c) => c.code)).pipe(
        catchError((e) => { this.erreurMarche.set(messageErreur(e)); return EMPTY; })
      ).subscribe(liste => {
        this.prix.set(liste);
        this.erreurMarche.set(null);
      });
    } else {
      // Pour les autres marchés
      this.marketService.getTickers().subscribe({
        next: (tickers) => {
          const found = tickers.find(t => t.symbol === this.symbole);
          if (found && found.price) {
            this.prixAutresMarches.set(found.price);
          } else {
            // 👇 SI LE PRIX N'EST PAS TROUVÉ (Finnhub planté), ON CHERCHE CHEZ YAHOO
            this.chargerPrixSecoursYahoo();
          }
        },
        error: () => this.chargerPrixSecoursYahoo()
      });
    }
  }

  private chargerPrixSecoursYahoo(): void {
    // On utilise le service Yahoo qui est fiable pour les actions et les commodités
    if (this.marketService.activeMarket === 'stocks' || this.marketService.activeMarket === 'commodities') {
      // @ts-ignore (On accède au service Yahoo via le marketService si possible, sinon on injecte)
      this.marketService['yahooService'].getQuotes([this.symbole]).subscribe((quotes: any[]) => {
        if (quotes && quotes.length > 0) {
          this.prixAutresMarches.set(quotes[0].price);
          this.erreurMarche.set(null);
        }
      });
    }
  }

  chargerCompte(): void {
    if (this.marketService.activeMarket === 'crypto') {
      this.api.getPortefeuille().subscribe({
        next: (p) => this.portefeuille.set(p),
        error: (e) => this.erreurMarche.set(messageErreur(e)),
      });
      this.api.getOrdres().subscribe({
        next: (liste) => this.ordres.set(liste.slice(0, 8)),
        error: () => this.ordres.set([]),
      });
    }
  }

  prixSelectionne(): number | null {
    if (this.marketService.activeMarket === 'crypto') {
      return this.prix().find((p) => p.symbole === this.symbole)?.prix ?? null;
    }
    return this.prixAutresMarches();
  }

  montantEstime(): number | null {
    const prix = this.prixSelectionne();
    if (prix === null || this.quantite === null || this.quantite <= 0) return null;
    const prixUtilise = this.type === 'LIMIT' && this.prixLimite !== null && this.prixLimite > 0 ? this.prixLimite : prix;
    return prixUtilise * this.quantite;
  }

  formulaireValide(): boolean {
    if (this.quantite === null || this.quantite <= 0) return false;
    return this.type === 'MARKET' || (this.prixLimite !== null && this.prixLimite > 0);
  }

  majApercu(): void {
    if (this.marketService.activeMarket === 'crypto') {
      this.demandeApercu.next();
    }
  }

  choisir(code: string): void {
    this.symbole = code;
    this.retour.set(null);
    this.chargerPrix();
    this.chargerKlines(); // ← NOUVEAU
    this.majApercu();
  }

  changerType(type: 'MARKET' | 'LIMIT'): void {
    this.type = type;
    this.retour.set(null);
    this.majApercu();
  }

  changerSens(sens: SensOrdre): void {
    this.sens = sens;
    this.retour.set(null);
    this.majApercu();
  }

  utiliserQuantiteMax(): void {
    const max = this.apercu()?.quantiteMax;
    if (max !== null && max !== undefined && max > 0) {
      this.quantite = max;
      this.majApercu();
    }
  }

  couleurApercu(niveau: ApercuRisque['niveau']): string {
    if (niveau === 'REFUSE') return 'border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400';
    if (niveau === 'ATTENTION') return 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-400';
    return 'border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-500';
  }

    passerOrdre(): void {
    if (this.quantite === null || this.quantite <= 0) return;

    this.envoiEnCours.set(true);
    this.retour.set(null);

    if (this.marketService.activeMarket === 'crypto') {
      // ===== LOGIQUE CRYPTO (Backend de Sarra) =====
      this.api.passerOrdre({
        symbole: this.symbole, sens: this.sens, type: this.type, quantite: this.quantite,
        ...(this.type === 'LIMIT' && this.prixLimite !== null ? { prixDeclenchement: this.prixLimite } : {}),
      }).subscribe({
        next: (resultat) => {
          this.retour.set({ type: 'succes', texte: resultat.message });
          this.quantite = null; 
          this.prixLimite = null; 
          this.apercu.set(null);
          this.envoiEnCours.set(false); 
          this.chargerCompte();
        },
        error: (e) => {
          this.retour.set({ type: 'erreur', texte: messageErreur(e) });
          this.envoiEnCours.set(false);
        },
      });
    } else {
      // ===== LOGIQUE AUTRES MARCHÉS (Simulation locale) =====
      const prixActuel = this.prixSelectionne();
      
      // Vérification du prix
      if (prixActuel === null) {
        this.retour.set({ type: 'erreur', texte: 'Prix indisponible, réessayez dans un instant.' });
        this.envoiEnCours.set(false);
        return;
      }

      const prixExec = this.type === 'LIMIT' && this.prixLimite !== null && this.prixLimite > 0
        ? this.prixLimite
        : prixActuel;
      const montant = prixExec * this.quantite;

      const market = this.marketService.activeMarket as SimulatedMarket;
      const order: import('../../core/services/simulated-orders.service').SimulatedOrder = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
        market,
        symbole: this.symbole,
        sens: this.sens,
        type: this.type,
        quantite: this.quantite,
        prixExecution: prixExec,
        montantTotal: montant,
        statut: 'EXECUTE',
      };

      // 👇 ON VÉRIFIE LE SOLDE VIRTUEL ICI
      const succes = this.simulatedPortfolio.enregistrerOrdre(order);

      if (succes) {
        // Si l'ordre est validé, on l'ajoute à l'historique
        this.simulatedOrders.addOrder(order);
        
        this.retour.set({
          type: 'succes',
          texte: `Ordre ${this.sens} exécuté : ${this.quantite} ${this.symbole} à ${prixExec.toLocaleString('fr-FR')} $ (Solde restant : ${this.simulatedPortfolio.soldeDisponible.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $).`,
        });
        this.quantite = null;
        this.prixLimite = null;
      } else {
        // Si pas assez d'argent
        this.retour.set({
          type: 'erreur',
          texte: this.sens === 'ACHAT' 
            ? 'Fonds virtuels insuffisants pour cet achat (Solde : ' + this.simulatedPortfolio.soldeDisponible.toLocaleString('fr-FR') + ' $).' 
            : 'Vous ne possédez pas assez de cet actif pour le vendre.',
        });
      }
      
      this.envoiEnCours.set(false);
    }
  }

    readonly afficherRisque = signal(false);

  basculerRisque(): void {
    this.afficherRisque.set(!this.afficherRisque());
  }
  
}