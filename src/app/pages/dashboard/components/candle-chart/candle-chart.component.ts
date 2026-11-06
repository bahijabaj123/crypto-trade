import {
  Component, Input, OnChanges, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, HistogramData, LineData, Time,
  CandlestickSeries, HistogramSeries, LineSeries
} from 'lightweight-charts';
import { CandleData } from '../../../../core/models/kline.model';

@Component({
  selector: 'app-dashboard-candle-chart', 
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candle-chart.component.html',
  styleUrls: ['./candle-chart.component.css']
})
export class CandleChartComponent implements AfterViewInit, OnChanges, OnDestroy {

  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;
  @ViewChild('rsiContainer', { static: true }) rsiContainer!: ElementRef;

  @Input() candles: CandleData[] = [];
  @Input() symbol: string = 'BTCUSDT';
  @Input() interval: string = '1h';

  private chart?: IChartApi;
  private rsiChart?: IChartApi;
  private candleSeries?: ISeriesApi<'Candlestick'>;
  private volumeSeries?: ISeriesApi<'Histogram'>;
  private maSeries?: ISeriesApi<'Line'>;
  private rsiSeries?: ISeriesApi<'Line'>;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.initChart();
    this.initRsiChart();
    this.updateChartData();
    this.updateRsiData();
    this.syncCharts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['candles'] && !changes['candles'].firstChange) {
      this.updateChartData();
      this.updateRsiData();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.remove();
    this.rsiChart?.remove();
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;

    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: {
        background: { color: '#0B0E11' },
        textColor: '#848E9C',
        fontFamily: 'Outfit, sans-serif',
      },
      grid: {
        vertLines: { color: '#1E2329' },
        horzLines: { color: '#1E2329' },
      },
      rightPriceScale: {
        borderColor: '#2B3139',
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#0ECB81',
      downColor: '#F6465D',
      borderUpColor: '#0ECB81',
      borderDownColor: '#F6465D',
      wickUpColor: '#0ECB81',
      wickDownColor: '#F6465D',
    });

    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    this.maSeries = this.chart.addSeries(LineSeries, {
      color: '#F0B90B',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    this.resizeObserver = new ResizeObserver(entries => {
      if (!entries.length || !this.chart) return;
      this.chart.applyOptions({ width: entries[0].contentRect.width });
    });
    this.resizeObserver.observe(container);
  }

  private initRsiChart(): void {
    const container = this.rsiContainer.nativeElement;

    this.rsiChart = createChart(container, {
      width: container.clientWidth,
      height: 120,
      layout: {
        background: { color: '#0B0E11' },
        textColor: '#848E9C',
        fontFamily: 'Outfit, sans-serif',
      },
      grid: {
        vertLines: { color: '#1E2329' },
        horzLines: { color: '#1E2329' },
      },
      rightPriceScale: {
        borderColor: '#2B3139',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    this.rsiSeries = this.rsiChart.addSeries(LineSeries, {
      color: '#8B5CF6',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
  }

  private syncCharts(): void {
    if (!this.chart || !this.rsiChart) return;

    this.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) {
        this.rsiChart?.timeScale().setVisibleLogicalRange(range);
      }
    });

    this.rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) {
        this.chart?.timeScale().setVisibleLogicalRange(range);
      }
    });
  }

  private updateChartData(): void {
    if (!this.candleSeries || !this.volumeSeries || !this.maSeries || !this.candles.length) return;

    const chartData: CandlestickData<Time>[] = this.candles.map(c => ({
      time: Math.floor(c.time / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData<Time>[] = this.candles.map(c => ({
      time: Math.floor(c.time / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14, 203, 129, 0.5)' : 'rgba(246, 70, 93, 0.5)',
    }));

    const period = 20;
    const maData: LineData<Time>[] = [];
    for (let i = period - 1; i < this.candles.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += this.candles[i - j].close;
      maData.push({
        time: Math.floor(this.candles[i].time / 1000) as Time,
        value: sum / period,
      });
    }

    chartData.sort((a, b) => (a.time as number) - (b.time as number));
    volumeData.sort((a, b) => (a.time as number) - (b.time as number));

    this.candleSeries.setData(chartData);
    this.volumeSeries.setData(volumeData);
    this.maSeries.setData(maData);

    this.chart?.timeScale().fitContent();
    this.rsiChart?.timeScale().fitContent();
  }

  private updateRsiData(): void {
    if (!this.rsiSeries || !this.candles.length) return;

    const period = 14;
    const rsiData: LineData<Time>[] = [];

    for (let i = period; i < this.candles.length; i++) {
      let gains = 0;
      let losses = 0;

      for (let j = 0; j < period; j++) {
        const change = this.candles[i - j].close - this.candles[i - j - 1].close;
        if (change > 0) gains += change;
        else losses -= change;
      }

      const avgGain = gains / period;
      const avgLoss = losses / period;

      let rsi: number;
      if (avgLoss === 0) {
        rsi = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }

      rsiData.push({
        time: Math.floor(this.candles[i].time / 1000) as Time,
        value: rsi,
      });
    }

    this.rsiSeries.setData(rsiData);
  }
}