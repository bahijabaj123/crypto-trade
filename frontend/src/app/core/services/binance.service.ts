import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

import { BinanceKline, CandleData } from '../models/kline.model';
import { BinanceTicker24hr, TickerData } from '../models/ticker.model';
import { BinanceTrade, TradeData } from '../models/trade.model';

@Injectable({
  providedIn: 'root'
})
export class BinanceService {

  // URLs publiques Binance (pas d'authentification requise) [citation:1][citation:6]
  private readonly REST_BASE  = '/binance-api'; 
  private readonly WS_BASE = 'wss://stream.binance.com:9443/ws';

  constructor(private http: HttpClient) {}

  // ============================================
  // REST API - Données Historiques
  // ============================================

  /**
   * Récupère les chandeliers (klines) historiques pour un symbole
   * @param symbol Paire de trading (ex: BTCUSDT)
   * @param interval Intervalle (1m, 5m, 1h, 1d, etc.)
   * @param limit Nombre de chandeliers (max 1000)
   */
  getKlines(symbol: string, interval: string = '1h', limit: number = 500): Observable<CandleData[]> {
    const url = `${this.REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    return this.http.get<any[]>(url).pipe(
      map((data: any[]) => data.map(kline => ({
        time: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      })))
    );
  }

  /**
   * Récupère les statistiques 24h pour un symbole
   * @param symbol Paire de trading (ex: BTCUSDT)
   */
  get24hrTicker(symbol: string): Observable<TickerData> {
    const url = `${this.REST_BASE}/api/v3/ticker/24hr?symbol=${symbol}`;

    return this.http.get<BinanceTicker24hr>(url).pipe(
      map(data => ({
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        change: parseFloat(data.priceChange),
        changePercent: parseFloat(data.priceChangePercent),
        high: parseFloat(data.highPrice),
        low: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume)
      }))
    );
  }

  /**
   * Récupère les statistiques 24h pour plusieurs symboles en un seul appel
   * @param symbols Liste de paires (ex: ['BTCUSDT', 'ETHUSDT'])
   */
  getMultipleTickers(symbols: string[]): Observable<TickerData[]> {
    const symbolsParam = JSON.stringify(symbols);
    const url = `${this.REST_BASE}/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;

    return this.http.get<any[]>(url).pipe(
      map(data => data.map(ticker => ({
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        change: parseFloat(ticker.priceChange),
        changePercent: parseFloat(ticker.priceChangePercent),
        high: parseFloat(ticker.highPrice),
        low: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume)
      })))
    );
  }

  

  // ============================================
  // WEBSOCKET - Données Temps Réel
  // ============================================

  /**
   * Connexion WebSocket pour les mises à jour de chandeliers (kline)
   * Stream: <symbol>@kline_<interval> [citation:2]
   */
  getKlineStream(symbol: string, interval: string = '1m'): WebSocketSubject<any> {
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    return webSocket(`${this.WS_BASE}/${streamName}`);
  }

  /**
   * Connexion WebSocket pour les statistiques ticker en temps réel
   * Stream: <symbol>@ticker [citation:14]
   */
  getTickerStream(symbol: string): WebSocketSubject<any> {
    const streamName = `${symbol.toLowerCase()}@ticker`;
    return webSocket(`${this.WS_BASE}/${streamName}`);
  }

  /**
 * Stream GLOBAL de tous les tickers (mise à jour toutes les 1 seconde)
 * Endpoint spécial Binance : !ticker@arr
 * Renvoie un tableau de tous les tickers en un seul message
 */
