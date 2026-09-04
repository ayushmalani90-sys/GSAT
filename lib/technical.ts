export type TechnicalPoint = { t: string; p: number };
export type Level = { price: number; strength: number; touches: number };
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

const round = (v: number) => Number(v.toFixed(2));

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) current = values[i] * k + current * (1 - k);
  return current;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(values: number[]) {
  const series: number[] = [];
  for (let i = 1; i <= values.length; i++) {
    const fast = ema(values.slice(0, i), 12);
    const slow = ema(values.slice(0, i), 26);
    if (fast != null && slow != null) series.push(fast - slow);
  }
  if (!series.length) return { line: null, signal: null, histogram: null };
  const line = series.at(-1) ?? null;
  const signal = ema(series, 9);
  return { line, signal, histogram: line != null && signal != null ? line - signal : null };
}

export function supportResistance(values: number[], current: number) {
  const tolerance = Math.max(Math.abs(current) * 0.0015, 0.5);
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = 2; i < values.length - 2; i++) {
    const v = values[i];
    const low = v <= values[i - 1] && v <= values[i - 2] && v <= values[i + 1] && v <= values[i + 2];
    const high = v >= values[i - 1] && v >= values[i - 2] && v >= values[i + 1] && v >= values[i + 2];
    if (low && v < current) supports.push(v);
    if (high && v > current) resistances.push(v);
  }
  const cluster = (levels: number[], direction: "support" | "resistance") => {
    const ordered = [...levels].sort((a, b) => direction === "support" ? b - a : a - b);
    const groups: number[][] = [];
    for (const v of ordered) {
      const idx = groups.findIndex((g) => Math.abs(g[0] - v) <= tolerance);
      if (idx >= 0) groups[idx].push(v); else groups.push([v]);
    }
    return groups.map((g) => {
      const price = g.reduce((a, b) => a + b, 0) / g.length;
      const touches = g.length;
      const strength = Math.min(100, 45 + touches * 12);
      return { price: round(price), strength: Math.round(strength), touches };
    }).sort((a, b) => direction === "support" ? b.price - a.price : a.price - b.price).slice(0, 3);
  };
  return { supports: cluster(supports, "support"), resistances: cluster(resistances, "resistance"), method: "Five-point swing pivots clustered within adaptive price tolerance; repeated nearby pivots increase strength." };
}

export function analyze(points: TechnicalPoint[]): TechnicalAnalysis {
  const values = points.map((p) => p.p).filter(Number.isFinite);
  const price = values.at(-1) ?? null;
  const e20 = ema(values, 20);
  const e50 = ema(values, 50);
  const e200 = ema(values, 200);
  const relation = (e: number | null): TechnicalAnalysis["ema"]["priceVsEma20"] => price == null || e == null ? "Unavailable" : price > e ? "Above" : price < e ? "Below" : "At";
  const bullish = [e20, e50, e200].filter((e) => price != null && e != null && price > e).length;
  const bearish = [e20, e50, e200].filter((e) => price != null && e != null && price < e).length;
  const emaBias = bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure";
  const emaInterpretation = emaBias.startsWith("Bullish") ? "Price is above most available EMAs, favoring upside structure." : emaBias.startsWith("Bearish") ? "Price is below most available EMAs, favoring downside structure." : "Price is mixed around the available EMAs.";
  const rr = rsi(values);
  const mm = macd(values);
  const rsiBias = rr == null ? "Unavailable" : rr >= 70 ? "Overbought" : rr <= 30 ? "Oversold" : rr >= 55 ? "Bullish momentum" : rr <= 45 ? "Bearish momentum" : "Neutral momentum";
  const macdBias = mm.line == null || mm.signal == null ? "Unavailable" : mm.line > mm.signal ? "Bullish MACD" : mm.line < mm.signal ? "Bearish MACD" : "Neutral MACD";
  const sr = price == null ? { supports: [], resistances: [], method: "No price series available." } : supportResistance(values, price);
  const technicalScore = (emaBias.startsWith("Bullish") ? 1 : emaBias.startsWith("Bearish") ? -1 : 0) + (rsiBias.startsWith("Bullish") ? 1 : rsiBias.startsWith("Bearish") ? -1 : 0) + (macdBias.startsWith("Bullish") ? 1 : macdBias.startsWith("Bearish") ? -1 : 0);
  const overallBias = technicalScore >= 2 ? "Bullish" : technicalScore <= -2 ? "Bearish" : "Neutral / Mixed";
  const summary = overallBias === "Bullish" ? "EMA structure, RSI and MACD are collectively favoring upside momentum." : overallBias === "Bearish" ? "EMA structure, RSI and MACD are collectively favoring downside pressure." : "EMA structure, RSI and MACD are mixed; confirmation is preferred.";
  return {
    price,
    samples: values.length,
    ema: { ema20: e20, ema50: e50, ema200: e200, priceVsEma20: relation(e20), priceVsEma50: relation(e50), priceVsEma200: relation(e200), bias: emaBias, interpretation: emaInterpretation },
    momentum: { rsi14: rr, rsiBias, macd: mm.line, macdSignal: mm.signal, macdHistogram: mm.histogram, macdBias, interpretation: `${rsiBias}; ${macdBias}.` },
    supportResistance: sr,
    overall: { bias: overallBias, summary },
  };
}
