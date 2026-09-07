export type TechnicalCandle = { t: string; o: number; h: number; l: number; c: number };
export type Level = { price: number; strength: number; touches: number; distancePct: number };
export type TechnicalAnalysis = {
  price: number | null;
  samples: number;
  ema: { ema20: number | null; ema50: number | null; ema200: number | null; priceVsEma20: "Above" | "Below" | "At" | "Unavailable"; priceVsEma50: "Above" | "Below" | "At" | "Unavailable"; priceVsEma200: "Above" | "Below" | "At" | "Unavailable"; bias: string; interpretation: string };
  momentum: { rsi14: number | null; rsiBias: string; macd: number | null; macdSignal: number | null; macdHistogram: number | null; macdBias: string; interpretation: string };
  volatility: { atr14: number | null; atrPercent: number | null; interpretation: string };
  supportResistance: { supports: Level[]; resistances: Level[]; method: string };
  fibonacci: { swingLow: number | null; swingHigh: number | null; levels: Array<{ ratio: string; price: number }>; interpretation: string };
  volumeProfile: { poc: number | null; highVolumeNodes: number[]; lowVolumeNodes: number[]; interpretation: string };
  patterns: Array<{ name: string; direction: "Bullish" | "Bearish" | "Neutral"; confidence: number; description: string }>;
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

export function rma(values: number[], period: number): number | null {
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
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
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

export function atr(candles: TechnicalCandle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const prev = candles[i - 1];
    tr.push(prev ? Math.max(current.h - current.l, Math.abs(current.h - prev.c), Math.abs(current.l - prev.c)) : current.h - current.l);
  }
  return rma(tr, period);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function supportResistance(candles: TechnicalCandle[], current: number, atrValue = atr(candles, 14)) {
  if (candles.length < 50) return { supports: [], resistances: [], method: "Insufficient candle history for structural support/resistance." };
  const recent = candles.slice(-Math.min(candles.length, 300));
  const range = Math.max(...recent.map(c => c.h)) - Math.min(...recent.map(c => c.l));
  const volatilitySpacing = atrValue ?? current * 0.005;
  const minSeparation = Math.max(range * 0.02, Math.abs(volatilitySpacing) * 0.9, Math.abs(current) * 0.003);
  const pivotWindow = 3;
  const candidates: Array<{ price: number; type: "support" | "resistance" }> = [];
  for (let i = pivotWindow; i < recent.length - pivotWindow; i += 1) {
    const candle = recent[i];
    const left = recent.slice(i - pivotWindow, i);
    const right = recent.slice(i + 1, i + pivotWindow + 1);
    const isSwingLow = left.every(x => candle.l <= x.l) && right.every(x => candle.l <= x.l);
    const isSwingHigh = left.every(x => candle.h >= x.h) && right.every(x => candle.h >= x.h);
    if (isSwingLow && candle.l < current - minSeparation * 0.25) candidates.push({ price: candle.l, type: "support" });
    if (isSwingHigh && candle.h > current + minSeparation * 0.25) candidates.push({ price: candle.h, type: "resistance" });
  }
  const cluster = (type: "support" | "resistance") => {
    const values = candidates.filter(x => x.type === type).map(x => x.price).sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const value of values) {
      const group = groups.find(g => { const center = median(g); return center != null && Math.abs(value - center) <= minSeparation; });
      if (group) group.push(value); else groups.push([value]);
    }
    return groups.map(group => {
      const center = median(group) ?? group[0];
      const distancePct = Math.abs(current - center) / Math.abs(current) * 100;
      const touches = group.length;
      const strength = Math.min(100, Math.round(42 + touches * 12 + (distancePct > 1 ? 5 : 0)));
      return { price: round(center, 2), strength, touches, distancePct: round(distancePct, 2) };
    }).filter(x => x.distancePct >= 0.5).sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  };
  return { supports: cluster("support"), resistances: cluster("resistance"), method: "Swing highs/lows from real OHLC candles, clustered with ATR-aware structural separation; nearest noise is excluded." };
}

export function fibonacci(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-Math.min(candles.length, 250));
  if (recent.length < 30) return { swingLow: null, swingHigh: null, levels: [], interpretation: "Insufficient history for Fibonacci." };
  let high = recent[0].h, low = recent[0].l, highIndex = 0, lowIndex = 0;
  recent.forEach((c, i) => { if (c.h > high) { high = c.h; highIndex = i; } if (c.l < low) { low = c.l; lowIndex = i; } });
  const range = high - low;
  if (!(range > 0)) return { swingLow: low, swingHigh: high, levels: [], interpretation: "No meaningful swing range." };
  const orderedHigh = highIndex > lowIndex;
  const ratios = [0.382, 0.5, 0.618];
  const levels = ratios.map(r => ({ ratio: `${(r * 100).toFixed(1)}%`, price: round(orderedHigh ? high - range * r : low + range * r, 2) }));
  const nearest = [...levels].sort((a, b) => Math.abs(current - a.price) - Math.abs(current - b.price))[0];
  return { swingLow: round(low, 2), swingHigh: round(high, 2), levels, interpretation: nearest ? `Price is nearest to the ${nearest.ratio} Fibonacci retracement at ${nearest.price}.` : "Fibonacci context available." };
}

