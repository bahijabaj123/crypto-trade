import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalysisService } from './analysis.service';
import { Candle, sma, ema, rsi, macd, bollinger, Series } from './indicators';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [NgApexchartsModule, CurrencyPipe, DecimalPipe],
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.css'],
})
export class AnalysisComponent implements OnInit {
  private service = inject(AnalysisService);

  symbols = this.service.symbols;
  intervals = this.service.intervals;

  symbol = signal('BTCUSDT');
  interval = signal('1h');
  candles = signal<Candle[]>([]);
  loading = signal(false);

  showSma = signal(true);
  showEma = signal(true);
  showBb = signal(false);

  // ---- Indicateurs ----
  closes = computed(() => this.candles().map(c => c.close));
  sma20 = computed(() => sma(this.closes(), 20));
  ema50 = computed(() => ema(this.closes(), 50));
  bb = computed(() => bollinger(this.closes()));
  rsi14 = computed(() => rsi(this.closes()));
  macdData = computed(() => macd(this.closes()));

  // ---- Statistiques ----
  stats = computed(() => {
    const c = this.candles();
    if (!c.length) return null;
    const last = c[c.length - 1].close;
    const first = c[0].close;
    return {
      last,
      change: ((last - first) / first) * 100,
      high: Math.max(...c.map(x => x.high)),
      low: Math.min(...c.map(x => x.low)),
    };
  });

  // ---- Signaux ----
  signals = computed(() => {
    const c = this.closes();
    if (c.length < 60) return [];
    const i = c.length - 1;
    const price = c[i];
    const r = this.rsi14()[i] ?? 50;
    const h = this.macdData().hist[i] ?? 0;
    const s = this.sma20()[i] ?? price;
    const e = this.ema50()[i] ?? price;
    const up = this.bb().upper[i] ?? price;
    const lo = this.bb().lower[i] ?? price;
    return [
      { name: 'RSI (14)', value: r.toFixed(1), signal: r > 70 ? 'Vente' : r < 30 ? 'Achat' : 'Neutre' },
      { name: 'MACD (histogramme)', value: h.toFixed(2), signal: h > 0 ? 'Achat' : 'Vente' },
      { name: 'Prix vs SMA 20', value: s.toFixed(2), signal: price > s ? 'Achat' : 'Vente' },
      { name: 'Prix vs EMA 50', value: e.toFixed(2), signal: price > e ? 'Achat' : 'Vente' },
      { name: 'Bollinger', value: price.toFixed(2), signal: price < lo ? 'Achat' : price > up ? 'Vente' : 'Neutre' },
    ];
  });

  verdict = computed(() => {
    const s = this.signals();
    const buy = s.filter(x => x.signal === 'Achat').length;
    const sell = s.filter(x => x.signal === 'Vente').length;
    if (buy > sell + 1) return { label: 'Achat', css: 'buy', buy, sell };
    if (sell > buy + 1) return { label: 'Vente', css: 'sell', buy, sell };
    return { label: 'Neutre', css: 'neutral', buy, sell };
  });

  // ---- Graphiques ----
  private line = (arr: Series) => this.candles().map((c, i) => ({ x: c.time, y: arr[i] }));

  mainSeries = computed(() => {
    const s: any[] = [{
      name: 'Prix', type: 'candlestick',
      data: this.candles().map(c => ({ x: c.time, y: [c.open, c.high, c.low, c.close] })),
    }];
    if (this.showSma()) s.push({ name: 'SMA 20', type: 'line', color: '#f59e0b', data: this.line(this.sma20()) });
    if (this.showEma()) s.push({ name: 'EMA 50', type: 'line', color: '#3b82f6', data: this.line(this.ema50()) });
    if (this.showBb()) {
      s.push({ name: 'BB haute', type: 'line', color: '#a78bfa', data: this.line(this.bb().upper) });
      s.push({ name: 'BB basse', type: 'line', color: '#a78bfa', data: this.line(this.bb().lower) });
    }
    return s;
  });

  rsiSeries = computed(() => [{ name: 'RSI', data: this.line(this.rsi14()) }]);

  macdSeries = computed(() => [
    { name: 'Histogramme', type: 'bar', color: '#64748b', data: this.line(this.macdData().hist) },
    { name: 'MACD', type: 'line', color: '#22c55e', data: this.line(this.macdData().line) },
    { name: 'Signal', type: 'line', color: '#ef4444', data: this.line(this.macdData().signal) },
  ]);

  mainChart: any = { type: 'line', height: 380, background: 'transparent', toolbar: { show: true }, animations: { enabled: false } };
  rsiChart: any = { type: 'line', height: 160, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  macdChart: any = { type: 'line', height: 180, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };

  xaxis: any = { type: 'datetime', labels: { style: { colors: '#9ca3af' } } };
  yaxis: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(0) } };
  rsiYaxis: any = { min: 0, max: 100, tickAmount: 2, labels: { style: { colors: '#9ca3af' } } };
  grid: any = { borderColor: 'rgba(255,255,255,0.06)' };
  stroke: any = { width: 1.5 };
  plotOptions: any = { candlestick: { colors: { upward: '#22c55e', downward: '#ef4444' } } };
  rsiAnnotations: any = {
    yaxis: [
      { y: 70, borderColor: '#ef4444', strokeDashArray: 4 },
      { y: 30, borderColor: '#22c55e', strokeDashArray: 4 },
    ],
  };

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.service.getCandles(this.symbol(), this.interval()).subscribe(c => {
      this.candles.set(c);
      this.loading.set(false);
    });
  }

  setSymbol(s: string) { this.symbol.set(s); this.load(); }
  setInterval(i: string) { this.interval.set(i); this.load(); }
}