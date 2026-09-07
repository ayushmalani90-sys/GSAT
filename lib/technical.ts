export type TechnicalCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

export type Level = {
  price: number;
  strength: number;
  touches: number;
  distancePct: number;
  low?: number;
  high?: number;
};

export type TechnicalAnalysis = {
  price: number | null;
  samples: number;
  ema: { ema20: number | null; ema50: number | null; ema200: number | null; priceVsEma20: "Above" | "Below" | "At" | "Unavailable"; priceVsEma50: "Above" | "Below" | "At" | "Unavailable"; priceVsEma200: "Above" | "Below" | "At" | "Unavailable"; bias: string; interpretation: string };
  momentum: { rsi14: number | null; rsiBias: string; macd: number | null; macdSignal: number | null; macdHistogram: number | null; macdBias: string; interpretation: string };
  volatility: { atr14: number | null; atrPercent: number | null; interpretation: string; breakoutAbove?: number | null; breakdownBelow?: number | null };
  supportResistance: { supports: Level[]; resistances: Level[]; method: string };
  fibonacci: { swingLow: number | null; swingHigh: number | null; levels: Array<{ ratio: string; price: number }>; currentRetracement?: string | null; continuationAbove?: number | null; bearishConfirmationBelow?: number | null; interpretation: string };
  volumeProfile: { poc: number | null; highVolumeNodes: number[]; lowVolumeNodes: number[]; interpretation: string; position?: "Above POC" | "Below POC" | "At POC" | "Unavailable" };
  patterns: Array<{ name: string; direction: "Bullish" | "Bearish" | "Neutral"; confidence: number; description: string }>;
  overall: { bias: "Bullish" | "Bearish" | "Neutral" | "Mixed"; confidence: number; summary: string };
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

function normalizeVolume(value: number | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : 1;
}

export function supportResistance(candles: TechnicalCandle[], current: number, atrValue = atr(candles, 14)) {
  if (candles.length < 60) return { supports: [], resistances: [], method: "Insufficient candle history for structural support/resistance." };

  const recent = candles.slice(-Math.min(candles.length, 500));
  const volatility = atrValue ?? current * 0.005;
  const minDistance = Math.max(Math.abs(volatility) * 1.15, Math.abs(current) * 0.004);
  const zoneWidth = Math.max(Math.abs(volatility) * 0.45, Math.abs(current) * 0.0015);
  const pivotWindow = 5;
  const touchTolerance = Math.max(zoneWidth, Math.abs(current) * 0.001);

  type Candidate = { price: number; type: "support" | "resistance"; volume: number; reaction: number; age: number };
  const candidates: Candidate[] = [];
  for (let i = pivotWindow; i < recent.length - pivotWindow; i += 1) {
    const candle = recent[i];
    const left = recent.slice(i - pivotWindow, i);
    const right = recent.slice(i + 1, i + pivotWindow + 1);
    const avgRange = Math.max(recent.slice(Math.max(0, i - pivotWindow), Math.min(recent.length, i + pivotWindow + 1)).reduce((s, x) => s + (x.h - x.l), 0) / (pivotWindow * 2 + 1), 1e-9);
    const lowerReaction = Math.max(0, candle.c - candle.l) / avgRange;
    const upperReaction = Math.max(0, candle.h - candle.c) / avgRange;
    const isSwingLow = left.every(x => candle.l <= x.l) && right.every(x => candle.l <= x.l);
    const isSwingHigh = left.every(x => candle.h >= x.h) && right.every(x => candle.h >= x.h);
    const age = recent.length - 1 - i;
    const ageFactor = Math.max(0.15, 1 - age / recent.length);
    if (isSwingLow && candle.l < current - minDistance * 0.15) candidates.push({ price: candle.l, type: "support", volume: normalizeVolume(candle.v), reaction: lowerReaction, age: ageFactor });
    if (isSwingHigh && candle.h > current + minDistance * 0.15) candidates.push({ price: candle.h, type: "resistance", volume: normalizeVolume(candle.v), reaction: upperReaction, age: ageFactor });
  }

  const buildZones = (type: "support" | "resistance") => {
    const sorted = candidates.filter(x => x.type === type).sort((a, b) => a.price - b.price);
    const zones: Array<{ values: Candidate[]; low: number; high: number }> = [];
    for (const candidate of sorted) {
      const nearest = zones.find(zone => candidate.price >= zone.low - touchTolerance && candidate.price <= zone.high + touchTolerance);
      if (!nearest) zones.push({ values: [candidate], low: candidate.price - zoneWidth, high: candidate.price + zoneWidth });
      else { nearest.values.push(candidate); nearest.low = Math.min(nearest.low, candidate.price - zoneWidth); nearest.high = Math.max(nearest.high, candidate.price + zoneWidth); }
    }
    return zones.map(zone => {
      const prices = zone.values.map(x => x.price);
      const center = median(prices) ?? prices[0];
      const touches = zone.values.length;
      const avgReaction = zone.values.reduce((s, x) => s + Math.min(2, x.reaction), 0) / touches;
      const avgAge = zone.values.reduce((s, x) => s + x.age, 0) / touches;
      const avgVolume = zone.values.reduce((s, x) => s + Math.log10(x.volume + 1), 0) / touches;
      const proximity = 1 / (1 + Math.abs(current - center) / Math.max(volatility, 1e-9));
      const strength = Math.max(0, Math.min(100, Math.round(Math.min(40, touches * 8) + Math.min(20, avgReaction * 10) + avgAge * 15 + Math.min(10, avgVolume * 4) + proximity * 15)));
      return { price: round(center, 2), low: round(zone.low, 2), high: round(zone.high, 2), strength, touches, distancePct: round(Math.abs(current - center) / Math.abs(current) * 100, 2) } satisfies Level;
    }).filter(x => x.distancePct >= 0.25).sort((a, b) => b.strength - a.strength || a.distancePct - b.distancePct).filter((zone, index, arr) => index === 0 || arr.slice(0, index).every(prev => Math.abs(prev.price - zone.price) >= minDistance * 0.8)).slice(0, 3);
  };

  return { supports: buildZones("support"), resistances: buildZones("resistance"), method: "Structural swing highs/lows using 5-bar pivots, ATR-based filtering, minimum-distance enforcement, zone clustering, touch counts, reaction/recency/volume scoring, top 3 each side." };
}

export function fibonacci(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-Math.min(candles.length, 300));
  if (recent.length < 30) return { swingLow: null, swingHigh: null, levels: [], currentRetracement: null, continuationAbove: null, bearishConfirmationBelow: null, interpretation: "Insufficient history for Fibonacci." };
  let high = recent[0].h, low = recent[0].l, highIndex = 0, lowIndex = 0;
  recent.forEach((c, i) => { if (c.h > high) { high = c.h; highIndex = i; } if (c.l < low) { low = c.l; lowIndex = i; } });
  const range = high - low;
  if (!(range > 0)) return { swingLow: low, swingHigh: high, levels: [], currentRetracement: null, continuationAbove: null, bearishConfirmationBelow: null, interpretation: "No meaningful swing range." };
  const bullishLeg = lowIndex < highIndex;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map(r => ({ ratio: `${(r * 100).toFixed(1)}%`, price: round(bullishLeg ? high - range * r : low + range * r, 2) }));
  const nearest = [...levels].sort((a, b) => Math.abs(current - a.price) - Math.abs(current - b.price))[0];
  const currentRetracement = nearest?.ratio ?? null;
  const continuationAbove = bullishLeg ? high : low;
  const bearishConfirmationBelow = levels.find(x => x.ratio === "61.8%")?.price ?? null;
  const interpretation = bullishLeg ? `Price is nearest to the ${currentRetracement ?? "active"} retracement. Bullish continuation requires acceptance above ${round(continuationAbove, 2)}; bearish confirmation is a sustained break below ${round(bearishConfirmationBelow ?? low, 2)}.` : `Price is nearest to the ${currentRetracement ?? "active"} retracement. Bearish continuation is favored below ${round(continuationAbove, 2)}; bullish reversal confirmation requires reclaiming ${round(bearishConfirmationBelow ?? high, 2)}.`;
  return { swingLow: round(low, 2), swingHigh: round(high, 2), levels, currentRetracement, continuationAbove: round(continuationAbove, 2), bearishConfirmationBelow: bearishConfirmationBelow == null ? null : round(bearishConfirmationBelow, 2), interpretation };
}