getAllTickersStream(): WebSocketSubject<any> {
  return webSocket(`wss://stream.binance.com:9443/ws/!ticker@arr`);
}

  /**
   * Connexion WebSocket pour les transactions individuelles
   * Stream: <symbol>@trade [citation:2]
   */
  getTradeStream(symbol: string): WebSocketSubject<any> {
    const streamName = `${symbol.toLowerCase()}@trade`;
    return webSocket(`${this.WS_BASE}/${streamName}`);
  }

  /**
   * Connexion WebSocket pour plusieurs streams combinés
   * Utile pour écouter ticker + kline + trade en même temps
   * Combined streams: /stream?streams=<stream1>/<stream2> [citation:6]
   */
  getCombinedStream(streams: string[]): WebSocketSubject<any> {
    const combined = streams.join('/');
    return webSocket(`wss://stream.binance.com:9443/stream?streams=${combined}`);
  }

  // ============================================
  // MÉTHODES UTILITAIRES
  // ============================================

  /**
   * Formate un prix selon sa valeur (décimales adaptées)
   */
  formatPrice(price: number): string {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Liste des paires crypto populaires pour le Dashboard
   */
  getPopularSymbols(): string[] {
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];
  }
  /**
 * Stream combiné pour plusieurs tickers en temps réel
 * Exemple : /stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker
 */
getMultipleTickersStream(symbols: string[]): WebSocketSubject<any> {
  const streams = symbols
    .map(s => `${s.toLowerCase()}@ticker`)
    .join('/');
  return webSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
}

/**
 * Récupère la liste de TOUTES les paires de trading disponibles sur Binance
 * Endpoint : GET /api/v3/exchangeInfo
 */
getAllSymbols(): Observable<any[]> {
  const url = `${this.REST_BASE}/api/v3/exchangeInfo`;
  return this.http.get<any>(url).pipe(
    map(response => response.symbols.filter((s: any) => s.status === 'TRADING'))
  );
}

/**
 * Récupère les tickers 24h pour une liste personnalisée de symboles
 */
getTickersForSymbols(symbols: string[]): Observable<TickerData[]> {
  const symbolsParam = JSON.stringify(symbols);
  const url = `${this.REST_BASE}/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;

  return this.http.get<any[]>(url).pipe(
    map(data => data.map(ticker => ({
      symbol: ticker.symbol,
      price: parseFloat(ticker.lastPrice),
      change: parseFloat(ticker.priceChange),
      changePercent: parseFloat(ticker.priceChangePercent),
      high: parseFloat(ticker.highPrice),
      low: parseFloat(ticker.lowPrice),
      volume: parseFloat(ticker.quoteVolume)  // Volume en USDT
    })))
  );
}

/**
 * Calcule le régime d'un actif à partir de ses klines récents
 * @param klines Données historiques (1h)
 * @returns 'trend' | 'range' | 'volatile'
 */
detectRegime(klines: CandleData[]): 'trend' | 'range' | 'volatile' {
  if (klines.length < 20) return 'range';

  // 1. Calcul de la MA 20
  const last20 = klines.slice(-20);
  const ma20 = last20.reduce((sum, k) => sum + k.close, 0) / 20;
  const currentPrice = klines[klines.length - 1].close;

  // 2. Distance à la MA 20 (en %)
  const distanceToMA = Math.abs((currentPrice - ma20) / ma20) * 100;

  // 3. Volatilité (écart-type des rendements)
  const returns: number[] = [];
  for (let i = 1; i < last20.length; i++) {
    returns.push((last20[i].close - last20[i - 1].close) / last20[i - 1].close);
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * 100;   // En %

  // 4. Détection
  if (volatility > 5) return 'volatile';
  if (distanceToMA > 2) return 'trend';
  return 'range';
}

/**
 * Retourne l'état de santé d'une connexion WebSocket
 */
getConnectionHealth(lastUpdateMs: number): 'excellent' | 'good' | 'poor' | 'offline' {
  const elapsed = Date.now() - lastUpdateMs;

  if (elapsed < 3000) return 'excellent';   // < 3 sec
  if (elapsed < 10000) return 'good';       // < 10 sec
  if (elapsed < 60000) return 'poor';       // < 1 min
  return 'offline';                          // > 1 min
}

  // Ajoute cette méthode à la fin du fichier
  getMarketSymbols(): string[] {
    return [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
      'DOTUSDT', 'MATICUSDT', 'LTCUSDT', 'SHIBUSDT', 'TRXUSDT', 'UNIUSDT', 'ATOMUSDT', 'LINKUSDT',
      'XLMUSDT', 'BCHUSDT', 'ETCUSDT', 'FILUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'NEARUSDT'
    ];
  }
  
}