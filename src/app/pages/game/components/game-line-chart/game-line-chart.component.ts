import { Component, Input, OnChanges, AfterViewInit, ElementRef, ViewChild, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { createChart, IChartApi, ISeriesApi, LineData, Time, LineSeries, ColorType } from 'lightweight-charts';
import { CandleData } from '../../../../core/models/kline.model';

@Component({
  selector: 'app-game-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chartContainer class="w-full h-full absolute inset-0"></div>`,
})
export class GameLineChartComponent implements AfterViewInit, OnChanges {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;
  
  @Input() candles: CandleData[] = [];
  @Input() color: string = '#ffffff';

  private chart?: IChartApi;
  private series?: ISeriesApi<'Line'>;

  ngAfterViewInit(): void {
    const container = this.chartContainer.nativeElement;
    
    setTimeout(() => {
            this.chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { 
          background: { type: ColorType.Solid, color: 'transparent' }, 
          textColor: '#848E9C' 
        },
        // 👇 On retire l'option watermark qui n'existe pas
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

      this.series = this.chart.addSeries(LineSeries, {
        color: this.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      this.updateData();

      new ResizeObserver(entries => {
        if (entries.length && this.chart) {
          this.chart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
        }
      }).observe(container);
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['candles'] || changes['color']) {
      if (this.series) this.series.applyOptions({ color: this.color });
      this.updateData();
    }
  }

  private updateData(): void {
    if (!this.series || !this.candles || this.candles.length === 0) return;

    const data: LineData<Time>[] = this.candles.map(c => ({
      time: Math.floor(c.time / 1000) as Time,
      value: c.close,
    }));

    this.series.setData(data);
    this.chart?.timeScale().applyOptions({ rightOffset: 5 });
  }
}