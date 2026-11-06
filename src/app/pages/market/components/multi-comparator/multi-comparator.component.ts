import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BinanceService } from '../../../../core/services/binance.service';
import { CandleData } from '../../../../core/models/kline.model';

interface ComparisonSeries {
  symbol: string;
  color: string;
  data: number[];   // Base 100
}

@Component({
  selector: 'app-multi-comparator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-comparator.component.html',
  styleUrls: ['./multi-comparator.component.css']
})
export class MultiComparatorComponent implements OnInit {

  availableSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];
  selectedSymbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  interval = '1d';
  periods = 30;
  series: ComparisonSeries[] = [];
  loading = false;

  private colors = ['#0ECB81', '#1E90FF', '#F0B90B', '#8B5CF6', '#EC4899'];

  constructor(
    private binanceService: BinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadComparison();
  }

  toggleSymbol(symbol: string): void {
    const idx = this.selectedSymbols.indexOf(symbol);
    if (idx !== -1) {
      if (this.selectedSymbols.length > 2) this.selectedSymbols.splice(idx, 1);
    } else {
      if (this.selectedSymbols.length < 5) this.selectedSymbols.push(symbol);
    }
    this.loadComparison();
  }

  isSelected(symbol: string): boolean {
    return this.selectedSymbols.includes(symbol);
  }

  loadComparison(): void {
    this.loading = true;
    this.series = [];

    const requests = this.selectedSymbols.map((symbol, i) =>
      this.binanceService.getKlines(symbol, this.interval, this.periods).toPromise()
        .then((klines: CandleData[] | undefined) => {
          if (!klines || klines.length === 0) return;

          // Base 100
          const base = klines[0].close;
          const base100 = klines.map(k => (k.close / base) * 100);

          this.series.push({
            symbol,
            color: this.colors[i % this.colors.length],
            data: base100
          });
        })
    );

    Promise.all(requests).then(() => {
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  changeInterval(interval: string): void {
    this.interval = interval;
    this.loadComparison();
  }

  // Génère un path SVG pour un actif
  getPath(series: ComparisonSeries): string {
    if (!series.data || series.data.length < 2) return '';

    const allValues = this.series.flatMap(s => s.data);
    const min = Math.min(...allValues) - 5;
    const max = Math.max(...allValues) + 5;
    const range = max - min || 1;

    const width = 800;
    const height = 300;
    const step = width / (series.data.length - 1);

    return series.data.map((value, i) => {
      const x = i * step;
      const y = height - ((value - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  getYAxisLabels(): { value: number; y: number }[] {
    if (this.series.length === 0) return [];

    const allValues = this.series.flatMap(s => s.data);
    const min = Math.min(...allValues) - 5;
    const max = Math.max(...allValues) + 5;

    return [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max]
      .map(v => ({
        value: v,
        y: 300 - ((v - min) / (max - min)) * 300
      }));
  }
}