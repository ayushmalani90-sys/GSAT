export type TechnicalCandle = { t: string; o: number; h: number; l: number; c: number };
export type Level = { price: number; strength: number; touches: number; distancePct: number };
export type Zone = { low: number; high: number; strength: number; touches: number; distancePct: number };
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
  volatility: {
    atr14: number | null;
    atrPercent: number | null;
    interpretation: string;
  };
  supportResistance: {
    supports: Level[];
    resistances: Level[];
    method: string;
  };
  fibonacci: {
    swingLow: number | null;
    swingHigh: number | null;
    levels: Array<{ ratio: string; price: number }>;
    interpretation: string;
  };
  volumeProfile: {
    poc: number | null;
    highVolumeNodes: number[];
    lowVolumeNodes: number[];
    interpretation: string;
  };
  patterns: Array<{
    name: string;
    direction: "Bullish" | "Bearish" | "Neutral";
    confidence: number;
    description: string;
  }>;
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

export function atr(candles: TechnicalCandle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const prev = candles[i - 1];
    if (!prev) {
      tr.push(current.h - current.l);
      continue;
    }
    tr.push(Math.max(current.h - current.l, Math.abs(current.h - prev.c), Math.abs(current.l - prev.c)));
  }
  return rma(tr, period);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function supportResistance(candles: TechnicalCandle[], current: number, atrValue = atr(candles, 14)) {
  if (candles.length < 50) {
    return { supports: [], resistances: [], method: "Insufficient candle history for structural support/resistance." };
  }
  const recent = candles.slice(-Math.min(candles.length, 300));
  const range = Math.max(...recent.map((c) => c.h)) - Math.min(...recent.map((c) => c.l));
  const volatilitySpacing = atrValue ?? current * 0.005;
  const minSeparation = Math.max(range * 0.02, Math.abs(volatilitySpacing) * 0.9, Math.abs(current) * 0.003);
  const zoneHalfWidth = Math.max(Math.abs(volatilitySpacing) * 0.18, Math.abs(current) * 0.0008);
  const pivotWindow = 3;
  const candidates: Array<{ price: number; type: "support" | "resistance" }> = [];

  for (let i = pivotWindow; i < recent.length - pivotWindow; i += 1) {
    const candle = recent[i];
    const left = recent.slice(i - pivotWindow, i);
    const right = recent.slice(i + 1, i + pivotWindow + 1);
    const isSwingLow = left.every((x) => candle.l <= x.l) && right.every((x) => candle.l <= x.l);
    const isSwingHigh = left.every((x) => candle.h >= x.h) && right.every((x) => candle.h >= x.h);
    if (isSwingLow && candle.l < current - minSeparation * 0.25) candidates.push({ price: candle.l, type: "support" });
    if (isSwingHigh && candle.h > current + minSeparation * 0.25) candidates.push({ price: candle.h, type: "resistance" });
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
        const strength = Math.min(100, Math.round(42 + touches * 12 + (distancePct > 1 ? 5 : 0)));
        return { price: round(center, 2), strength, touches, distancePct: round(distancePct, 2), _halfWidth: zoneHalfWidth };
      })
      .filter((x) => x.distancePct >= 0.5)
      .sort((a, b) => a.distancePct - b.distancePct)
      .slice(0, 3)
      .map(({ _halfWidth, ...level }) => level);
  };

  return {
    supports: cluster("support"),
    resistances: cluster("resistance"),
    method: "Swing highs/lows from real OHLC candles, clustered with ATR-aware structural separation; nearest noise is excluded.",
  };
}