export function volumeProfile(candles: TechnicalCandle[], bins = 24) {
  if (candles.length < 40) return { poc: null, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "Insufficient candle history for volume profile.", position: "Unavailable" as const };
  const recent = candles.slice(-Math.min(candles.length, 300));
  const min = Math.min(...recent.map(c => c.l));
  const max = Math.max(...recent.map(c => c.h));
  const span = max - min;
  if (!(span > 0)) return { poc: min, highVolumeNodes: [], lowVolumeNodes: [], interpretation: "No meaningful price range.", position: "At POC" as const };
  const bucketVolume = Array.from({ length: bins }, () => 0);
  const width = span / bins;
  recent.forEach(c => { const typical = (c.h + c.l + c.c) / 3; const index = Math.max(0, Math.min(bins - 1, Math.floor((typical - min) / width))); bucketVolume[index] += normalizeVolume(c.v); });
  const maxVol = Math.max(...bucketVolume);
  const minVol = Math.min(...bucketVolume);
  const pocIndex = bucketVolume.indexOf(maxVol);
  const poc = min + width * (pocIndex + 0.5);
  const highVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v >= maxVol * 0.75).sort((a, b) => b.v - a.v).slice(0, 3).map(x => round(x.p, 2));
  const lowThreshold = minVol + Math.max(1, maxVol * 0.15);
  const lowVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v <= lowThreshold).sort((a, b) => a.v - b.v).slice(0, 3).map(x => round(x.p, 2));
  const current = recent.at(-1)?.c ?? null;
  const position: "Above POC" | "Below POC" | "At POC" | "Unavailable" = current == null ? "Unavailable" : Math.abs(current - poc) <= width * 0.5 ? "At POC" : current > poc ? "Above POC" : "Below POC";
  const interpretation = current == null ? "Volume profile unavailable." : `POC ${round(poc, 2)}. ${position}. HVN marks accepted/high-activity price; LVN marks thin participation where price can move faster.`;
  return { poc: round(poc, 2), highVolumeNodes, lowVolumeNodes, interpretation, position };
}

