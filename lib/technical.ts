export type TechnicalPoint = { t: string; p: number };
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
  };
  momentum: {
    rsi14: number | null;
    rsiBias: string;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    macdBias: string;
  };
  supportResistance: {
    supports: number[];
    resistances: number[];
  };
  narrative: string[];
};

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
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
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
  const supports: number[] = [];
  const resistances: number[] = [];
  const tolerance = Math.max(Math.abs(current) * 0.0015, 0.5);
  for (let i = 2; i < values.length - 2; i++) {
    const v = values[i];
    const low = v <= values[i - 1] && v <= values[i - 2] && v <= values[i + 1] && v <= values[i + 2];
    const high = v >= values[i - 1] && v >= values[i - 2] && v >= values[i + 1] && v >= values[i + 2];
    if (low && v < current) supports.push(v);
    if (high && v > current) resistances.push(v);
  }
  const cluster = (levels: number[], direction: "support" | "resistance") => {
    const sorted = [...levels].sort((a, b) => direction === "support" ? b - a : a - b);
    const out: number[] = [];
    for (const level of sorted) {
      if (!out.some((x) => Math.abs(x - level) <= tolerance)) out.push(level);
      if (out.length === 3) break;
    }
    return out.map((x) => Number(x.toFixed(2)));
  };
  return { supports: cluster(supports, "support"), resistances: cluster(resistances, "resistance") };
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
  const r = rsi(values);
  const m = macd(values);
  const sr = price == null ? { supports: [], resistances: [] } : supportResistance(values, price);
  const narrative: string[] = [];
  if (price != null && e20 != null) narrative.push(price > e20 ? "Price is above EMA 20, supporting short-term upside structure." : "Price is below EMA 20, showing short-term pressure.");
  if (price != null && e50 != null) narrative.push(price > e50 ? "Price is above EMA 50, supporting the medium-term trend." : "Price is below EMA 50, showing medium-term weakness.");
  if (price != null && e200 != null) narrative.push(price > e200 ? "Price is above EMA 200, keeping the long-term regime bullish." : "Price is below EMA 200, keeping the long-term regime bearish.");
  if (r != null) narrative.push(r >= 70 ? "RSI is overbought; upside momentum is strong but more vulnerable to a pullback." : r <= 30 ? "RSI is oversold; downside momentum is stretched and a rebound becomes possible." : r >= 50 ? "RSI is above 50, indicating positive momentum." : "RSI is below 50, indicating negative momentum.");
  if (m.line != null && m.signal != null) narrative.push(m.line > m.signal ? "MACD is above its signal line, supporting bullish momentum." : "MACD is below its signal line, supporting bearish momentum.");
  if (sr.supports[0] != null) narrative.push(`Nearest support is ${sr.supports[0].toFixed(2)}.`);
  if (sr.resistances[0] != null) narrative.push(`Nearest resistance is ${sr.resistances[0].toFixed(2)}.`);
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
      bias: bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure",
    },
    momentum: {
      rsi14: r,
      rsiBias: r == null ? "Unavailable" : r >= 70 ? "Overbought" : r <= 30 ? "Oversold" : r >= 50 ? "Bullish momentum" : "Bearish momentum",
      macd: m.line,
      macdSignal: m.signal,
      macdHistogram: m.histogram,
      macdBias: m.line == null || m.signal == null ? "Unavailable" : m.line > m.signal ? "Bullish MACD" : m.line < m.signal ? "Bearish MACD" : "Neutral MACD",
    },
    supportResistance: sr,
    narrative,
  };
}
