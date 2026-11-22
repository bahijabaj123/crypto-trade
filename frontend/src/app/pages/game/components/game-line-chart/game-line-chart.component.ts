import { Component, Input, OnChanges, AfterViewInit, OnDestroy, ElementRef, ViewChild, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { createChart, IChartApi, ISeriesApi, IPriceLine, LineStyle, CandlestickData, HistogramData, LineData, Time, CandlestickSeries, HistogramSeries, LineSeries, ColorType } from 'lightweight-charts';
import { CandleData } from '../../../../core/models/kline.model';

/**
 * Graphique en BOUGIES JAPONAISES (chandeliers).
 * Chaque bougie = Ouverture / Haut / Bas / Clôture (OHLC).
 *  - verte : la clôture est au-dessus de l'ouverture (le prix a monté)
 *  - rouge : la clôture est en dessous de l'ouverture (le prix a baissé)
 * On garde le même nom de composant et les mêmes entrées que l'ancienne courbe,
 * donc le tableau de bord n'a pas à être modifié.
 */
@Component({
  selector: 'app-game-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #chartContainer class="w-full h-full absolute inset-0"></div>

    <!-- Boutons d'indicateurs (en haut à gauche du graphique) -->
    <div class="absolute top-2 left-2 z-10 flex gap-1.5 text-[10px] font-bold">
      <button type="button" (click)="basculerVolume()"
        class="px-2 py-1 rounded-md border transition"
        [class]="afficherVolume ? 'bg-white/15 border-white/30 text-white' : 'border-white/10 text-gray-500'">
        Volume
      </button>
      <button type="button" (click)="basculerSMA()"
        class="px-2 py-1 rounded-md border transition"
        [style.color]="afficherSMA ? COULEUR_SMA : '#6b7280'"
        [style.borderColor]="afficherSMA ? COULEUR_SMA : 'rgba(255,255,255,0.1)'">
        SMA {{ periodeSMA }}
      </button>
      <button type="button" (click)="basculerEMA()"
        class="px-2 py-1 rounded-md border transition"
        [style.color]="afficherEMA ? COULEUR_EMA : '#6b7280'"
        [style.borderColor]="afficherEMA ? COULEUR_EMA : 'rgba(255,255,255,0.1)'">
        EMA {{ periodeEMA }}
      </button>
      <button type="button" (click)="basculerRSI()"
        class="px-2 py-1 rounded-md border transition"
        [style.color]="afficherRSI ? COULEUR_RSI : '#6b7280'"
        [style.borderColor]="afficherRSI ? COULEUR_RSI : 'rgba(255,255,255,0.1)'">
        RSI {{ periodeRSI }}
      </button>
      <button type="button" (click)="basculerBollinger()"
        class="px-2 py-1 rounded-md border transition"
        [style.color]="afficherBollinger ? COULEUR_BOLLINGER : '#6b7280'"
        [style.borderColor]="afficherBollinger ? COULEUR_BOLLINGER : 'rgba(255,255,255,0.1)'">
        Bollinger
      </button>
    </div>
  `,
})
export class GameLineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  @Input() candles: CandleData[] = [];
  /** Plus utilisé pour le tracé (les bougies ont leurs propres couleurs), gardé pour compatibilité. */
  @Input() color: string = '#ffffff';
  /** Affiche les barres de volume sous les bougies. */
  @Input() afficherVolume: boolean = true;
  /** Moyennes mobiles : SMA (simple) et EMA (exponentielle). */
  @Input() afficherSMA: boolean = true;
  @Input() afficherEMA: boolean = true;
  @Input() periodeSMA: number = 20;
  @Input() periodeEMA: number = 50;
  /** RSI (indice de force relative), affiché dans un panneau séparé sous le graphique. */
  @Input() afficherRSI: boolean = true;
  @Input() periodeRSI: number = 14;
  /** Bandes de Bollinger : moyenne sur N bougies +/- K écarts-types. */
  @Input() afficherBollinger: boolean = true;
  @Input() periodeBollinger: number = 20;
  @Input() ecartsTypesBollinger: number = 2;

  readonly COULEUR_BOLLINGER = '#2dd4bf';

  readonly COULEUR_SMA = '#fbbf24';
  readonly COULEUR_EMA = '#a78bfa';
  readonly COULEUR_RSI = '#38bdf8';

  // Repères du joueur sur ce graphique (null = pas de position ouverte)
  @Input() prixEntree: number | null = null;
  @Input() stopLoss: number | null = null;
  @Input() takeProfit: number | null = null;

  private readonly COULEUR_HAUSSE = '#22c55e';
  private readonly COULEUR_BAISSE = '#ef4444';

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private volumeSeries?: ISeriesApi<'Histogram'>;
  private smaSeries?: ISeriesApi<'Line'>;
  private emaSeries?: ISeriesApi<'Line'>;
  private rsiSeries?: ISeriesApi<'Line'>;
  private bollHaute?: ISeriesApi<'Line'>;
  private bollMoyenne?: ISeriesApi<'Line'>;
  private bollBasse?: ISeriesApi<'Line'>;
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

      // Série de bougies : corps vert/rouge + mèches (haut / bas)
      this.series = this.chart.addSeries(CandlestickSeries, {
        upColor: this.COULEUR_HAUSSE,
        downColor: this.COULEUR_BAISSE,
        borderVisible: false,
        wickUpColor: this.COULEUR_HAUSSE,
        wickDownColor: this.COULEUR_BAISSE,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      // Volume : barres en bas du graphique (échelle séparée, 20 % de la hauteur)
      this.volumeSeries = this.chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
        visible: this.afficherVolume,
      });
      this.chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      // Moyennes mobiles : deux lignes par-dessus les bougies
      this.smaSeries = this.chart.addSeries(LineSeries, {
        color: this.COULEUR_SMA, lineWidth: 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        visible: this.afficherSMA,
      });
      this.emaSeries = this.chart.addSeries(LineSeries, {
        color: this.COULEUR_EMA, lineWidth: 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        visible: this.afficherEMA,
      });

      // Bandes de Bollinger : bande haute, moyenne (pointillés) et bande basse
      const optionsBande = (style: LineStyle) => ({
        color: this.COULEUR_BOLLINGER, lineWidth: 1 as const, lineStyle: style,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        visible: this.afficherBollinger,
      });
      this.bollHaute = this.chart.addSeries(LineSeries, optionsBande(LineStyle.Solid));
      this.bollMoyenne = this.chart.addSeries(LineSeries, optionsBande(LineStyle.Dashed));
      this.bollBasse = this.chart.addSeries(LineSeries, optionsBande(LineStyle.Solid));

      // RSI : panneau n°1 (sous le graphique principal), échelle fixe de 0 à 100
      this.rsiSeries = this.chart.addSeries(LineSeries, {
        color: this.COULEUR_RSI, lineWidth: 2,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 0, minMove: 1 },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        visible: this.afficherRSI,
      }, 1);
      // Lignes repères : 70 = suracheté, 30 = survendu
      this.rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
      this.rsiSeries.createPriceLine({ price: 30, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
      this.majPanneauRSI();

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
    if (changes['candles'] || changes['periodeSMA'] || changes['periodeEMA'] || changes['periodeRSI']
        || changes['periodeBollinger'] || changes['ecartsTypesBollinger']) {
      this.updateData();
    }
    if (changes['afficherBollinger']) {
      this.majVisibiliteBollinger();
    }
    if (changes['afficherRSI']) {
      this.rsiSeries?.applyOptions({ visible: this.afficherRSI });
      this.majPanneauRSI();
    }
    if (changes['afficherVolume']) {
      this.volumeSeries?.applyOptions({ visible: this.afficherVolume });
    }
    if (changes['afficherSMA']) {
      this.smaSeries?.applyOptions({ visible: this.afficherSMA });
    }
    if (changes['afficherEMA']) {
      this.emaSeries?.applyOptions({ visible: this.afficherEMA });
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

    const data: CandlestickData<Time>[] = this.candles.map(c => ({
      time: Math.floor(c.time / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    this.series.setData(data);

    // Volume coloré comme la bougie (vert = hausse, rouge = baisse)
    if (this.volumeSeries) {
      const vol: HistogramData<Time>[] = this.candles.map(c => ({
        time: Math.floor(c.time / 1000) as Time,
        value: c.volume ?? 0,
        color: c.close >= c.open ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)',
      }));
      this.volumeSeries.setData(vol);
    }

    this.smaSeries?.setData(this.calculerSMA(data, this.periodeSMA));
    this.emaSeries?.setData(this.calculerEMA(data, this.periodeEMA));
    this.rsiSeries?.setData(this.calculerRSI(data, this.periodeRSI));

    const boll = this.calculerBollinger(data, this.periodeBollinger, this.ecartsTypesBollinger);
    this.bollHaute?.setData(boll.haute);
    this.bollMoyenne?.setData(boll.moyenne);
    this.bollBasse?.setData(boll.basse);

    this.chart?.timeScale().applyOptions({ rightOffset: 5 });
  }

  // ---- Boutons du graphique ----
  basculerVolume(): void {
    this.afficherVolume = !this.afficherVolume;
    this.volumeSeries?.applyOptions({ visible: this.afficherVolume });
  }
  basculerSMA(): void {
    this.afficherSMA = !this.afficherSMA;
    this.smaSeries?.applyOptions({ visible: this.afficherSMA });
  }
  basculerEMA(): void {
    this.afficherEMA = !this.afficherEMA;
    this.emaSeries?.applyOptions({ visible: this.afficherEMA });
  }
  basculerBollinger(): void {
    this.afficherBollinger = !this.afficherBollinger;
    this.majVisibiliteBollinger();
  }
  private majVisibiliteBollinger(): void {
    const v = { visible: this.afficherBollinger };
    this.bollHaute?.applyOptions(v);
    this.bollMoyenne?.applyOptions(v);
    this.bollBasse?.applyOptions(v);
  }
  basculerRSI(): void {
    this.afficherRSI = !this.afficherRSI;
    this.rsiSeries?.applyOptions({ visible: this.afficherRSI });
    this.majPanneauRSI();
  }

  /** Donne de la hauteur au panneau RSI quand il est affiché, le réduit au minimum sinon. */
  private majPanneauRSI(): void {
    try {
      this.chart?.panes()[1]?.setHeight(this.afficherRSI ? 110 : 1);
    } catch { /* le panneau n'existe pas encore */ }
  }

  // ---- Calculs des indicateurs ----

  /** SMA : moyenne simple des N dernières clôtures. */
  private calculerSMA(data: CandlestickData<Time>[], periode: number): LineData<Time>[] {
    const res: LineData<Time>[] = [];
    let somme = 0;
    for (let i = 0; i < data.length; i++) {
      somme += data[i].close;
      if (i >= periode) somme -= data[i - periode].close;
      if (i >= periode - 1) res.push({ time: data[i].time, value: somme / periode });
    }
    return res;
  }

  /** EMA : moyenne exponentielle (plus de poids aux prix récents), k = 2 / (N + 1). */
  private calculerEMA(data: CandlestickData<Time>[], periode: number): LineData<Time>[] {
    const res: LineData<Time>[] = [];
    if (data.length < periode) return res;
    const k = 2 / (periode + 1);
    // On démarre l'EMA avec la SMA des N premières clôtures
    let ema = data.slice(0, periode).reduce((s, d) => s + d.close, 0) / periode;
    res.push({ time: data[periode - 1].time, value: ema });
    for (let i = periode; i < data.length; i++) {
      ema = data[i].close * k + ema * (1 - k);
      res.push({ time: data[i].time, value: ema });
    }
    return res;
  }

  /**
   * Bandes de Bollinger : moyenne des N dernières clôtures,
   * bande haute = moyenne + K x écart-type, bande basse = moyenne - K x écart-type.
   */
  private calculerBollinger(data: CandlestickData<Time>[], periode: number, k: number):
      { haute: LineData<Time>[]; moyenne: LineData<Time>[]; basse: LineData<Time>[] } {
    const haute: LineData<Time>[] = [];
    const moyenne: LineData<Time>[] = [];
    const basse: LineData<Time>[] = [];

    for (let i = periode - 1; i < data.length; i++) {
      let somme = 0;
      for (let j = i - periode + 1; j <= i; j++) somme += data[j].close;
      const moy = somme / periode;

      let variance = 0;
      for (let j = i - periode + 1; j <= i; j++) variance += (data[j].close - moy) ** 2;
      const ecartType = Math.sqrt(variance / periode);

      moyenne.push({ time: data[i].time, value: moy });
      haute.push({ time: data[i].time, value: moy + k * ecartType });
      basse.push({ time: data[i].time, value: moy - k * ecartType });
    }
    return { haute, moyenne, basse };
  }

  /**
   * RSI (méthode de Wilder) : 100 - 100 / (1 + RS), avec RS = gain moyen / perte moyenne.
   * > 70 : suracheté, < 30 : survendu.
   */
  private calculerRSI(data: CandlestickData<Time>[], periode: number): LineData<Time>[] {
    const res: LineData<Time>[] = [];
    if (data.length <= periode) return res;

    let gains = 0, pertes = 0;
    for (let i = 1; i <= periode; i++) {
      const diff = data[i].close - data[i - 1].close;
      if (diff >= 0) gains += diff; else pertes -= diff;
    }
    let gainMoy = gains / periode;
    let perteMoy = pertes / periode;

    const rsi = () => perteMoy === 0 ? 100 : 100 - 100 / (1 + gainMoy / perteMoy);
    res.push({ time: data[periode].time, value: rsi() });

    for (let i = periode + 1; i < data.length; i++) {
      const diff = data[i].close - data[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const perte = diff < 0 ? -diff : 0;
      gainMoy = (gainMoy * (periode - 1) + gain) / periode;
      perteMoy = (perteMoy * (periode - 1) + perte) / periode;
      res.push({ time: data[i].time, value: rsi() });
    }
    return res;
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
}