export function volumeProfile(candles: TechnicalCandle[], bins = 24) {
  if (candles.length < 40) return { poc: null, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "Insufficient candle history for volume profile." };
  const recent = candles.slice(-Math.min(candles.length, 300));
  const min = Math.min(...recent.map(c => c.l));
  const max = Math.max(...recent.map(c => c.h));
  const span = max - min;
  if (!(span > 0)) return { poc: min, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "No meaningful price range." };
  const bucketVolume = Array.from({ length: bins }, () => 0);
  const width = span / bins;
  recent.forEach(c => { const typical = (c.h + c.l + c.c) / 3; const index = Math.max(0, Math.min(bins - 1, Math.floor((typical - min) / width))); bucketVolume[index] += 1; });
  const maxVol = Math.max(...bucketVolume), minVol = Math.min(...bucketVolume), pocIndex = bucketVolume.indexOf(maxVol);
  const highVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v >= maxVol * 0.75).sort((a, b) => b.v - a.v).slice(0, 3).map(x => round(x.p, 2));
  const lowVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v <= minVol + Math.max(1, maxVol * 0.15)).sort((a, b) => a.v - b.v).slice(0, 3).map(x => round(x.p, 2));
  return { poc: round(min + width * (pocIndex + 0.5), 2), highVolumeNodes, lowVolumeNodes, interpretation: "Profile is estimated from completed candle occurrences by price bucket because BiQuote provides CFD data without real exchange volume." };
}

function detectPatterns(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-40);
  const patterns: TechnicalAnalysis["patterns"] = [];
  if (recent.length < 12) return patterns;
  const highs = recent.map(c => c.h), lows = recent.map(c => c.l);
  const last = recent.at(-1)!; const prev = recent.at(-2)!;
  const range = Math.max(...highs) - Math.min(...lows); const eps = Math.max(range * 0.03, current * 0.002);
  const earlyHigh = Math.max(...recent.slice(0, 20).map(c => c.h)); const lateHigh = Math.max(...recent.slice(20).map(c => c.h));
  const earlyLow = Math.min(...recent.slice(0, 20).map(c => c.l)); const lateLow = Math.min(...recent.slice(20).map(c => c.l));
  if (Math.abs(earlyHigh - lateHigh) <= eps && lateLow > earlyLow + eps * 0.5) patterns.push({ name: "Ascending Triangle", direction: "Bullish", confidence: 72, description: "Repeated resistance with rising swing lows." });
  if (Math.abs(earlyLow - lateLow) <= eps && lateHigh < earlyHigh - eps * 0.5) patterns.push({ name: "Descending Triangle", direction: "Bearish", confidence: 72, description: "Repeated support with falling swing highs." });
  const body = Math.abs(last.c - last.o), upperWick = last.h - Math.max(last.o, last.c), lowerWick = Math.min(last.o, last.c) - last.l;
  if (lowerWick > body * 2 && lowerWick > upperWick * 1.5 && last.c >= last.o) patterns.push({ name: "Bullish Rejection", direction: "Bullish", confidence: 68, description: "Long lower wick with a firm close suggests demand near the low." });
  if (upperWick > body * 2 && upperWick > lowerWick * 1.5 && last.c <= last.o) patterns.push({ name: "Bearish Rejection", direction: "Bearish", confidence: 68, description: "Long upper wick with a weak close suggests supply near the high." });
  if (last.c > last.o && prev.c < prev.o && last.o <= prev.c && last.c >= prev.o) patterns.push({ name: "Bullish Engulfing", direction: "Bullish", confidence: 76, description: "Latest candle engulfs the prior bearish candle body." });
  if (last.c < last.o && prev.c > prev.o && last.o >= prev.c && last.c <= prev.o) patterns.push({ name: "Bearish Engulfing", direction: "Bearish", confidence: 76, description: "Latest candle engulfs the prior bullish candle body." });
  return patterns.slice(0, 4);
}