function detectPatterns(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-40);
  const patterns: TechnicalAnalysis["patterns"] = [];
  if (recent.length < 12) return patterns;
  const last = recent.at(-1)!;
  const prev = recent.at(-2)!;
  const body = Math.abs(last.c - last.o);
  const upperWick = last.h - Math.max(last.o, last.c);
  const lowerWick = Math.min(last.o, last.c) - last.l;
  const range = Math.max(...recent.map(c => c.h)) - Math.min(...recent.map(c => c.l));
  const eps = Math.max(range * 0.03, current * 0.002);
  const early = recent.slice(0, 20);
  const late = recent.slice(20);
  const earlyHigh = Math.max(...early.map(c => c.h));
  const lateHigh = Math.max(...late.map(c => c.h));
  const earlyLow = Math.min(...early.map(c => c.l));
  const lateLow = Math.min(...late.map(c => c.l));
  if (Math.abs(earlyHigh - lateHigh) <= eps && lateLow > earlyLow + eps * 0.5) patterns.push({ name: "Ascending Triangle", direction: "Bullish", confidence: 72, description: "Repeated resistance with rising swing lows; breakout above resistance confirms continuation." });
  if (Math.abs(earlyLow - lateLow) <= eps && lateHigh < earlyHigh - eps * 0.5) patterns.push({ name: "Descending Triangle", direction: "Bearish", confidence: 72, description: "Repeated support with falling swing highs; breakdown below support confirms continuation." });
  if (lowerWick > body * 2 && lowerWick > upperWick * 1.5 && last.c >= last.o) patterns.push({ name: "Bullish Rejection", direction: "Bullish", confidence: 68, description: "Demand rejected lower prices; bullish only while the rejection low holds." });
  if (upperWick > body * 2 && upperWick > lowerWick * 1.5 && last.c <= last.o) patterns.push({ name: "Bearish Rejection", direction: "Bearish", confidence: 68, description: "Supply rejected higher prices; bearish only while the rejection high holds." });
  if (last.c > last.o && prev.c < prev.o && last.o <= prev.c && last.c >= prev.o) patterns.push({ name: "Bullish Engulfing", direction: "Bullish", confidence: 76, description: "Latest candle engulfs the prior bearish body, confirming short-term demand if follow-through holds." });
  if (last.c < last.o && prev.c > prev.o && last.o >= prev.c && last.c <= prev.o) patterns.push({ name: "Bearish Engulfing", direction: "Bearish", confidence: 76, description: "Latest candle engulfs the prior bullish body, confirming short-term supply if follow-through holds." });
  return patterns.slice(0, 4);
}

