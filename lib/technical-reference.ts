export type TechnicalCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
};

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

const smaSeed = (values: number[], period: number) =>
  values.length < period ? null : values.slice(0, period).reduce((a, b) => a + b, 0) / period;

export function ema(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  let current = smaSeed(values, period);
  if (current == null) return null;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) current = alpha * values[i] + (1 - alpha) * current;
  return current;
}

export function rma(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  let current = smaSeed(values, period);
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
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (values.length < slowPeriod) return { line: null, signal: null, histogram: null };

  const alphaFast = 2 / (fastPeriod + 1);
  const alphaSlow = 2 / (slowPeriod + 1);
  let fast = smaSeed(values, fastPeriod);
  let slow = smaSeed(values, slowPeriod);
  if (fast == null || slow == null) return { line: null, signal: null, histogram: null };

  for (let i = fastPeriod; i < slowPeriod; i += 1) fast = alphaFast * values[i] + (1 - alphaFast) * fast;

  const lineSeries: number[] = [fast - slow];
  for (let i = slowPeriod; i < values.length; i += 1) {
    fast = alphaFast * values[i] + (1 - alphaFast) * fast;
    slow = alphaSlow * values[i] + (1 - alphaSlow) * slow;
    lineSeries.push(fast - slow);
  }

  const signal = ema(lineSeries, signalPeriod);
  const line = lineSeries.at(-1) ?? null;
  return {
    line,
    signal,
    histogram: line != null && signal != null ? line - signal : null,
  };
}

export function trueRanges(candles: TechnicalCandle[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    result.push(
      previous == null
        ? current.h - current.l
        : Math.max(
            current.h - current.l,
            Math.abs(current.h - previous.c),
            Math.abs(current.l - previous.c),
          ),
    );
  }
  return result;
}

export function atr(candles: TechnicalCandle[], period = 14): number | null {
  if (candles.length <= period) return null;
  return rma(trueRanges(candles), period);
}

export function calculateIndicators(candles: TechnicalCandle[]): IndicatorSeries {
  const closes = candles.map((c) => c.c);
  const m = macd(closes, 12, 26, 9);
  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    macd: m.line,
    macdSignal: m.signal,
    macdHistogram: m.histogram,
    atr14: atr(candles, 14),
  };
}
