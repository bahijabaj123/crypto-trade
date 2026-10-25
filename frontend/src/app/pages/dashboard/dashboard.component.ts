import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { BinanceService } from '../../core/services/binance.service';
import { MarketService, MarketType } from '../../core/services/market.service';
import { TickerData } from '../../core/models/ticker.model';
import { CandleData } from '../../core/models/kline.model';
import { TradeData } from '../../core/models/trade.model';
import { CandleChartComponent } from './components/candle-chart/candle-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule,  CandleChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {

  // MARCHÉ ACTIF
  activeMarket: MarketType = 'crypto';

  // DONNÉES
  tickers: TickerData[] = [];
  candles: CandleData[] = [];
  recentTrades: TradeData[] = [];
  selectedSymbol = 'BTCUSDT';
  selectedInterval = '1h';

  // SPARKLINES & ALERTES & POULS
  watchlistSparklines: { [symbol: string]: number[] } = {};
  alerts: { id: number; message: string; type: 'info' | 'warning' | 'success' | 'danger'; timestamp: number }[] = [];
  alertThresholds: { [symbol: string]: { price?: number; changePercent?: number } } = {};
  private alertIdCounter = 0;
  marketPulse = 50;
  marketPulseBreakdown = { volatility: 0, volume: 0, breadth: 0, momentum: 0 };
  private lastPulseUpdate = 0;
  private refreshInterval?: any;

  // SUBSCRIPTIONS
  private tickerSub?: Subscription;
  private klineSub?: Subscription;
  private tradeSub?: Subscription;
  private tickersMultiSub?: Subscription;

  constructor(
    private binanceService: BinanceService,
    private marketService: MarketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.changeMarket('crypto');
  }

  ngOnDestroy(): void {
  this.tickerSub?.unsubscribe();
  this.klineSub?.unsubscribe();
  this.tradeSub?.unsubscribe();
  this.tickersMultiSub?.unsubscribe();
  if (this.refreshInterval) clearInterval(this.refreshInterval);
}

  // ============================================================
  // CHANGEMENT DE MARCHÉ
  // ============================================================
     changeMarket(market: MarketType): void {
    this.activeMarket = market;
    this.marketService.setActiveMarket(market);

    // 1. Couper les WebSockets Binance
    this.tickerSub?.unsubscribe();
    this.klineSub?.unsubscribe();
    this.tradeSub?.unsubscribe();
    this.tickersMultiSub?.unsubscribe();
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    // 2. 🔥 VIDER L'ECRAN IMMEDIATEMENT
    this.tickers = [];
    this.candles = [];
    this.recentTrades = [];
    this.cdr.detectChanges();

    // 3. Changer le symbole par défaut
    switch (market) {
      case 'crypto': this.selectedSymbol = 'BTCUSDT'; break;
      case 'stocks': this.selectedSymbol = 'AAPL'; break;
      case 'forex': this.selectedSymbol = 'EUR/USD'; break;
      case 'commodities': this.selectedSymbol = 'GC=F'; break;
    }

    // 4. Charger les cartes
    this.loadTickers();

    // 5. Charger le graphique (retardé)
    setTimeout(() => {
      this.loadKlines();
    }, 2000);

    // 6. WebSocket pour Crypto
    if (market === 'crypto') {
      this.startWebSocketStreams();
    }
  }
  // ============================================================
  // CHARGEMENT DES DONNÉES
  // ============================================================
  private loadTickers(): void {
    this.marketService.getTickers().subscribe({
      next: (data) => {
        this.tickers = data;
        this.cdr.detectChanges();
        this.calculateMarketPulse();
      },
      error: (err) => console.error('Erreur tickers:', err)
    });
  }

  private loadKlines(): void {
    this.marketService.getKlines(this.selectedSymbol, this.selectedInterval).subscribe({
      next: (data) => {
        this.candles = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erreur klines:', err)
    });
  }

  // ============================================================
  // WEBSOCKETS (CRYPTO UNIQUEMENT)
  // ============================================================
  private startWebSocketStreams(): void {
    const symbols = this.binanceService.getPopularSymbols();
    
    // 1. Tickers temps réel
    this.tickersMultiSub = this.binanceService.getMultipleTickersStream(symbols).subscribe({
      next: (msg: any) => {
        const data = msg.data;
        if (!data) return;

        const ticker: TickerData = {
          symbol: data.s,
          price: parseFloat(data.c),
          change: parseFloat(data.p),
          changePercent: parseFloat(data.P),
          high: parseFloat(data.h),
          low: parseFloat(data.l),
          volume: parseFloat(data.v)
        };

        const index = this.tickers.findIndex(t => t.symbol === ticker.symbol);
        if (index !== -1) {
          this.tickers[index] = ticker;
          this.cdr.detectChanges();

          const now = Date.now();
          if (now - this.lastPulseUpdate > 2000) {
            this.lastPulseUpdate = now;
            this.calculateMarketPulse();
          }
        }
      }
    });

    // 2. Kline temps réel
    this.klineSub = this.binanceService.getKlineStream(this.selectedSymbol, '1m').subscribe({
      next: (msg: any) => {
        const k = msg.k;
        const candle: CandleData = {
          time: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v)
        };

        const lastCandle = this.candles[this.candles.length - 1];
        if (lastCandle && lastCandle.time === candle.time) {
          this.candles[this.candles.length - 1] = candle;
        } else {
          this.candles.push(candle);
          if (this.candles.length > 500) this.candles.shift();
        }
        this.cdr.detectChanges();
      }
    });

    // 3. Trades temps réel
    this.tradeSub = this.binanceService.getTradeStream(this.selectedSymbol).subscribe({
      next: (msg: any) => {
        const trade: TradeData = {
          id: msg.t,
          price: parseFloat(msg.p),
          quantity: parseFloat(msg.q),
          time: msg.T,
          isBuyer: !msg.m
        };
        this.recentTrades.unshift(trade);
        if (this.recentTrades.length > 20) this.recentTrades.pop();
        this.cdr.detectChanges();
      }
    });
  }

  // ============================================================
  // CHANGEMENT DE SYMBOLE
  // ============================================================
  selectSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
    this.recentTrades = [];

    this.loadKlines();

    if (this.activeMarket === 'crypto') {
      this.klineSub?.unsubscribe();
      this.tradeSub?.unsubscribe();

      this.klineSub = this.binanceService.getKlineStream(symbol, '1m').subscribe({
        next: (msg: any) => {
          const k = msg.k;
          const candle: CandleData = {
            time: k.t, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v)
          };
          const lastCandle = this.candles[this.candles.length - 1];
          if (lastCandle && lastCandle.time === candle.time) {
            this.candles[this.candles.length - 1] = candle;
          } else {
            this.candles.push(candle);
            if (this.candles.length > 500) this.candles.shift();
          }
          this.cdr.detectChanges();
        }
      });

      this.tradeSub = this.binanceService.getTradeStream(symbol).subscribe({
        next: (msg: any) => {
          const trade: TradeData = {
            id: msg.t, price: parseFloat(msg.p), quantity: parseFloat(msg.q), time: msg.T, isBuyer: !msg.m
          };
          this.recentTrades.unshift(trade);
          if (this.recentTrades.length > 20) this.recentTrades.pop();
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ============================================================
  // CHANGEMENT D'INTERVALLE
  // ============================================================
  changeInterval(interval: string): void {
    this.selectedInterval = interval;
    this.loadKlines();
  }

  // ============================================================
  // SPARKLINES & ALERTES & POULS
  // ============================================================
  loadSparklines(): void {
    const symbols = this.binanceService.getPopularSymbols();
    symbols.forEach(symbol => {
      this.binanceService.getKlines(symbol, '1h', 24).subscribe({
        next: (klines) => {
          this.watchlistSparklines[symbol] = klines.map(k => k.close);
          this.cdr.detectChanges();
        }
      });
    });
  }

  getSparklinePath(symbol: string): string {
    const data = this.watchlistSparklines[symbol];
    if (!data || data.length < 2) return '';
    const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
    const width = 100; const height = 30; const step = width / (data.length - 1);
    return data.map((value, i) => {
      const x = i * step; const y = height - ((value - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  getSparklineColor(symbol: string): string {
    const ticker = this.tickers.find(t => t.symbol === symbol);
    return ticker && ticker.changePercent >= 0 ? '#0ECB81' : '#F6465D';
  }

  addAlert(message: string, type: 'info' | 'warning' | 'success' | 'danger'): void {
    this.alerts.unshift({ id: this.alertIdCounter++, message, type, timestamp: Date.now() });
    if (this.alerts.length > 10) this.alerts.pop();
    setTimeout(() => {
      this.alerts = this.alerts.filter(a => Date.now() - a.timestamp < 10000);
      this.cdr.detectChanges();
    }, 10000);
    this.cdr.detectChanges();
  }

  calculateMarketPulse(): void {
  if (this.tickers.length === 0) return;

  // 1. Volatilité : Si les mouvements sont violents, la volatilité est basse (inversée pour le score)
  const avgChange = this.tickers.reduce((s, t) => s + Math.abs(t.changePercent), 0) / this.tickers.length;
  const volatilityScore = Math.max(0, 100 - avgChange * 10);

  // 2. Largeur (Breadth) : On donne un score de 50 si tout est neutre, 
  // plus haut si ça monte, plus bas si ça baisse.
  const upTickers = this.tickers.filter(t => t.changePercent > 0).length;
  const downTickers = this.tickers.filter(t => t.changePercent < 0).length;
  let breadthScore = 50; 
  if (upTickers > 0 || downTickers > 0) {
    breadthScore = (upTickers / (upTickers + downTickers)) * 100;
  }

  // 3. Momentum : Variation moyenne des actifs (pondérée)
  const avgVariation = this.tickers.reduce((s, t) => s + t.changePercent, 0) / this.tickers.length;
  const momentumScore = Math.max(0, Math.min(100, 50 + avgVariation * 10));

  // 4. Volume (Simulé pour l'instant)
  const volumeScore = 50;

  // Calcul Final
  this.marketPulse = Math.round(
    volatilityScore * 0.3 +
    breadthScore * 0.3 +
    momentumScore * 0.3 +
    volumeScore * 0.1
  );

  this.marketPulseBreakdown = {
    volatility: Math.round(volatilityScore),
    volume: Math.round(volumeScore),
    breadth: Math.round(breadthScore),
    momentum: Math.round(momentumScore)
  };

  this.cdr.detectChanges();
}

  getPulseLabel(): string {
    if (this.marketPulse >= 75) return 'Euphorie';
    if (this.marketPulse >= 55) return 'Optimisme';
    if (this.marketPulse >= 45) return 'Neutre';
    if (this.marketPulse >= 25) return 'Prudence';
    return 'Peur';
  }

  getPulseColor(): string {
    if (this.marketPulse >= 55) return 'text-crypto-green';
    if (this.marketPulse >= 45) return 'text-crypto-yellow';
    if (this.marketPulse >= 25) return 'text-orange-500';
    return 'text-crypto-red';
  }

  getHeatmapColor(changePercent: number): string {
    if (changePercent >= 5) return '#0ECB81';
    if (changePercent >= 2) return '#1A8F5A';
    if (changePercent >= 0) return '#0A5F3D';
    if (changePercent >= -2) return '#8B1F35';
    if (changePercent >= -5) return '#C93A4E';
    return '#F6465D';
  }

  getHeatmapSpan(ticker: TickerData): number {
    if (ticker.symbol === 'BTCUSDT' || ticker.symbol === 'ETHUSDT' || ticker.symbol === 'AAPL' || ticker.symbol === 'GC=F') return 2;
    return 1;
  }

  getHeatmapOpacity(volume: number): number {
    if (this.tickers.length === 0) return 1;
    const maxVolume = Math.max(...this.tickers.map(t => t.volume));
    if (maxVolume === 0) return 1; // Eviter la division par 0
    return 0.6 + (volume / maxVolume) * 0.4;
  }

   getCurrentAssetName(): string {
  // Pour le forex et les commodities, on affiche le nom traduit
  if (this.activeMarket === 'commodities') {
    const names: { [key: string]: string } = {
      'GC=F': 'Or (Gold)', 'SI=F': 'Argent (Silver)', 'CL=F': 'Pétrole US (WTI)',
      'BZ=F': 'Pétrole Brent', 'NG=F': 'Gaz Naturel', 'HG=F': 'Cuivre (Copper)', 'ZW=F': 'Blé (Wheat)'
    };
    return names[this.selectedSymbol] || this.selectedSymbol;
  }
  
  if (this.activeMarket === 'forex') {
    // Optionnel : tu peux aussi traduire les paires Forex ici si tu veux
    return this.selectedSymbol;
  }

  return this.selectedSymbol;
}

  // ============================================================
  // XAI : "POURQUOI ÇA BOUGE ?" (Décomposition de la variation)
  // ============================================================
  
  getXaiExplanation(): { marketImpact: number, specificImpact: number, text: string, isPositive: boolean } {
    const currentTicker = this.tickers.find(t => t.symbol === this.selectedSymbol);
    if (!currentTicker) return { marketImpact: 0, specificImpact: 0, text: '', isPositive: true };

    // 1. Calcul de la tendance générale du marché (Moyenne des variations)
    const avgMarketChange = this.tickers.reduce((sum, t) => sum + t.changePercent, 0) / this.tickers.length;
    
    // 2. Variation de l'actif
    const assetChange = currentTicker.changePercent;
    
    // 3. Décomposition (Modèle simplifié)
    // Si l'actif monte de 5% et le marché de 3%, l'impact marché est de 3% et l'impact spécifique de 2%.
    let marketImpact = avgMarketChange;
    let specificImpact = assetChange - avgMarketChange;

    // Sécurité pour éviter les aberrations (si l'impact spécifique est plus grand que la variation totale)
    if (Math.abs(specificImpact) > Math.abs(assetChange) && Math.sign(assetChange) !== Math.sign(specificImpact)) {
      marketImpact = assetChange;
      specificImpact = 0;
    }

    // 4. Calcul des pourcentages pour l'affichage
    const totalAbs = Math.abs(marketImpact) + Math.abs(specificImpact) || 1;
    const marketPercent = Math.round((Math.abs(marketImpact) / totalAbs) * 100);
    const specificPercent = 100 - marketPercent;

    // 5. Texte explicatif généré
    const actionText = assetChange >= 0 ? 'augmenté' : 'baissé';
    const marketText = marketPercent >= specificPercent 
      ? `la tendance générale du marché (${avgMarketChange > 0 ? 'haussier' : 'baissier'})` 
      : `un mouvement propre à cet actif (volume anormal ou actualité)`;

    const text = `${this.getCurrentAssetName()} a ${actionText} de ${Math.abs(assetChange).toFixed(2)}%. 
                  ${marketPercent}% de ce mouvement est expliqué par ${marketText}.`;

    return {
      marketImpact: marketPercent,
      specificImpact: specificPercent,
      text: text,
      isPositive: assetChange >= 0
    };
  }
  

  formatPrice(price: number): string {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

 
}