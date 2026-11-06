export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Series = (number | null)[];

export const sma = (v: number[], p: number): Series =>
  v.map((_, i) => (i < p - 1 ? null : v.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p));

export const ema = (v: number[], p: number): Series => {
  const k = 2 / (p + 1);
  const out: Series = [];
  let prev: number | null = null;
  v.forEach((x, i) => {
    if (i < p - 1) { out.push(null); return; }
    prev = prev === null ? v.slice(0, p).reduce((a, b) => a + b, 0) / p : x * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
};

export const rsi = (c: number[], p = 14): Series => {
  const out: Series = new Array(c.length).fill(null);
  if (c.length <= p) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = c[i] - c[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / p, al = loss / p;
  out[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
};

export const macd = (c: number[], fast = 12, slow = 26, sig = 9) => {
  const ef = ema(c, fast);
  const es = ema(c, slow);
  const line: Series = c.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i]! - es[i]! : null));
  const valid = line.filter(x => x !== null) as number[];
  const sigV = ema(valid, sig);
  const offset = line.length - valid.length;
  const signal: Series = line.map((_, i) => (i < offset ? null : sigV[i - offset]));
  const hist: Series = line.map((x, i) => (x !== null && signal[i] !== null ? x - signal[i]! : null));
  return { line, signal, hist };
};

export const bollinger = (c: number[], p = 20, k = 2) => {
  const mid = sma(c, p);
  const band = (sign: number): Series =>
    c.map((_, i) => {
      if (mid[i] === null) return null;
      const m = mid[i]!;
      const sl = c.slice(i - p + 1, i + 1);
      const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / p);
      return m + sign * k * sd;
    });
  return { mid, upper: band(1), lower: band(-1) };
};