function sign(value: number | null) { return value == null ? 0 : value > 0 ? 1 : value < 0 ? -1 : 0; }

export function analyze(candles: TechnicalCandle[]): TechnicalAnalysis {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = sorted.map(c => c.c).filter(Number.isFinite);
  const price = closes.at(-1) ?? null;
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const relation = (e: number | null): TechnicalAnalysis["ema"]["priceVsEma20"] => price == null || e == null ? "Unavailable" : Math.abs(price - e) < 1e-8 ? "At" : price > e ? "Above" : "Below";
  const bullish = [e20, e50, e200].filter(e => price != null && e != null && price > e).length;
  const bearish = [e20, e50, e200].filter(e => price != null && e != null && price < e).length;
  const emaBias = bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure";
  const emaInterpretation = emaBias.startsWith("Bullish") ? "Price is above most available EMAs, favoring upside structure." : emaBias.startsWith("Bearish") ? "Price is below most available EMAs, favoring downside structure." : "Price is mixed around the available EMAs.";
  const rr = rsi(closes, 14), mm = macd(closes), atrValue = atr(sorted, 14);
  const atrPct = atrValue != null && price ? (atrValue / price) * 100 : null;
  const rsiBias = rr == null ? "Unavailable" : rr >= 70 ? "Overbought" : rr <= 30 ? "Oversold" : rr >= 55 ? "Bullish momentum" : rr <= 45 ? "Bearish momentum" : "Neutral momentum";
  const macdBias = mm.line == null || mm.signal == null ? "Unavailable" : mm.line > mm.signal ? "Bullish MACD" : mm.line < mm.signal ? "Bearish MACD" : "Neutral MACD";
  const sr = price == null ? { supports: [], resistances: [], method: "No candle series available." } : supportResistance(sorted, price, atrValue);
  const fib = price == null ? { swingLow: null, swingHigh: null, levels: [], currentRetracement: null, continuationAbove: null, bearishConfirmationBelow: null, interpretation: "No price available." } : fibonacci(sorted, price);
  const vp = volumeProfile(sorted);
  const patterns = price == null ? [] : detectPatterns(sorted, price);
  const nearestSupport = sr.supports.find(x => x.price < (price ?? Infinity)) ?? null;
  const nearestResistance = sr.resistances.find(x => x.price > (price ?? -Infinity)) ?? null;
  const supportDistance = nearestSupport && price ? (price - nearestSupport.price) / Math.max(atrValue ?? price * 0.005, 1e-9) : null;
  const resistanceDistance = nearestResistance && price ? (nearestResistance.price - price) / Math.max(atrValue ?? price * 0.005, 1e-9) : null;
  let score = 0; let weight = 0;
  const add = (value: number, w: number) => { score += Math.max(-1, Math.min(1, value)) * w; weight += w; };
  add(emaBias.startsWith("Bullish") ? 1 : emaBias.startsWith("Bearish") ? -1 : 0, 25);
  add(rr == null ? 0 : rr >= 55 && rr < 70 ? 1 : rr <= 45 && rr > 30 ? -1 : rr >= 70 ? 0.25 : rr <= 30 ? -0.25 : 0, 15);
  add(mm.line != null && mm.signal != null ? (mm.line > mm.signal ? 1 : mm.line < mm.signal ? -1 : 0) : 0, 15);
  add(supportDistance != null && resistanceDistance != null ? (supportDistance < 1 ? -1 : resistanceDistance < 1 ? 1 : 0) : 0, 15);
  add(atrPct == null ? 0 : atrPct >= 1.5 ? 0.15 : atrPct <= 0.5 ? -0.05 : 0, 10);
  const fibMid = fib.levels.length ? fib.levels.reduce((s, x) => s + x.price, 0) / fib.levels.length : null;
  add(price != null && fibMid != null ? sign(price - fibMid) * 0.5 : 0, 10);
  add(vp.position === "Above POC" ? 1 : vp.position === "Below POC" ? -1 : 0, 5);
  const patternScore = patterns.length ? patterns.reduce((s, p) => s + (p.direction === "Bullish" ? p.confidence / 100 : p.direction === "Bearish" ? -(p.confidence / 100) : 0), 0) / patterns.length : 0;
  add(patternScore, 5);
  const normalized = weight ? score / weight : 0;
  const confidence = Math.round(Math.min(100, Math.max(0, 50 + Math.abs(normalized) * 50)));
  const overallBias: TechnicalAnalysis["overall"]["bias"] = normalized >= 0.22 ? "Bullish" : normalized <= -0.22 ? "Bearish" : Math.abs(normalized) < 0.1 ? "Neutral" : "Mixed";
  const trendText = emaBias.startsWith("Bullish") ? "Trend structure is bullish" : emaBias.startsWith("Bearish") ? "Trend structure is bearish" : "Trend structure is mixed";
  const momentumText = macdBias.startsWith("Bullish") && rr != null && rr >= 55 ? "RSI and MACD support the move" : macdBias.startsWith("Bearish") && rr != null && rr <= 45 ? "RSI and MACD support the downside" : "momentum is only partially aligned";
  const locationText = vp.position === "Above POC" ? "price is above the volume-profile POC" : vp.position === "Below POC" ? "price is below the volume-profile POC" : "volume-profile location is not decisive";
  const structureText = nearestSupport || nearestResistance ? `Key structure sits near support ${nearestSupport ? round(nearestSupport.price, 2) : "--"} and resistance ${nearestResistance ? round(nearestResistance.price, 2) : "--"}.` : "No nearby structural level is strong enough to dominate the setup.";
  const summary = `${trendText}; ${momentumText}. ${locationText}. ${structureText}`;
  return { price, samples: closes.length, ema: { ema20: e20, ema50: e50, ema200: e200, priceVsEma20: relation(e20), priceVsEma50: relation(e50), priceVsEma200: relation(e200), bias: emaBias, interpretation: emaInterpretation }, momentum: { rsi14: rr, rsiBias, macd: mm.line, macdSignal: mm.signal, macdHistogram: mm.histogram, macdBias, interpretation: `${rsiBias}; ${macdBias}.` }, volatility: { atr14: atrValue, atrPercent: atrPct, breakoutAbove: nearestResistance?.high ?? nearestResistance?.price ?? null, breakdownBelow: nearestSupport?.low ?? nearestSupport?.price ?? null, interpretation: atrValue == null ? "ATR unavailable." : `Current volatility is ${round(atrValue, 2)} (${round(atrPct ?? 0, 2)}% of price). Bullish breakout condition: close and hold above structural resistance with ATR-backed expansion. Bearish breakdown condition: close and hold below structural support with ATR-backed expansion.` }, supportResistance: sr, fibonacci: fib, volumeProfile: vp, patterns, overall: { bias: overallBias, confidence, summary } };
}
