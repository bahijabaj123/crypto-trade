import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { map, catchError, mergeMap, delay, concatMap } from 'rxjs/operators';
import { TickerData } from '../models/ticker.model';
import { CandleData } from '../models/kline.model';

@Injectable({
  providedIn: 'root'
})
export class TwelveDataService {

  private readonly API_BASE = 'https://api.twelvedata.com';
  
  // ⚠️ TA CLÉ API TWELVE DATA ICI
  private readonly API_KEY = 'eea6febd8a464b5d83aaba59b47ab70b'; 

  // Délai en millisecondes pour éviter le Rate Limit (8 req/min)
  private readonly DELAY_MS = 15000; // 15 secondes entre chaque requête

  constructor(private http: HttpClient) {}

  /**
   * Récupère les tickers 1 par 1 avec un délai pour éviter l'erreur 429
   */
    getQuotes(symbols: string[]): Observable<TickerData[]> {
    // On demande TOUS les symboles en 1 seule requête (séparés par des virgules)
    const symbolsStr = symbols.join(',');
    const url = `${this.API_BASE}/quote?symbol=${symbolsStr}&apikey=${this.API_KEY}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        if (!response) return [];
        
        // Si 1 seul symbole, l'API renvoie un objet. Si plusieurs, un dictionnaire.
        const data = symbols.length === 1 ? { [symbols[0]]: response } : response;
        const results: TickerData[] = [];

        for (const key in data) {
          if (data[key] && data[key].close) {
            results.push({
              symbol: key,
              price: parseFloat(data[key].close),
              change: parseFloat(data[key].change),
              changePercent: parseFloat(data[key].percent_change),
              high: parseFloat(data[key].high),
              low: parseFloat(data[key].low),
              volume: parseFloat(data[key].volume) || 0
            });
          }
        }
        return results;
      }),
      catchError(err => {
        console.error('Erreur Twelve Data quotes:', err);
        return of([]);
      })
    );
  }

  /**
   * Récupère l'historique (1 seule requête, pas de boucle)
   */
  getTimeSeries(symbol: string, interval: string = '1h'): Observable<CandleData[]> {
    const tdInterval = this.mapInterval(interval);
    const url = `${this.API_BASE}/time_series?symbol=${symbol}&interval=${tdInterval}&outputsize=200&apikey=${this.API_KEY}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        if (!response.values || !Array.isArray(response.values)) {
          return [];
        }

        return response.values.reverse().map((candle: any) => ({
          time: new Date(candle.datetime).getTime(),
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
          volume: parseFloat(candle.volume) || 0
        }));
      }),
      catchError(err => {
        console.error(`Erreur Twelve Data history ${symbol}:`, err);
        return of([]);
      })
    );
  }

  private mapInterval(interval: string): string {
    const map: { [key: string]: string } = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '1h': '1h',
      '4h': '4h',
      '1d': '1day',
      '1w': '1week'
    };
    return map[interval] || '1h';
  }

   // 1. Pour le Dashboard (8 majeures pour éviter les limites de l'API)
  getDashboardForex(): string[] {
    return ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP'];
  }

  // 2. Pour la page Marché (toutes les paires majeures)
  getMarketForex(): string[] {
    return [
      'EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 
      'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CHF/JPY', 'CAD/JPY', 'NZD/JPY',
      'EUR/AUD', 'EUR/CAD', 'EUR/CHF', 'GBP/AUD', 'GBP/CAD', 'GBP/CHF'
    ];
  }

  // Liste réduite pour les commodities (4 cartes)
    getCommoditiesSymbols(): string[] {
    // Les codes corrects pour Twelve Data
    return [
      'XAU/USD',   // Or (Gold)
      'XAG/USD',   // Argent (Silver) - Peut être indisponible sur le plan gratuit
      'WTI',       // Pétrole brut US (West Texas Intermediate)
      'BRENT',     // Pétrole Brent
      'NG',        // Gaz Naturel (Natural Gas)
      'HG'         // Cuivre (Copper)
    ];
  }

}