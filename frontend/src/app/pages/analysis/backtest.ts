import { Candle, bollinger, macd, rsi, sma } from './indicators';

export type StrategyId = 'sma-cross' | 'rsi' | 'macd' | 'bollinger' | 'hold';
export type Params = Record<string, number>;

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface StrategyDef {
  id: Exclude<StrategyId, 'hold'>;
  name: string;
  description: string;
  color: string;
  params: ParamDef[];
}

export interface Trade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  pnl: number;
  open: boolean;
}

export interface Metrics {
  finalEquity: number;
  returnPct: number;
  buyHoldPct: number;
  maxDrawdown: number;
  sharpe: number;
  trades: number;
  winRate: number;
  profitFactor: number | null;
  avgTradePct: number;
  bestTradePct: number;
  worstTradePct: number;
  exposure: number;
}

export interface BacktestResult {
  times: number[];
  prices: number[];
  equity: number[];
  buyHold: number[];
  drawdown: number[];
  trades: Trade[];
  metrics: Metrics;
}

export const BARS_PER_YEAR: Record<string, number> = { '15m': 35040, '1h': 8760, '4h': 2190, '1d': 365 };

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'sma-cross',
    name: 'Croisement de moyennes',
    description: 'Achat quand la moyenne rapide passe au-dessus de la lente, vente dans le cas inverse.',
    color: '#f59e0b',
    params: [
      { key: 'fast', label: 'Moyenne rapide', min: 5, max: 50, step: 1, value: 20 },
      { key: 'slow', label: 'Moyenne lente', min: 20, max: 200, step: 5, value: 50 },
    ],
  },
  {
    id: 'rsi',
    name: 'RSI (survente / surachat)',
    description: 'Achat quand le RSI passe sous le seuil de survente, vente quand il dépasse le seuil de surachat.',
    color: '#818cf8',
    params: [
      { key: 'period', label: 'Période RSI', min: 5, max: 30, step: 1, value: 14 },
      { key: 'low', label: 'Seuil de survente', min: 10, max: 40, step: 1, value: 30 },
      { key: 'high', label: 'Seuil de surachat', min: 60, max: 90, step: 1, value: 70 },
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    description: 'Achat quand la ligne MACD passe au-dessus de sa ligne de signal, vente dans le cas inverse.',
    color: '#22c55e',
    params: [
      { key: 'fast', label: 'EMA rapide', min: 5, max: 20, step: 1, value: 12 },
      { key: 'slow', label: 'EMA lente', min: 15, max: 50, step: 1, value: 26 },
      { key: 'signal', label: 'Signal', min: 3, max: 15, step: 1, value: 9 },
    ],
  },
  {
    id: 'bollinger',
    name: 'Bandes de Bollinger',
    description: 'Achat quand le prix passe sous la bande basse, vente quand il revient au-dessus de la moyenne.',
    color: '#a78bfa',
    params: [
      { key: 'period', label: 'Période', min: 10, max: 50, step: 1, value: 20 },
      { key: 'k', label: 'Écarts-types', min: 1, max: 3, step: 0.5, value: 2 },
    ],
  },
];

export const defaultParams = (s: StrategyDef): Params =>
  Object.fromEntries(s.params.map(p => [p.key, p.value]));

/** 1 = en position, 0 = hors position, null = indicateur pas encore calculable */
export function signalsFor(id: StrategyId, c: Candle[], p: Params): (0 | 1 | null)[] {
  const close = c.map(x => x.close);
  const out: (0 | 1 | null)[] = new Array(close.length).fill(null);

  switch (id) {
    case 'hold':
      return out.map(() => 1 as const);

    case 'sma-cross': {
      const slow = Math.max(p['slow'], 2);
      const fast = Math.min(p['fast'], slow - 1);
      const f = sma(close, fast);
      const s = sma(close, slow);
      for (let i = 0; i < close.length; i++) {
        if (f[i] !== null && s[i] !== null) out[i] = f[i]! > s[i]! ? 1 : 0;
      }
      break;
    }

    case 'rsi': {
      const r = rsi(close, p['period']);
      let pos: 0 | 1 = 0;
      for (let i = 0; i < close.length; i++) {
        if (r[i] === null) continue;
        if (pos === 0 && r[i]! < p['low']) pos = 1;
        else if (pos === 1 && r[i]! > p['high']) pos = 0;
        out[i] = pos;
      }
      break;
    }

    case 'macd': {
      const slow = Math.max(p['slow'], p['fast'] + 1);
      const m = macd(close, p['fast'], slow, p['signal']);
      for (let i = 0; i < close.length; i++) {
        if (m.line[i] !== null && m.signal[i] !== null) out[i] = m.line[i]! > m.signal[i]! ? 1 : 0;
      }
      break;
    }

    case 'bollinger': {
      const b = bollinger(close, p['period'], p['k']);
      let pos: 0 | 1 = 0;
      for (let i = 0; i < close.length; i++) {
        if (b.lower[i] === null) continue;
        if (pos === 0 && close[i] < b.lower[i]!) pos = 1;
        else if (pos === 1 && close[i] > b.mid[i]!) pos = 0;
        out[i] = pos;
      }
      break;
    }
  }
  return out;
}