export function analyze(candles: TechnicalCandle[]): TechnicalAnalysis {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = sorted.map(c => c.c).filter(Number.isFinite);
  const price = closes.at(-1) ?? null;
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const relation = (e: number | null): TechnicalAnalysis["ema"]["priceVsEma20"] => price == null || e == null ? "Unavailable" : Math.abs(price - e) < 1e-8 ? "At" : price > e ? "Above" : "Below";
  const bullish = [e20, e50, e200].filter(e => price != null && e != null && price > e).length;
  const bearish = [e20, e50, e200].filter(e => price != null && e != null && price < e).length;
  const emaBias = bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure";
  const emaInterpretation = price == null ? "Price unavailable." : `${emaBias}. Price is ${relation(e20).toLowerCase()} EMA20, ${relation(e50).toLowerCase()} EMA50 and ${relation(e200).toLowerCase()} EMA200.`;
  const rsi14 = rsi(closes, 14);
  const macdValues = macd(closes);
  const rsiBias = rsi14 == null ? "Unavailable" : rsi14 >= 70 ? "Overbought" : rsi14 <= 30 ? "Oversold" : rsi14 >= 50 ? "Bullish momentum" : "Bearish momentum";
  const macdBias = macdValues.histogram == null ? "Unavailable" : macdValues.histogram > 0 ? "Bullish MACD momentum" : macdValues.histogram < 0 ? "Bearish MACD momentum" : "Neutral MACD momentum";
  const momentumInterpretation = `RSI14 is ${rsi14 == null ? "unavailable" : round(rsi14, 2)}; ${macdBias.toLowerCase()}.`;
  const atr14 = atr(sorted, 14);
  const atrPercent = atr14 != null && price ? atr14 / price * 100 : null;
  const volatilityInterpretation = atr14 == null ? "ATR unavailable." : `ATR14 is ${round(atr14, 2)} (${round(atrPercent ?? 0, 2)}% of price).`;
  const sr = supportResistance(sorted, price ?? 0, atr14);
  const fib = fibonacci(sorted, price ?? 0);
  const vp = volumeProfile(sorted);
  const patterns = detectPatterns(sorted, price ?? 0);
  const votes = [
    bullish > bearish ? 1 : bullish < bearish ? -1 : 0,
    rsi14 == null ? 0 : rsi14 >= 50 ? 1 : -1,
    macdValues.histogram == null ? 0 : macdValues.histogram >= 0 ? 1 : -1,
  ];
  const voteSum = votes.reduce((a, b) => a + b, 0) + patterns.reduce((s, p) => s + (p.direction === "Bullish" ? 1 : p.direction === "Bearish" ? -1 : 0), 0);
  const overallBias = voteSum >= 2 ? "Bullish" : voteSum <= -2 ? "Bearish" : "Mixed";
  const overallSummary = `${overallBias} technical posture from EMA structure, RSI, MACD and detected patterns; ATR is used as a volatility regime measure.`;
  return {
    price,
    samples: sorted.length,
    ema: { ema20: e20 == null ? null : round(e20, 4), ema50: e50 == null ? null : round(e50, 4), ema200: e200 == null ? null : round(e200, 4), priceVsEma20: relation(e20), priceVsEma50: relation(e50), priceVsEma200: relation(e200), bias: emaBias, interpretation: emaInterpretation },
    momentum: { rsi14: rsi14 == null ? null : round(rsi14, 4), rsiBias, macd: macdValues.line == null ? null : round(macdValues.line, 4), macdSignal: macdValues.signal == null ? null : round(macdValues.signal, 4), macdHistogram: macdValues.histogram == null ? null : round(macdValues.histogram, 4), macdBias, interpretation: momentumInterpretation },
    volatility: { atr14: atr14 == null ? null : round(atr14, 4), atrPercent: atrPercent == null ? null : round(atrPercent, 4), interpretation: volatilityInterpretation },
    supportResistance: sr,
    fibonacci: fib,
    volumeProfile: vp,
    patterns,
    overall: { bias: overallBias, summary: overallSummary },
  };
}
