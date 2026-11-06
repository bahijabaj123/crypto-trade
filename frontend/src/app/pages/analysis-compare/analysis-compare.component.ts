import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalysisService } from '../analysis/analysis.service';
import { Candle } from '../analysis/indicators';
import { Params, STRATEGIES, StrategyId, backtest, defaultParams } from '../analysis/backtest';

type SortKey = 'returnPct' | 'sharpe' | 'maxDrawdown' | 'winRate';

@Component({
  selector: 'app-analysis-compare',
  standalone: true,
  imports: [NgApexchartsModule, CurrencyPipe, DecimalPipe],
  templateUrl: './analysis-compare.component.html',
  styleUrls: ['./analysis-compare.component.css'],
})
export class AnalysisCompareComponent implements OnInit {
  private service = inject(AnalysisService);

  symbols = this.service.symbols;
  intervals = this.service.intervals;

  symbol = signal('BTCUSDT');
  interval = signal('1h');
  capital = signal(10000);
  fee = signal(0.1);
  sortKey = signal<SortKey>('returnPct');

  candles = signal<Candle[]>([]);
  loading = signal(false);

  sortOptions: { key: SortKey; label: string }[] = [
    { key: 'returnPct', label: 'Rendement' },
    { key: 'sharpe', label: 'Sharpe' },
    { key: 'maxDrawdown', label: 'Drawdown' },
    { key: 'winRate', label: 'Win rate' },
  ];

  rows = computed(() => {
    const defs: { id: StrategyId; name: string; color: string; params: Params }[] = [
      ...STRATEGIES.map(s => ({ id: s.id as StrategyId, name: s.name, color: s.color, params: defaultParams(s) })),
      { id: 'hold', name: 'Buy & Hold', color: '#94a3b8', params: {} },
    ];
    return defs.map(d => ({
      ...d,
      result: backtest(this.candles(), d.id, d.params, this.capital(), this.fee(), this.interval(), 60),
    }));
  });

  // Plus la valeur est haute, meilleur c'est (le drawdown est négatif : le plus proche de 0 gagne)
  ranked = computed(() => {
    const k = this.sortKey();
    return [...this.rows()].sort((a, b) => b.result.metrics[k] - a.result.metrics[k]);
  });

  best = computed(() => this.ranked()[0]);

  equitySeries = computed(() =>
    this.rows().map(r => ({
      name: r.name,
      data: r.result.times.map((t, i) => ({ x: t, y: +r.result.equity[i].toFixed(2) })),
    }))
  );
  colors = computed(() => this.rows().map(r => r.color));

  barSeries = computed(() => [
    { name: 'Rendement %', data: this.ranked().map(r => +r.result.metrics.returnPct.toFixed(2)) },
  ]);
  barCategories = computed(() => this.ranked().map(r => r.name));

  // ---- Options graphiques ----
  equityChart: any = { type: 'line', height: 340, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  barChart: any = { type: 'bar', height: 300, background: 'transparent', toolbar: { show: false } };
  xaxis: any = { type: 'datetime', labels: { style: { colors: '#9ca3af' } } };
  yMoney: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => '$' + v.toFixed(0) } };
  yPct: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(0) + ' %' } };
  grid: any = { borderColor: 'rgba(255,255,255,0.06)' };
  legend: any = { labels: { colors: '#d1d5db' } };
  theme: any = { mode: 'dark' };
  tooltip: any = { theme: 'dark', x: { format: 'dd/MM/yy HH:mm' } };
  barPlot: any = {
    bar: {
      horizontal: true, borderRadius: 4, barHeight: '55%',
      colors: { ranges: [{ from: -1000, to: 0, color: '#ef4444' }, { from: 0, to: 1000, color: '#22c55e' }] },
    },
  };
  barDataLabels: any = { enabled: true, formatter: (v: number) => v.toFixed(1) + ' %', style: { colors: ['#fff'] } };

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
  setCapital(v: string) { const n = +v; this.capital.set(n > 0 ? n : 10000); }
  setFee(v: string) { this.fee.set(+v); }
}