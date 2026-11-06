import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { Candle } from './indicators';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private http = inject(HttpClient);

  readonly symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];
  readonly intervals = ['15m', '1h', '4h', '1d'];

  getCandles(symbol: string, interval: string, limit = 300): Observable<Candle[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    return this.http.get<any[][]>(url).pipe(
      map(rows => rows.map(r => ({
        time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
      }))),
      // Données simulées si Binance est injoignable
      catchError(() => of(this.mock(limit)))
    );
  }

  private mock(n: number): Candle[] {
    let price = 80000;
    const now = Date.now();
    return Array.from({ length: n }, (_, i) => {
      const open = price;
      const close = open * (1 + (Math.random() - 0.5) * 0.02);
      price = close;
      return {
        time: now - (n - i) * 3600_000,
        open, close,
        high: Math.max(open, close) * (1 + Math.random() * 0.005),
        low: Math.min(open, close) * (1 - Math.random() * 0.005),
        volume: Math.random() * 1000,
      };
    });
  }
}