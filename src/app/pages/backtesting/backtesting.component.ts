import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalysisService } from '../analysis/analysis.service';
import { Candle } from '../analysis/indicators';
import { Params, STRATEGIES, StrategyId, backtest, defaultParams } from '../analysis/backtest';

@Component({
  selector: 'app-backtesting',
  standalone: true,
  imports: [NgApexchartsModule, CurrencyPipe, DecimalPipe, DatePipe],
  templateUrl: './backtesting.component.html',
  styleUrls: ['./backtesting.component.css'],
})
export class BacktestingComponent implements OnInit {
  private service = inject(AnalysisService);

  symbols = this.service.symbols;
  intervals = this.service.intervals;
  strategies = STRATEGIES;

  symbol = signal('BTCUSDT');
  interval = signal('1h');
  strategyId = signal<StrategyId>('sma-cross');
  params = signal<Params>(defaultParams(STRATEGIES[0]));
  capital = signal(10000);
  fee = signal(0.1);

  candles = signal<Candle[]>([]);
  loading = signal(false);

  strategy = computed(() => this.strategies.find(s => s.id === this.strategyId())!);

  result = computed(() =>
    backtest(this.candles(), this.strategyId(), this.params(), this.capital(), this.fee(), this.interval())
  );
  m = computed(() => this.result().metrics);
  alpha = computed(() => this.m().returnPct - this.m().buyHoldPct);
  tradesDesc = computed(() => [...this.result().trades].reverse());

  // ---- Séries ----
  equitySeries = computed(() => {
    const r = this.result();
    return [
      { name: 'Stratégie', data: r.times.map((t, i) => ({ x: t, y: +r.equity[i].toFixed(2) })) },
      { name: 'Buy & Hold', data: r.times.map((t, i) => ({ x: t, y: +r.buyHold[i].toFixed(2) })) },
    ];
  });

  ddSeries = computed(() => {
    const r = this.result();
    return [{ name: 'Drawdown', data: r.times.map((t, i) => ({ x: t, y: +r.drawdown[i].toFixed(2) })) }];
  });

  priceSeries = computed(() => {
    const r = this.result();
    return [{ name: 'Prix', data: r.times.map((t, i) => ({ x: t, y: r.prices[i] })) }];
  });

  priceAnnotations = computed(() => ({
    points: this.result().trades.slice(-150).flatMap(t => {
      const pts: any[] = [
        { x: t.entryTime, y: t.entryPrice, marker: { size: 5, fillColor: '#22c55e', strokeColor: '#fff', radius: 2 } },
      ];
      if (!t.open) {
        pts.push({ x: t.exitTime, y: t.exitPrice, marker: { size: 5, fillColor: '#ef4444', strokeColor: '#fff', radius: 2 } });
      }
      return pts;
    }),
  }));

  // ---- Options graphiques ----
  equityChart: any = { type: 'line', height: 320, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  priceChart: any = { type: 'line', height: 260, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  ddChart: any = { type: 'area', height: 180, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  xaxis: any = { type: 'datetime', labels: { style: { colors: '#9ca3af' } } };
  yMoney: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => '$' + v.toFixed(0) } };
  yPct: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(0) + ' %' } };
  yPrice: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(0) } };
  grid: any = { borderColor: 'rgba(255,255,255,0.06)' };
  legend: any = { labels: { colors: '#d1d5db' } };
  theme: any = { mode: 'dark' };
  tooltip: any = { theme: 'dark', x: { format: 'dd/MM/yy HH:mm' } };
  fillDd: any = { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.05 } };

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.service.getCandles(this.symbol(), this.interval(), 1000).subscribe(c => {
      this.candles.set(c);
      this.loading.set(false);
    });
  }

  setSymbol(s: string) { this.symbol.set(s); this.load(); }
  setInterval(i: string) { this.interval.set(i); this.load(); }

  setStrategy(id: StrategyId) {
    this.strategyId.set(id);
    this.params.set(defaultParams(this.strategies.find(s => s.id === id)!));
  }
  setParam(key: string, value: string) { this.params.update(p => ({ ...p, [key]: +value })); }
  resetParams() { this.params.set(defaultParams(this.strategy())); }
  setCapital(v: string) { const n = +v; this.capital.set(n > 0 ? n : 10000); }
  setFee(v: string) { this.fee.set(+v); }
}