export function fibonacci(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-Math.min(candles.length, 250));
  if (recent.length < 30) return { swingLow: null, swingHigh: null, levels: [], interpretation: "Insufficient history for Fibonacci." };
  let high = recent[0].h;
  let low = recent[0].l;
  let highIndex = 0;
  let lowIndex = 0;
  recent.forEach((c, i) => {
    if (c.h > high) { high = c.h; highIndex = i; }
    if (c.l < low) { low = c.l; lowIndex = i; }
  });
  const orderedHigh = highIndex > lowIndex;
  const range = high - low;
  if (!(range > 0)) return { swingLow: low, swingHigh: high, levels: [], interpretation: "No meaningful swing range." };
  const ratios = [0.382, 0.5, 0.618];
  const levels = ratios.map((r) => ({ ratio: `${(r * 100).toFixed(1)}%`, price: round(orderedHigh ? high - range * r : low + range * r, 2) }));
  const nearest = [...levels].sort((a, b) => Math.abs(current - a.price) - Math.abs(current - b.price))[0];
  return {
    swingLow: round(low, 2),
    swingHigh: round(high, 2),
    levels,
    interpretation: nearest ? `Price is nearest to the ${nearest.ratio} Fibonacci retracement at ${nearest.price}.` : "Fibonacci context available.",
  };
}

export function volumeProfile(candles: TechnicalCandle[], bins = 24) {
  if (candles.length < 40) return { poc: null, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "Insufficient candle history for volume profile." };
  const recent = candles.slice(-Math.min(candles.length, 300));
  const lows = recent.map((c) => c.l);
  const highs = recent.map((c) => c.h);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min;
  if (!(span > 0)) return { poc: min, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "No meaningful price range." };
  const bucketVolume = Array.from({ length: bins }, () => 0);
  const width = span / bins;
  recent.forEach((c) => {
    const typical = (c.h + c.l + c.c) / 3;
    const index = Math.max(0, Math.min(bins - 1, Math.floor((typical - min) / width)));
    bucketVolume[index] += 1;
  });
  const maxVol = Math.max(...bucketVolume);
  const minVol = Math.min(...bucketVolume);
  const pocIndex = bucketVolume.indexOf(maxVol);
  const highVolumeNodes = bucketVolume
    .map((v, i) => ({ v, p: min + width * (i + 0.5) }))
    .filter((x) => x.v >= maxVol * 0.75)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => round(x.p, 2));
  const lowVolumeNodes = bucketVolume
    .map((v, i) => ({ v, p: min + width * (i + 0.5) }))
    .filter((x) => x.v <= minVol + Math.max(1, maxVol * 0.15))
    .sort((a, b) => a.v - b.v)
    .slice(0, 3)
    .map((x) => round(x.p, 2));
  return {
    poc: round(min + width * (pocIndex + 0.5), 2),
    highVolumeNodes,
    lowVolumeNodes,
    interpretation: "Profile is estimated from completed candle occurrences by price bucket because BiQuote provides CFD data without real exchange volume.",
  };
}

