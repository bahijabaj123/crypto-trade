import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { BinanceService } from '../../core/services/binance.service';
import { TickerData } from '../../core/models/ticker.model';
import { CandleData } from '../../core/models/kline.model';
import { TradeData } from '../../core/models/trade.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {

  // Données
  tickers: TickerData[] = [];
  candles: CandleData[] = [];
  recentTrades: TradeData[] = [];
  selectedSymbol = 'BTCUSDT';

  // Abonnements WebSocket
  private tickerSub?: Subscription;
  private tickersMultiSub?: Subscription;   // ← AJOUTER
  private klineSub?: Subscription;
  private tradeSub?: Subscription;

  constructor(private binanceService: BinanceService) {}

  ngOnInit(): void {
    this.loadInitialData();
    this.startWebSocketStreams();
  }

  ngOnDestroy(): void {
    this.tickerSub?.unsubscribe();
    this.klineSub?.unsubscribe();
    this.tradeSub?.unsubscribe();
  }

  /**
   * Charge les données initiales via REST
   */
  private loadInitialData(): void {
    // Charger les tickers pour toutes les paires populaires
    const symbols = this.binanceService.getPopularSymbols();
    this.binanceService.getMultipleTickers(symbols).subscribe({
      next: (data) => this.tickers = data,
      error: (err) => console.error('Erreur chargement tickers:', err)
    });

    // Charger l'historique des chandeliers pour le symbole sélectionné
    this.binanceService.getKlines(this.selectedSymbol, '1h', 200).subscribe({
      next: (data) => this.candles = data,
      error: (err) => console.error('Erreur chargement klines:', err)
    });
  }

  /**
   * Démarre les connexions WebSocket temps réel
   */
  private startWebSocketStreams(): void {
    // Stream des tickers (prix en temps réel)
    this.tickerSub = this.binanceService.getTickerStream(this.selectedSymbol).subscribe({
      next: (msg: any) => {
        const ticker: TickerData = {
          symbol: msg.s,
          price: parseFloat(msg.c),
          change: parseFloat(msg.p),
          changePercent: parseFloat(msg.P),
          high: parseFloat(msg.h),
          low: parseFloat(msg.l),
          volume: parseFloat(msg.v)
        };

        // Mettre à jour le ticker correspondant
        const index = this.tickers.findIndex(t => t.symbol === ticker.symbol);
        if (index !== -1) {
          this.tickers[index] = ticker;
        }
      },
      error: (err) => console.error('Erreur WebSocket ticker:', err)
    });

    // Stream des chandeliers (mise à jour du graphique)
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

        // Mettre à jour ou ajouter le chandelier
        const lastCandle = this.candles[this.candles.length - 1];
        if (lastCandle && lastCandle.time === candle.time) {
          this.candles[this.candles.length - 1] = candle;
        } else {
          this.candles.push(candle);
          if (this.candles.length > 500) this.candles.shift();
        }
      },
      error: (err) => console.error('Erreur WebSocket kline:', err)
    });

    // Stream des transactions récentes
    this.tradeSub = this.binanceService.getTradeStream(this.selectedSymbol).subscribe({
      next: (msg: any) => {
        const trade: TradeData = {
          id: msg.t,
          price: parseFloat(msg.p),
          quantity: parseFloat(msg.q),
          time: msg.T,
          isBuyer: !msg.m  // isBuyerMaker = false signifie que l'acheteur est le taker
        };

        this.recentTrades.unshift(trade);
        if (this.recentTrades.length > 20) this.recentTrades.pop();
      },
      error: (err) => console.error('Erreur WebSocket trade:', err)
    });
  }

  /**
   * Change le symbole sélectionné et recharge les données
   */
  selectSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
    this.recentTrades = [];

    // Recharger l'historique
    this.binanceService.getKlines(symbol, '1h', 200).subscribe({
      next: (data) => this.candles = data
    });

    // Reconnecter les WebSocket pour le nouveau symbole
    this.klineSub?.unsubscribe();
    this.tradeSub?.unsubscribe();

    this.klineSub = this.binanceService.getKlineStream(symbol, '1m').subscribe({
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
      }
    });

    this.tradeSub = this.binanceService.getTradeStream(symbol).subscribe({
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
      }
    });
  }

  /**
   * Formate un prix pour l'affichage
   */
  formatPrice(price: number): string {
    return this.binanceService.formatPrice(price);
  }
}