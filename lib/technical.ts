export type TechnicalPoint = { t: string; p: number };
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

const round = (v: number) => Number(v.toFixed(4));
const roundPrice = (v: number) => Number(v.toFixed(2));

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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
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
  return {
    line,
    signal,
    histogram: line != null && signal != null ? line - signal : null,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function supportResistance(values: number[], current: number) {
  if (values.length < 20) {
    return { supports: [], resistances: [], method: "Insufficient history for structural support/resistance." };
  }

  const recent = values.slice(-Math.min(values.length, 240));
  const range = Math.max(...recent) - Math.min(...recent);
  const noise = range > 0 ? range * 0.03 : Math.abs(current) * 0.001;
  const window = 3;
  const pivotLevels: Array<{ price: number; type: "support" | "resistance" }> = [];

  for (let i = window; i < recent.length - window; i += 1) {
    const v = recent[i];
    const left = recent.slice(i - window, i);
    const right = recent.slice(i + 1, i + window + 1);
    const isLow = left.every((x) => v <= x) && right.every((x) => v <= x) && v < current;
    const isHigh = left.every((x) => v >= x) && right.every((x) => v >= x) && v > current;
    if (isLow) pivotLevels.push({ price: v, type: "support" });
    if (isHigh) pivotLevels.push({ price: v, type: "resistance" });
  }

  const cluster = (type: "support" | "resistance") => {
    const items = pivotLevels.filter((x) => x.type === type);
    const groups: number[][] = [];
    for (const item of items) {
      const existing = groups.find((g) => {
        const center = median(g);
        return center != null && Math.abs(center - item.price) <= Math.max(noise, Math.abs(center) * 0.0006);
      });
      if (existing) existing.push(item.price);
      else groups.push([item.price]);
    }

    return groups
      .map((g) => {
        const center = median(g) ?? g[0];
        const touches = g.length;
        const distancePct = Math.abs(current - center) / Math.abs(current) * 100;
        const strength = Math.min(100, Math.round(45 + touches * 15 + Math.min(distancePct, 5) * 2));
        return { price: roundPrice(center), strength, touches, distancePct: Number(distancePct.toFixed(2)) };
      })
      .filter((x) => x.distancePct >= 0.25)
      .sort((a, b) => a.distancePct - b.distancePct)
      .slice(0, 3);
  };

  return {
    supports: cluster("support"),
    resistances: cluster("resistance"),
    method: "Three-candle swing pivots from recent intraday structure, clustered into meaningful zones and filtered to avoid levels too close to current price.",
  };
}

export function analyze(points: TechnicalPoint[]): TechnicalAnalysis {
  const sorted = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const values = sorted.map((p) => p.p).filter(Number.isFinite);
  const price = values.at(-1) ?? null;
  const e20 = ema(values, 20);
  const e50 = ema(values, 50);
  const e200 = ema(values, 200);
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

  const rr = rsi(values, 14);
  const mm = macd(values);
  const rsiBias = rr == null ? "Unavailable" : rr >= 70 ? "Overbought" : rr <= 30 ? "Oversold" : rr >= 55 ? "Bullish momentum" : rr <= 45 ? "Bearish momentum" : "Neutral momentum";
  const macdBias = mm.line == null || mm.signal == null ? "Unavailable" : mm.line > mm.signal ? "Bullish MACD" : mm.line < mm.signal ? "Bearish MACD" : "Neutral MACD";
  const sr = price == null ? { supports: [], resistances: [], method: "No price series available." } : supportResistance(values, price);
  const technicalScore = (emaBias.startsWith("Bullish") ? 1 : emaBias.startsWith("Bearish") ? -1 : 0) + (rsiBias.startsWith("Bullish") ? 1 : rsiBias.startsWith("Bearish") ? -1 : 0) + (macdBias.startsWith("Bullish") ? 1 : macdBias.startsWith("Bearish") ? -1 : 0);
  const overallBias = technicalScore >= 2 ? "Bullish" : technicalScore <= -2 ? "Bearish" : "Neutral / Mixed";
  const summary = overallBias === "Bullish"
    ? "EMA structure, RSI and MACD are collectively favoring upside momentum."
    : overallBias === "Bearish"
      ? "EMA structure, RSI and MACD are collectively favoring downside pressure."
      : "EMA structure, RSI and MACD are mixed; confirmation is preferred.";

  return {
    price,
    samples: values.length,
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
