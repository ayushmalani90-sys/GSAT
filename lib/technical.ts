export type TechnicalCandle = { t: string; o: number; h: number; l: number; c: number };
export type Level = { price: number; strength: number; touches: number; distancePct: number };
export type TechnicalAnalysis = {
  price: number | null;
  samples: number;
  ema: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    priceVsEma20: "Above" | "Below" | "At" | "Unavailable";
    priceVsEma50: "Above" | "Below" | "At" | "Unavailable";
    priceVsEma200: "Above" | "Below" | "At" | "Unavailable";
    bias: string;
    interpretation: string;
  };
  momentum: {
    rsi14: number | null;
    rsiBias: string;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    macdBias: string;
    interpretation: string;
  };
  supportResistance: { supports: Level[]; resistances: Level[]; method: string };
  overall: { bias: string; summary: string };
};

const round = (v: number, digits = 4) => Number(v.toFixed(digits));

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) current = values[i] * k + current * (1 - k);
  return current;
}

function rma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) current = (current * (period - 1) + values[i]) / period;
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
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macdSeries(values: number[], fastPeriod = 12, slowPeriod = 26): number[] {
  if (values.length < slowPeriod) return [];
  const fastK = 2 / (fastPeriod + 1);
  const slowK = 2 / (slowPeriod + 1);
  let fast = values.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let slow = values.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  const series: number[] = [];

  for (let i = fastPeriod; i < slowPeriod; i += 1) fast = values[i] * fastK + fast * (1 - fastK);
  series.push(fast - slow);

  for (let i = slowPeriod; i < values.length; i += 1) {
    fast = values[i] * fastK + fast * (1 - fastK);
    slow = values[i] * slowK + slow * (1 - slowK);
    series.push(fast - slow);
  }
  return series;
}

export function macd(values: number[]) {
  const series = macdSeries(values, 12, 26);
  if (!series.length) return { line: null, signal: null, histogram: null };
  const line = series.at(-1) ?? null;
  const signal = ema(series, 9);
  return { line, signal, histogram: line != null && signal != null ? line - signal : null };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function supportResistance(candles: TechnicalCandle[], current: number) {
  if (candles.length < 50) {
    return { supports: [], resistances: [], method: "Insufficient candle history for structural support/resistance." };
  }
  const recent = candles.slice(-Math.min(candles.length, 300));
  const range = Math.max(...recent.map((c) => c.h)) - Math.min(...recent.map((c) => c.l));
  const minSeparation = Math.max(range * 0.02, Math.abs(current) * 0.003);
  const pivotWindow = 3;
  const candidates: Array<{ price: number; type: "support" | "resistance" }> = [];

  for (let i = pivotWindow; i < recent.length - pivotWindow; i += 1) {
    const candle = recent[i];
    const left = recent.slice(i - pivotWindow, i);
    const right = recent.slice(i + 1, i + pivotWindow + 1);
    const isSwingLow = left.every((x) => candle.l <= x.l) && right.every((x) => candle.l <= x.l);
    const isSwingHigh = left.every((x) => candle.h >= x.h) && right.every((x) => candle.h >= x.h);
    if (isSwingLow && candle.l < current) candidates.push({ price: candle.l, type: "support" });
    if (isSwingHigh && candle.h > current) candidates.push({ price: candle.h, type: "resistance" });
  }

  const cluster = (type: "support" | "resistance") => {
    const values = candidates.filter((x) => x.type === type).map((x) => x.price).sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const value of values) {
      const group = groups.find((g) => {
        const center = median(g);
        return center != null && Math.abs(value - center) <= minSeparation;
      });
      if (group) group.push(value); else groups.push([value]);
    }

    return groups
      .map((group) => {
        const center = median(group) ?? group[0];
        const distancePct = Math.abs(current - center) / Math.abs(current) * 100;
        const touches = group.length;
        const strength = Math.min(100, Math.round(40 + touches * 14));
        return { price: round(center, 2), strength, touches, distancePct: round(distancePct, 2) };
      })
      .filter((x) => x.distancePct >= 0.5)
      .sort((a, b) => a.distancePct - b.distancePct)
      .slice(0, 3);
  };

  return {
    supports: cluster("support"),
    resistances: cluster("resistance"),
    method: "Swing highs/lows from real OHLC candles, clustered into structural zones with a minimum separation filter; nearest noise is excluded.",
  };
}

export function analyze(candles: TechnicalCandle[]): TechnicalAnalysis {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = sorted.map((c) => c.c).filter(Number.isFinite);
  const price = closes.at(-1) ?? null;
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const relation = (e: number | null): TechnicalAnalysis["ema"]["priceVsEma20"] =>
    price == null || e == null ? "Unavailable" : Math.abs(price - e) < 1e-8 ? "At" : price > e ? "Above" : "Below";
  const bullish = [e20, e50, e200].filter((e) => price != null && e != null && price > e).length;
  const bearish = [e20, e50, e200].filter((e) => price != null && e != null && price < e).length;
  const emaBias = bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure";
  const emaInterpretation = emaBias.startsWith("Bullish")
    ? "Price is above most available EMAs, favoring upside structure."
    : emaBias.startsWith("Bearish")
      ? "Price is below most available EMAs, favoring downside structure."
      : "Price is mixed around the available EMAs.";
  const rr = rsi(closes, 14);
  const mm = macd(closes);
  const rsiBias = rr == null ? "Unavailable" : rr >= 70 ? "Overbought" : rr <= 30 ? "Oversold" : rr >= 55 ? "Bullish momentum" : rr <= 45 ? "Bearish momentum" : "Neutral momentum";
  const macdBias = mm.line == null || mm.signal == null ? "Unavailable" : mm.line > mm.signal ? "Bullish MACD" : mm.line < mm.signal ? "Bearish MACD" : "Neutral MACD";
  const sr = price == null ? { supports: [], resistances: [], method: "No candle series available." } : supportResistance(sorted, price);
  const technicalScore = (emaBias.startsWith("Bullish") ? 1 : emaBias.startsWith("Bearish") ? -1 : 0) + (rsiBias.startsWith("Bullish") ? 1 : rsiBias.startsWith("Bearish") ? -1 : 0) + (macdBias.startsWith("Bullish") ? 1 : macdBias.startsWith("Bearish") ? -1 : 0);
  const overallBias = technicalScore >= 2 ? "Bullish" : technicalScore <= -2 ? "Bearish" : "Neutral / Mixed";
  const summary = overallBias === "Bullish"
    ? "EMA structure, RSI and MACD are collectively favoring upside momentum."
    : overallBias === "Bearish"
      ? "EMA structure, RSI and MACD are collectively favoring downside pressure."
      : "EMA structure, RSI and MACD are mixed; confirmation is preferred.";
  return {
    price,
    samples: closes.length,
    ema: {
      ema20: e20,
      ema50: e50,
      ema200: e200,
      priceVsEma20: relation(e20),
      priceVsEma50: relation(e50),
      priceVsEma200: relation(e200),
      bias: emaBias,
      interpretation: emaInterpretation,
    },
    momentum: {
      rsi14: rr,
      rsiBias,
      macd: mm.line,
      macdSignal: mm.signal,
      macdHistogram: mm.histogram,
      macdBias,
      interpretation: `${rsiBias}; ${macdBias}.`,
    },
    supportResistance: sr,
    overall: { bias: overallBias, summary },
  };
}
