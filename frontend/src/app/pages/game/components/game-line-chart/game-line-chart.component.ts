import { Component, Input, OnChanges, AfterViewInit, OnDestroy, ElementRef, ViewChild, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { createChart, IChartApi, ISeriesApi, IPriceLine, LineStyle, AreaData, Time, AreaSeries, ColorType } from 'lightweight-charts';
import { CandleData } from '../../../../core/models/kline.model';

@Component({
  selector: 'app-game-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chartContainer class="w-full h-full absolute inset-0"></div>`,
})
export class GameLineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  @Input() candles: CandleData[] = [];
  @Input() color: string = '#ffffff';

  // Repères du joueur sur ce graphique (null = pas de position ouverte)
  @Input() prixEntree: number | null = null;
  @Input() stopLoss: number | null = null;
  @Input() takeProfit: number | null = null;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Area'>;
  private lignes: IPriceLine[] = [];
  private observer?: ResizeObserver;
  private demarrage?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    const container = this.chartContainer.nativeElement;

    this.demarrage = setTimeout(() => {
      this.chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#848E9C'
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: 'rgba(255,255,255,0.05)' }
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          timeVisible: false,
          visible: false
        },
        crosshair: { mode: 0 },
      });

      // Courbe + zone colorée dessous (plus lisible qu'une simple ligne)
      this.series = this.chart.addSeries(AreaSeries, {
        lineColor: this.color,
        topColor: this.rgba(this.color, 0.28),
        bottomColor: this.rgba(this.color, 0.02),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      this.updateData();
      this.majLignes();

      this.observer = new ResizeObserver(entries => {
        if (entries.length && this.chart) {
          this.chart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
        }
      });
      this.observer.observe(container);
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['candles'] || changes['color']) {
      if (this.series) {
        this.series.applyOptions({
          lineColor: this.color,
          topColor: this.rgba(this.color, 0.28),
          bottomColor: this.rgba(this.color, 0.02),
        });
      }
      this.updateData();
    }
    if (changes['prixEntree'] || changes['stopLoss'] || changes['takeProfit']) {
      this.majLignes();
    }
  }

  ngOnDestroy(): void {
    if (this.demarrage) clearTimeout(this.demarrage);
    this.observer?.disconnect();
    this.chart?.remove();
  }

  private updateData(): void {
    if (!this.series || !this.candles || this.candles.length === 0) return;

    const data: AreaData<Time>[] = this.candles.map(c => ({
      time: Math.floor(c.time / 1000) as Time,
      value: c.close,
    }));

    this.series.setData(data);
    this.chart?.timeScale().applyOptions({ rightOffset: 5 });
  }

  /** Trace les lignes Entrée / Stop-loss / Take-profit de la position du joueur. */
  private majLignes(): void {
    if (!this.series) return;
    this.lignes.forEach(l => this.series!.removePriceLine(l));
    this.lignes = [];

    const ajouter = (prix: number | null, couleur: string, titre: string) => {
      if (!prix) return;
      this.lignes.push(this.series!.createPriceLine({
        price: prix,
        color: couleur,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: titre,
      }));
    };

    ajouter(this.prixEntree, '#60a5fa', 'Entrée');
    ajouter(this.stopLoss, '#ef4444', 'Stop-loss');
    ajouter(this.takeProfit, '#22c55e', 'Take-profit');
  }

  /** '#rrggbb' -> 'rgba(r,g,b,a)' */
  private rgba(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return `rgba(255,255,255,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
}