function detectPatterns(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-40);
  const patterns: TechnicalAnalysis["patterns"] = [];
  if (recent.length < 12) return patterns;
  const highs = recent.map((c) => c.h);
  const lows = recent.map((c) => c.l);
  const last = recent.at(-1)!;
  const prev = recent.at(-2)!;
  const range = Math.max(...highs) - Math.min(...lows);
  const eps = Math.max(range * 0.03, current * 0.002);

  const earlyHigh = Math.max(...recent.slice(0, 20).map((c) => c.h));
  const lateHigh = Math.max(...recent.slice(20).map((c) => c.h));
  const earlyLow = Math.min(...recent.slice(0, 20).map((c) => c.l));
  const lateLow = Math.min(...recent.slice(20).map((c) => c.l));
  if (Math.abs(earlyHigh - lateHigh) <= eps && lateLow > earlyLow + eps * 0.5) {
    patterns.push({ name: "Ascending Triangle", direction: "Bullish", confidence: 72, description: "Repeated resistance with rising swing lows." });
  }
  if (Math.abs(earlyLow - lateLow) <= eps && lateHigh < earlyHigh - eps * 0.5) {
    patterns.push({ name: "Descending Triangle", direction: "Bearish", confidence: 72, description: "Repeated support with falling swing highs." });
  }
  const body = Math.abs(last.c - last.o);
  const upperWick = last.h - Math.max(last.o, last.c);
  const lowerWick = Math.min(last.o, last.c) - last.l;
  if (lowerWick > body * 2 && lowerWick > upperWick * 1.5 && last.c >= last.o) {
    patterns.push({ name: "Bullish Rejection", direction: "Bullish", confidence: 68, description: "Long lower wick with a firm close suggests demand near the low." });
  }
  if (upperWick > body * 2 && upperWick > lowerWick * 1.5 && last.c <= last.o) {
    patterns.push({ name: "Bearish Rejection", direction: "Bearish", confidence: 68, description: "Long upper wick with a weak close suggests supply near the high." });
  }
  if (last.c > last.o && prev.c < prev.o && last.o <= prev.c && last.c >= prev.o) {
    patterns.push({ name: "Bullish Engulfing", direction: "Bullish", confidence: 76, description: "Latest candle engulfs the prior bearish candle body." });
  }
  if (last.c < last.o && prev.c > prev.o && last.o >= prev.c && last.c <= prev.o) {
    patterns.push({ name: "Bearish Engulfing", direction: "Bearish", confidence: 76, description: "Latest candle engulfs the prior bullish candle body." });
  }
  return patterns.slice(0, 4);
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
  const atrValue = atr(sorted, 14);
  const atrPct = atrValue != null && price ? (atrValue / price) * 100 : null;
  const rsiBias = rr == null ? "Unavailable" : rr >= 70 ? "Overbought" : rr <= 30 ? "Oversold" : rr >= 55 ? "Bullish momentum" : rr <= 45 ? "Bearish momentum" : "Neutral momentum";
  const macdBias = mm.line == null || mm.signal == null ? "Unavailable" : mm.line > mm.signal ? "Bullish MACD" : mm.line < mm.signal ? "Bearish MACD" : "Neutral MACD";
  const sr = price == null ? { supports: [], resistances: [], method: "No candle series available." } : supportResistance(sorted, price, atrValue);
  const fib = price == null ? { swingLow: null, swingHigh: null, levels: [], interpretation: "No price available." } : fibonacci(sorted, price);
  const vp = volumeProfile(sorted);
  const patterns = price == null ? [] : detectPatterns(sorted, price);
  const patternScore = patterns.reduce((score, p) => score + (p.direction === "Bullish" ? p.confidence >= 75 ? 2 : 1 : p.direction === "Bearish" ? p.confidence >= 75 ? -2 : -1 : 0), 0);
  const technicalScore = (emaBias.startsWith("Bullish") ? 2 : emaBias.startsWith("Bearish") ? -2 : 0) + (rsiBias.startsWith("Bullish") ? 1 : rsiBias.startsWith("Bearish") ? -1 : 0) + (macdBias.startsWith("Bullish") ? 1 : macdBias.startsWith("Bearish") ? -1 : 0) + Math.max(-2, Math.min(2, patternScore));
  const overallBias = technicalScore >= 3 ? "Bullish" : technicalScore <= -3 ? "Bearish" : "Neutral / Mixed";
  const summary = overallBias === "Bullish"
    ? "Trend, momentum and confirmed candle structure are collectively favoring upside."
    : overallBias === "Bearish"
      ? "Trend, momentum and confirmed candle structure are collectively favoring downside."
      : "Trend, momentum and structure are mixed; confirmation is preferred.";
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
    volatility: {
      atr14: atrValue,
      atrPercent: atrPct,
      interpretation: atrValue == null ? "ATR unavailable." : `Average true range is ${round(atrValue, 2)} (${round(atrPct ?? 0, 2)}% of price).`,
    },
    supportResistance: sr,
    fibonacci: fib,
    volumeProfile: vp,
    patterns,
    overall: { bias: overallBias, summary },
  };
}
