import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BinanceService } from './binance.service';
import { FinnhubService } from './finnhub.service';
import { TwelveDataService } from './twelvedata.service';
import { YahooService } from './yahoo.service';
import { TickerData } from '../models/ticker.model';
import { CandleData } from '../models/kline.model';

export type MarketType = 'crypto' | 'stocks' | 'forex' | 'commodities';

@Injectable({
  providedIn: 'root'
})
export class MarketService {

  private activeMarketSubject = new BehaviorSubject<MarketType>('crypto');
  activeMarket$ = this.activeMarketSubject.asObservable();

  get activeMarket(): MarketType {
    return this.activeMarketSubject.value;
  }

  private stockSymbols = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 
    'AMD', 'INTC', 'JPM', 'V', 'WMT', 'DIS', 'BA', 'CSCO', 'PEP', 'ADBE',
    'CRM', 'ORCL', 'IBM', 'QCOM', 'TXN', 'PYPL', 'NKE', 'MCD', 'KO', 'PFE', 'XOM', 'CVX'
  ];

  constructor(
    private binanceService: BinanceService,
    private finnhubService: FinnhubService,
    private twelveDataService: TwelveDataService,
    private yahooService: YahooService
  ) {}

  setActiveMarket(market: MarketType): void {
    this.activeMarketSubject.next(market);
  }

  getTickers(isMarketPage: boolean = false): Observable<TickerData[]> {
    switch (this.activeMarket) {
      case 'crypto':
        const cryptoSymbols = isMarketPage 
          ? this.binanceService.getMarketSymbols() 
          : this.binanceService.getPopularSymbols();
        return this.binanceService.getMultipleTickers(cryptoSymbols);

      case 'stocks':
        return new Observable<TickerData[]>(observer => {
          const results: TickerData[] = [];
          let count = 0;
          
          const fetchStock = (index: number) => {
            if (index >= this.stockSymbols.length) {
              observer.next(results);
              observer.complete();
              return;
            }

            const sym = this.stockSymbols[index];
            this.finnhubService.getQuote(sym).subscribe(ticker => {
              if (ticker) results.push(ticker);
              count++;
              setTimeout(() => fetchStock(index + 1), 50);
            });
          };
          fetchStock(0);
        });

      case 'forex':
        const forexSymbols = isMarketPage 
          ? this.twelveDataService.getMarketForex() 
          : this.twelveDataService.getDashboardForex();
        return this.twelveDataService.getQuotes(forexSymbols);

      case 'commodities':
        const commoditySymbols = isMarketPage 
          ? this.yahooService.getMarketCommodities() 
          : this.yahooService.getDashboardCommodities();
        return this.yahooService.getQuotes(commoditySymbols);

      default:
        return new Observable(obs => { obs.next([]); obs.complete(); });
    }
  }

  /**
   * Klines (bougies) pour le graphique selon le marché actif.
   * - Crypto : Binance
   * - Actions : Finnhub (Twelve Data free ne donne pas les actions US)
   * - Forex : Twelve Data
   * - Commodities : Yahoo Finance
   */
  getKlines(symbol: string, interval: string = '1h'): Observable<CandleData[]> {
    switch (this.activeMarket) {
      case 'crypto':
        return this.binanceService.getKlines(symbol, interval, 200);

      case 'stocks':
        // Finnhub fournit les candles pour les actions US
return this.yahooService.getHistory(symbol, interval);

      case 'forex':
        return this.twelveDataService.getTimeSeries(symbol, interval);

      case 'commodities':
        return this.yahooService.getHistory(symbol, interval);

      default:
        return new Observable(obs => { obs.next([]); obs.complete(); });
    }
  }
}