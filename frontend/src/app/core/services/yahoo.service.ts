import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { TickerData } from '../models/ticker.model';
import { CandleData } from '../models/kline.model';

@Injectable({
  providedIn: 'root'
})
export class YahooService {

  private readonly API_BASE = '/yahoo-api';

  constructor(private http: HttpClient) {}

  /**
   * Récupère les prix en contournant le blocage 401 de Yahoo.
   */
  getQuotes(symbols: string[]): Observable<TickerData[]> {
    const requests = symbols.map(symbol => 
      this.getHistory(symbol, '1d').pipe(
        map(candles => {
          if (!candles || candles.length < 2) return null;
          
          const lastCandle = candles[candles.length - 1];
          const previousCandle = candles[candles.length - 2];
          
          const change = lastCandle.close - previousCandle.close;
          const changePercent = (change / previousCandle.close) * 100;

          return {
            symbol: symbol,
            name: this.getCommodityName(symbol), // Ajout du nom lisible
            price: lastCandle.close,
            change: change,
            changePercent: changePercent,
            high: lastCandle.high,
            low: lastCandle.low,
            volume: lastCandle.volume || 0
          } as TickerData;
        })
      )
    );

    return forkJoin(requests).pipe(
      map(results => results.filter(r => r !== null) as TickerData[]),
      catchError(err => {
        console.error('Erreur Yahoo quotes:', err);
        return of([]);
      })
    );
  }

  /**
   * Récupère l'historique (pour le graphique)
  
  getHistory(symbol: string, interval: string = '1h'): Observable<CandleData[]> {
    let yInterval = '1h';
    if (interval === '1d') yInterval = '1d';
    if (interval === '1w') yInterval = '1wk';

    const url = `${this.API_BASE}/v8/finance/chart/${symbol}?interval=${yInterval}&range=1mo`;

    return this.http.get<any>(url).pipe(
      map(response => {
        const result = response.chart?.result?.[0];
        if (!result || !result.timestamp) return [];

        const timestamps = result.timestamp;
        const quote = result.indicators.quote[0];

        return timestamps.map((t: number, i: number) => ({
          time: t * 1000,
          open: quote.open[i] || 0,
          high: quote.high[i] || 0,
          low: quote.low[i] || 0,
          close: quote.close[i] || 0,
          volume: quote.volume[i] || 0
        })).filter((c: any) => c.open !== 0);
      }),
      catchError(err => {
        console.error(`Erreur Yahoo history ${symbol}:`, err);
        return of([]);
      })
    );
  }*/

      /**
   * Récupère l'historique (pour le graphique) — compatible Actions + Commodities
   */
  getHistory(symbol: string, interval: string = '1h'): Observable<CandleData[]> {
    // Yahoo Finance accepte : 1m, 5m, 15m, 30m, 1h, 1d, 1wk
    // Mais impose un range max selon l'intervalle :
    //   1m  → range max 7d
    //   5m/15m → range max 60d
    //   1h  → range max 730d
    //   1d  → range illimité
    const config: { [key: string]: { yInterval: string; range: string } } = {
      '5m':  { yInterval: '5m',  range: '5d'  },
      '15m': { yInterval: '15m', range: '1mo' },
      '1h':  { yInterval: '1h',  range: '1mo' },
      '4h':  { yInterval: '1h',  range: '3mo' }, // Yahoo n'a pas 4h → on agrège 1h
      '1d':  { yInterval: '1d',  range: '6mo' },
      '1w':  { yInterval: '1wk', range: '2y'  },
    };

    const cfg = config[interval] || config['1h'];
    const url = `${this.API_BASE}/v8/finance/chart/${symbol}?interval=${cfg.yInterval}&range=${cfg.range}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        const result = response.chart?.result?.[0];
        if (!result || !result.timestamp) return [];

        const timestamps = result.timestamp;
        const quote = result.indicators.quote[0];

        let candles = timestamps
          .map((t: number, i: number) => ({
            time: t * 1000,
            open: quote.open[i] || 0,
            high: quote.high[i] || 0,
            low: quote.low[i] || 0,
            close: quote.close[i] || 0,
            volume: quote.volume[i] || 0,
          }))
          .filter((c: any) => c.open !== 0);

        // Si on est en '4h', on agrège les bougies 1h en bougies 4h
        if (interval === '4h') {
          candles = this.aggregate4h(candles);
        }

        return candles;
      }),
      catchError(err => {
        console.error(`Erreur Yahoo history ${symbol}:`, err);
        return of([]);
      })
    );
  }

  /** Agrège des bougies 1h en bougies 4h */
  private aggregate4h(candles: CandleData[]): CandleData[] {
    const result: CandleData[] = [];
    for (let i = 0; i < candles.length; i += 4) {
      const slice = candles.slice(i, i + 4);
      if (slice.length === 0) continue;
      result.push({
        time: slice[0].time,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0),
      });
    }
    return result;
  }

    // 1. Pour le Dashboard (seulement 7 actifs pour ne pas surcharger)
  getDashboardCommodities(): string[] {
    return ['GC=F', 'SI=F', 'CL=F', 'BZ=F', 'NG=F', 'HG=F', 'ZW=F'];
  }

  // 2. Pour la page Marché (Tous les actifs disponibles)
  getMarketCommodities(): string[] {
    return [
      'GC=F', 'SI=F', 'PL=F', 'PA=F', // Métaux précieux
      'CL=F', 'BZ=F', 'NG=F', 'RB=F', 'HO=F', // Énergie
      'HG=F', 'ALI=F', // Métaux industriels
      'ZW=F', 'ZC=F', 'ZS=F', 'ZL=F', 'ZM=F', // Agriculture
      'CC=F', 'KC=F', 'SB=F', 'CT=F', 'OJ=F' // Softs
    ];
  }

  // (Garde ta méthode getCommodityName() qui traduit les noms)

  /**
   * Traduit les codes Yahoo en noms français
   */
  private getCommodityName(symbol: string): string {
    const names: { [key: string]: string } = {
      'GC=F': 'Or (Gold)',
      'SI=F': 'Argent (Silver)',
      'CL=F': 'Pétrole US (WTI)',
      'BZ=F': 'Pétrole Brent',
      'NG=F': 'Gaz Naturel',
      'HG=F': 'Cuivre (Copper)',
      'ZW=F': 'Blé (Wheat)'
    };
    return names[symbol] || symbol;
  }
}