const emptyMetrics = (capital: number): Metrics => ({
  finalEquity: capital, returnPct: 0, buyHoldPct: 0, maxDrawdown: 0, sharpe: 0, trades: 0,
  winRate: 0, profitFactor: null, avgTradePct: 0, bestTradePct: 0, worstTradePct: 0, exposure: 0,
});

const emptyResult = (capital: number): BacktestResult => ({
  times: [], prices: [], equity: [], buyHold: [], drawdown: [], trades: [], metrics: emptyMetrics(capital),
});

/**
 * Backtest long-only : on achète à la clôture de la bougie où le signal passe à 1,
 * on vend quand il repasse à 0. `minStart` permet d'aligner plusieurs stratégies
 * sur la même date de départ (comparaison équitable).
 */
export function backtest(
  c: Candle[],
  id: StrategyId,
  p: Params,
  capital: number,
  feePct: number,
  interval = '1h',
  minStart = 0
): BacktestResult {
  const sig = signalsFor(id, c, p);
  const firstValid = sig.findIndex(s => s !== null);
  if (firstValid < 0) return emptyResult(capital);
  const start = Math.max(firstValid, minStart);
  if (c.length - start < 2) return emptyResult(capital);

  const fee = feePct / 100;
  let cash = capital;
  let qty = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryCash = 0;
  let barsInMarket = 0;

  const times: number[] = [];
  const prices: number[] = [];
  const equity: number[] = [];
  const buyHold: number[] = [];
  const trades: Trade[] = [];
  const base = c[start].close;

  for (let i = start; i < c.length; i++) {
    const price = c[i].close;
    const want = sig[i] ?? 0;

    if (want === 1 && qty === 0) {
      entryCash = cash;
      qty = (cash * (1 - fee)) / price;
      cash = 0;
      entryPrice = price;
      entryTime = c[i].time;
    } else if (want === 0 && qty > 0) {
      cash = qty * price * (1 - fee);
      trades.push({
        entryTime, exitTime: c[i].time, entryPrice, exitPrice: price,
        pnlPct: (cash / entryCash - 1) * 100, pnl: cash - entryCash, open: false,
      });
      qty = 0;
    }

    if (qty > 0) barsInMarket++;
    times.push(c[i].time);
    prices.push(price);
    equity.push(qty > 0 ? qty * price : cash);
    buyHold.push((capital * price) / base);
  }

  // Position encore ouverte : on la valorise au dernier prix
  if (qty > 0) {
    const last = c[c.length - 1];
    const value = qty * last.close * (1 - fee);
    trades.push({
      entryTime, exitTime: last.time, entryPrice, exitPrice: last.close,
      pnlPct: (value / entryCash - 1) * 100, pnl: value - entryCash, open: true,
    });
  }

  // Drawdown
  let peak = equity[0];
  const drawdown = equity.map(e => {
    peak = Math.max(peak, e);
    return (e / peak - 1) * 100;
  });

  // Sharpe annualisé
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(BARS_PER_YEAR[interval] ?? 8760) : 0;

  // Statistiques des trades
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const pcts = trades.map(t => t.pnlPct);

  const metrics: Metrics = {
    finalEquity: equity[equity.length - 1],
    returnPct: (equity[equity.length - 1] / capital - 1) * 100,
    buyHoldPct: (buyHold[buyHold.length - 1] / capital - 1) * 100,
    maxDrawdown: Math.min(...drawdown),
    sharpe,
    trades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: trades.length && grossLoss > 0 ? grossWin / grossLoss : null,
    avgTradePct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
    bestTradePct: pcts.length ? Math.max(...pcts) : 0,
    worstTradePct: pcts.length ? Math.min(...pcts) : 0,
    exposure: (barsInMarket / times.length) * 100,
  };

  return { times, prices, equity, buyHold, drawdown, trades, metrics };
}