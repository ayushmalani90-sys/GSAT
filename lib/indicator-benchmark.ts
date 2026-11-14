export type ReferenceCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type CoreIndicatorValues = {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
};

type MetricComparison = {
  actual: number | null;
  reference: number | null;
  absoluteDifference: number | null;
  status: "match" | "mismatch" | "unavailable";
};

function meanOfFirst(values: number[], count: number): number | null {
  if (count < 1 || values.length < count) return null;
  let total = 0;
  for (let i = 0; i < count; i += 1) total += values[i];
  return total / count;
}

function referenceEma(values: number[], period: number): number | null {
  let state = meanOfFirst(values, period);
  if (state == null) return null;
  const factor = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    state += factor * (values[i] - state);
  }
  return state;
}

function referenceWilder(values: number[], period: number): number | null {
  let state = meanOfFirst(values, period);
  if (state == null) return null;
  for (let i = period; i < values.length; i += 1) {
    state += (values[i] - state) / period;
  }
  return state;
}

function referenceEmaSeries(values: number[], period: number): Array<number | null> {
  const series: Array<number | null> = Array(values.length).fill(null);
  let state = meanOfFirst(values, period);
  if (state == null) return series;
  series[period - 1] = state;
  const factor = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    state += factor * (values[i] - state);
    series[i] = state;
  }
  return series;
}

function referenceRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  const upward: number[] = [];
  const downward: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    upward.push(change > 0 ? change : 0);
    downward.push(change < 0 ? -change : 0);
  }
  const averageUp = referenceWilder(upward, period);
  const averageDown = referenceWilder(downward, period);
  if (averageUp == null || averageDown == null) return null;
  if (averageDown === 0) return averageUp === 0 ? 50 : 100;
  if (averageUp === 0) return 0;
  const relativeStrength = averageUp / averageDown;
  return 100 - 100 / (1 + relativeStrength);
}

function referenceMacd(closes: number[]) {
  const fast = referenceEmaSeries(closes, 12);
  const slow = referenceEmaSeries(closes, 26);
  const line: number[] = [];
  for (let i = 25; i < closes.length; i += 1) {
    if (fast[i] != null && slow[i] != null) line.push(fast[i]! - slow[i]!);
  }
  let signal = meanOfFirst(line, 9);
  if (signal == null) return { line: null, signal: null, histogram: null };
  const factor = 2 / 10;
  for (let i = 9; i < line.length; i += 1) {
    signal += factor * (line[i] - signal);
  }
  const currentLine = line[line.length - 1] ?? null;
  return {
    line: currentLine,
    signal,
    histogram: currentLine == null ? null : currentLine - signal,
  };
}

function referenceAtr(candles: ReferenceCandle[], period = 14): number | null {
  const trueRanges: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const previousClose = i > 0 ? candles[i - 1].c : null;
    const range = previousClose == null
      ? current.h - current.l
      : Math.max(
          current.h - current.l,
          Math.abs(current.h - previousClose),
          Math.abs(current.l - previousClose),
        );
    trueRanges.push(range);
  }
  return referenceWilder(trueRanges, period);
}

/**
 * A deliberately separate implementation of the standard core formulas.
 * It does not import GSAT's production indicator functions.
 */
export function calculateIndependentIndicatorReference(input: ReferenceCandle[]): CoreIndicatorValues {
  const candles = [...input]
    .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = candles.map((c) => c.c);
  const macd = referenceMacd(closes);
  return {
    ema20: referenceEma(closes, 20),
    ema50: referenceEma(closes, 50),
    ema200: referenceEma(closes, 200),
    rsi14: referenceRsi(closes, 14),
    macd: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    atr14: referenceAtr(candles, 14),
  };
}

export function compareCoreIndicatorValues(
  actual: CoreIndicatorValues,
  reference: CoreIndicatorValues,
  absoluteTolerance = 1e-8,
) {
  const keys = Object.keys(actual) as Array<keyof CoreIndicatorValues>;
  const metrics = {} as Record<keyof CoreIndicatorValues, MetricComparison>;
  let matchedCount = 0;
  let mismatchCount = 0;
  let unavailableCount = 0;
  let maxAbsoluteDifference = 0;

  for (const key of keys) {
    const a = actual[key];
    const r = reference[key];
    if (a == null && r == null) {
      metrics[key] = { actual: null, reference: null, absoluteDifference: null, status: "unavailable" };
      unavailableCount += 1;
      continue;
    }
    if (a == null || r == null) {
      metrics[key] = { actual: a, reference: r, absoluteDifference: null, status: "mismatch" };
      mismatchCount += 1;
      continue;
    }
    const difference = Math.abs(a - r);
    maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference);
    const status = difference <= absoluteTolerance ? "match" : "mismatch";
    metrics[key] = { actual: a, reference: r, absoluteDifference: difference, status };
    if (status === "match") matchedCount += 1;
    else mismatchCount += 1;
  }

  return {
    status: mismatchCount > 0 ? "fail" as const : unavailableCount > 0 ? "incomplete" as const : "pass" as const,
    absoluteTolerance,
    matchedCount,
    mismatchCount,
    unavailableCount,
    maxAbsoluteDifference,
    metrics,
    note: "Independent formula parity on identical candle inputs; unavailable indicators are reported separately from mismatches.",
  };
}
