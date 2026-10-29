import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CandleData } from '../models/kline.model';

export interface HistoricalRequest {
  source: 'binance' | 'twelvedata';
  symbol: string;
  startDate: string; // Format: YYYY-MM-DD
  endDate: string;   // Format: YYYY-MM-DD
  interval: string;  // '1h', '1day'
}

@Injectable({
  providedIn: 'root'
})
export class HistoricalDataService {

  // ⚠️ TA CLÉ TWELVE DATA
  private readonly TWELVE_DATA_KEY = 'eea6febd8a464b5d83aaba59b47ab70b';
  private readonly BINANCE_API = '/binance-api';

  constructor(private http: HttpClient) {}

  chargerHistorique(req: HistoricalRequest): Observable<CandleData[]> {
    if (req.source === 'binance') {
      return this.chargerBinance(req);
    } else {
      return this.chargerTwelveData(req);
    }
  }

  // ============================================
  // BINANCE (Crypto)
  // ============================================
  private chargerBinance(req: HistoricalRequest): Observable<CandleData[]> {
    // On convertit les dates en timestamps (ms)
    const startTime = new Date(req.startDate).getTime();
    const endTime = new Date(req.endDate).getTime();
    
    // On demande 1000 bougies max par appel (limite Binance)
    const url = `${this.BINANCE_API}/api/v3/klines?symbol=${req.symbol}&interval=${req.interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;

    return this.http.get<any[]>(url).pipe(
      map(data => data.map(k => ({
        time: k[0], // timestamp
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }))),
      catchError(err => {
        console.error('Erreur Binance:', err);
        return of([]);
      })
    );
  }

  // ============================================
  // TWELVE DATA (Actions, Forex, Commodities)
  // ============================================
  private chargerTwelveData(req: HistoricalRequest): Observable<CandleData[]> {
    // Twelve Data accepte start_date et end_date
    // On demande un maximum de 5000 points (limite gratuite)
    const url = `https://api.twelvedata.com/time_series?symbol=${req.symbol}&interval=${req.interval}&start_date=${req.startDate}&end_date=${req.endDate}&outputsize=5000&apikey=${this.TWELVE_DATA_KEY}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        if (!response.values || !Array.isArray(response.values)) {
          console.warn('Twelve Data: pas de valeurs', response);
          return [];
        }
        
        // Twelve Data renvoie les données du plus récent au plus ancien, on inverse
        return response.values.reverse().map((v: any) => ({
          time: new Date(v.datetime).getTime(),
          open: parseFloat(v.open),
          high: parseFloat(v.high),
          low: parseFloat(v.low),
          close: parseFloat(v.close),
          volume: parseFloat(v.volume) || 0
        }));
      }),
      catchError(err => {
        console.error('Erreur Twelve Data:', err);
        return of([]);
      })
    );
  }
}