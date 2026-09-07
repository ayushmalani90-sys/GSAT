export type TechnicalCandle = { t: string; o: number; h: number; l: number; c: number; volume?: number; tickVolume?: number };

export type IndicatorSeries = {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
};

function valid(v: number): boolean { return Number.isFinite(v); }

function sma(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  return values.slice(0, period).reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  let current = sma(values, period);
  if (current == null) return null;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) current = alpha * values[i] + (1 - alpha) * current;
  return current;
}

export function rma(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  let current = sma(values, period);
  if (current == null) return null;
  for (let i = period; i < values.length; i += 1) current = ((period - 1) * current + values[i]) / period;
  return current;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }
  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);
  if (avgGain == null || avgLoss == null) return null;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function emaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  let current = sma(values, period);
  if (current == null) return out;
  out[period - 1] = current;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    current = alpha * values[i] + (1 - alpha) * current;
    out[i] = current;
  }
  return out;
}

export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (values.length < slowPeriod) return { line: null, signal: null, histogram: null };

  const fastSeries = emaSeries(values, fastPeriod);
  const slowSeries = emaSeries(values, slowPeriod);
  const lineSeries: number[] = [];

  for (let i = slowPeriod - 1; i < values.length; i += 1) {
    const fast = fastSeries[i];
    const slow = slowSeries[i];
    if (fast != null && slow != null) lineSeries.push(fast - slow);
  }

  if (!lineSeries.length) return { line: null, signal: null, histogram: null };

  // The signal EMA must be seeded from the first complete MACD line value
  // and then recursively updated across the full MACD series.
  const signal = ema(lineSeries, signalPeriod);
  const line = lineSeries.at(-1) ?? null;
  return { line, signal, histogram: line != null && signal != null ? line - signal : null };
}

export function trueRanges(candles: TechnicalCandle[]): number[] {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return sorted.map((current, i) => {
    const previous = sorted[i - 1];
    if (!previous) return current.h - current.l;
    return Math.max(current.h - current.l, Math.abs(current.h - previous.c), Math.abs(current.l - previous.c));
  }).filter(valid);
}

export function atr(candles: TechnicalCandle[], period = 14): number | null {
  const tr = trueRanges(candles);
  return rma(tr, period);
}

export function calculateIndicators(candles: TechnicalCandle[]): IndicatorSeries {
  const sorted = [...candles]
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .filter((c) => [c.o, c.h, c.l, c.c].every(valid));
  const closes = sorted.map((c) => c.c);
  const m = macd(closes, 12, 26, 9);
  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    macd: m.line,
    macdSignal: m.signal,
    macdHistogram: m.histogram,
    atr14: atr(sorted, 14),
  };
}
