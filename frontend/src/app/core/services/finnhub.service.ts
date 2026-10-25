import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { TickerData } from '../models/ticker.model';
import { CandleData } from '../models/kline.model';

@Injectable({
  providedIn: 'root'
})
export class FinnhubService {

  private readonly API_BASE = 'https://finnhub.io/api/v1';
  
  // ⚠️ REMPLACE PAR TA VRAIE CLÉ API FINNHUB
  private readonly API_KEY = 'db7q4kpr01qmvbh23pegdb7q4kpr01qmvbh23pf0';

  constructor(private http: HttpClient) {}

  /**
   * Récupère le prix actuel (Quote) d'une action ou d'une paire forex
   */
  getQuote(symbol: string): Observable<TickerData | null> {
    // On passe la clé API dans l'URL pour éviter le blocage CORS du navigateur
    const url = `${this.API_BASE}/quote?symbol=${symbol}&token=${this.API_KEY}`;

    return this.http.get<any>(url).pipe(
      map(data => {
        if (!data || data.c === 0) return null;
        return {
          symbol: symbol,
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          high: data.h,
          low: data.l,
          volume: 0 // Finnhub /quote ne donne pas le volume
        };
      }),
      catchError(err => {
        console.error(`Erreur Finnhub quote ${symbol}:`, err);
        return of(null);
      })
    );
  }

  /**
   * Récupère les chandeliers (Candles) pour une action ou forex
   */
  getHistory(symbol: string, type: 'stock' | 'forex', interval: string = '1h'): Observable<CandleData[]> {
    const now = Math.floor(Date.now() / 1000);
    // On demande 200 chandeliers en arrière
    const from = now - (200 * 3600); // 200 heures pour du 1h
    
    let resolution = '60'; // 60 min = 1h
    if (interval === '1d') resolution = 'D';
    if (interval === '1w') resolution = 'W';

    const endpoint = type === 'stock' ? 'stock' : 'forex';
    // Clé API dans l'URL
    const url = `${this.API_BASE}/${endpoint}/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${this.API_KEY}`;

    return this.http.get<any>(url).pipe(
      map(data => {
        if (!data || data.s !== 'ok' || !data.t) return [];
        
        return data.t.map((timestamp: number, i: number) => ({
          time: timestamp * 1000,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v ? data.v[i] : 0
        }));
      }),
      catchError(err => {
        console.error(`Erreur Finnhub history ${symbol}:`, err);
        return of([]);
      })
    );
  }
}