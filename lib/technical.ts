import { atr, ema, macd, rma, rsi } from "./technical-reference";

export type TechnicalCandle = { t: string; o: number; h: number; l: number; c: number; volume?: number; tickVolume?: number };
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export { ema, rma, rsi, macd, atr };

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
      const distancePct = Math.abs(current - center) / Math.max(Math.abs(current), 1) * 100;
      const touches = group.length;
      const strength = Math.min(100, Math.round(25 + touches * 15 + Math.max(0, 20 - distancePct * 4)));
      return { price: round(center, 2), strength, touches, distancePct: round(distancePct, 2) };
    }).filter(x => x.distancePct >= 0.5).sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  };
  return { supports: cluster("support"), resistances: cluster("resistance"), method: "Confirmed swing highs/lows clustered with ATR-aware separation; strength uses touch count and distance to current price." };
}

export function fibonacci(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-Math.min(candles.length, 250));
  if (recent.length < 30) return { swingLow: null, swingHigh: null, levels: [], interpretation: "Insufficient history for Fibonacci." };
  const pivotWindow = 3;
  const pivotsHigh: Array<{ price: number; index: number }> = [];
  const pivotsLow: Array<{ price: number; index: number }> = [];
  for (let i = pivotWindow; i < recent.length - pivotWindow; i += 1) {
    const c = recent[i];
    const left = recent.slice(i - pivotWindow, i);
    const right = recent.slice(i + 1, i + pivotWindow + 1);
    if (left.every(x => c.h >= x.h) && right.every(x => c.h >= x.h)) pivotsHigh.push({ price: c.h, index: i });
    if (left.every(x => c.l <= x.l) && right.every(x => c.l <= x.l)) pivotsLow.push({ price: c.l, index: i });
  }
  if (!pivotsHigh.length || !pivotsLow.length) return { swingLow: null, swingHigh: null, levels: [], interpretation: "No confirmed structural swing pair." };
  const lastHigh = pivotsHigh.at(-1)!;
  const lastLow = pivotsLow.at(-1)!;
  let high = lastHigh.price, low = lastLow.price;
  if (lastHigh.index < lastLow.index) {
    const highsBeforeLow = pivotsHigh.filter(x => x.index < lastLow.index);
    if (highsBeforeLow.length) high = highsBeforeLow.at(-1)!.price;
  } else {
    const lowsBeforeHigh = pivotsLow.filter(x => x.index < lastHigh.index);
    if (lowsBeforeHigh.length) low = lowsBeforeHigh.at(-1)!.price;
  }
  const range = high - low;
  if (!(range > 0)) return { swingLow: round(low, 2), swingHigh: round(high, 2), levels: [], interpretation: "No meaningful swing range." };
  const bullishImpulse = lastHigh.index > lastLow.index;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map(r => ({ ratio: `${(r * 100).toFixed(1)}%`, price: round(bullishImpulse ? high - range * r : low + range * r, 2) }));
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
  for (const c of recent) {
    const typical = (c.h + c.l + c.c) / 3;
    const index = Math.max(0, Math.min(bins - 1, Math.floor((typical - min) / width)));
    const volume = Number.isFinite(c.tickVolume) ? c.tickVolume! : Number.isFinite(c.volume) ? c.volume! : 1;
    bucketVolume[index] += volume;
  }
  const maxVol = Math.max(...bucketVolume), minVol = Math.min(...bucketVolume), pocIndex = bucketVolume.indexOf(maxVol);
  const highVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v >= maxVol * 0.75).sort((a, b) => b.v - a.v).slice(0, 3).map(x => round(x.p, 2));
  const lowVolumeNodes = bucketVolume.map((v, i) => ({ v, p: min + width * (i + 0.5) })).filter(x => x.v <= minVol + Math.max(1e-9, maxVol * 0.15)).sort((a, b) => a.v - b.v).slice(0, 3).map(x => round(x.p, 2));
  const source = recent.some(c => Number.isFinite(c.tickVolume)) ? "tick volume" : recent.some(c => Number.isFinite(c.volume)) ? "volume" : "no volume; equal candle weight";
  return { poc: round(min + width * (pocIndex + 0.5), 2), highVolumeNodes, lowVolumeNodes, interpretation: `Volume profile uses completed candles over the recent profile window with ${source}; it is an approximation of volume-at-price rather than exchange order-book volume.` };
}

function detectPatterns(candles: TechnicalCandle[], current: number) {
  const recent = candles.slice(-40);
  const patterns: TechnicalAnalysis["patterns"] = [];
  if (recent.length < 12) return patterns;
  const last = recent.at(-1)!;
  const prev = recent.at(-2)!;
  const body = Math.abs(last.c - last.o);
  const range = Math.max(last.h - last.l, 1e-9);
  const upperWick = last.h - Math.max(last.o, last.c);
  const lowerWick = Math.min(last.o, last.c) - last.l;
  if (lowerWick >= Math.max(body * 2, range * 0.5) && last.c >= last.o) patterns.push({ name: "Bullish Rejection", direction: "Bullish", confidence: 65, description: "Long lower wick and non-bearish close indicate rejection of lower prices." });
  if (upperWick >= Math.max(body * 2, range * 0.5) && last.c <= last.o) patterns.push({ name: "Bearish Rejection", direction: "Bearish", confidence: 65, description: "Long upper wick and non-bullish close indicate rejection of higher prices." });
  if (last.c > last.o && prev.c < prev.o && last.o <= prev.c && last.c >= prev.o) patterns.push({ name: "Bullish Engulfing", direction: "Bullish", confidence: 70, description: "Latest bullish body fully engulfs the prior bearish body." });
  if (last.c < last.o && prev.c > prev.o && last.o >= prev.c && last.c <= prev.o) patterns.push({ name: "Bearish Engulfing", direction: "Bearish", confidence: 70, description: "Latest bearish body fully engulfs the prior bullish body." });
  const highs = recent.map(c => c.h), lows = recent.map(c => c.l);
  const resistance = Math.max(...recent.slice(0, 20).map(c => c.h));
  const support = Math.min(...recent.slice(0, 20).map(c => c.l));
  const higherLows = lows.slice(20).at(-1)! > lows.slice(0, 20).reduce((a, b) => Math.min(a, b), Infinity) + range * 2;
  const lowerHighs = highs.slice(20).at(-1)! < highs.slice(0, 20).reduce((a, b) => Math.max(a, b), -Infinity) - range * 2;
  if (Math.abs(resistance - Math.max(...recent.slice(20).map(c => c.h))) <= range * 1.5 && higherLows) patterns.push({ name: "Ascending Triangle", direction: "Bullish", confidence: 65, description: "Recent resistance is broadly flat while the later range holds higher lows." });
  if (Math.abs(support - Math.min(...recent.slice(20).map(c => c.l))) <= range * 1.5 && lowerHighs) patterns.push({ name: "Descending Triangle", direction: "Bearish", confidence: 65, description: "Recent support is broadly flat while the later range holds lower highs." });
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
  const emaInterpretation = `${emaBias}. Price is ${relation(e20).toLowerCase()} EMA20, ${relation(e50).toLowerCase()} EMA50 and ${relation(e200).toLowerCase()} EMA200.`;
  const rsi14 = rsi(closes, 14);
  const rsiBias = rsi14 == null ? "RSI unavailable" : rsi14 >= 70 ? "Overbought momentum" : rsi14 <= 30 ? "Oversold momentum" : rsi14 >= 50 ? "Bullish momentum" : "Bearish momentum";
  const m = macd(closes, 12, 26, 9);
  const macdBias = m.histogram == null ? "MACD unavailable" : m.histogram > 0 ? "Bullish MACD momentum" : m.histogram < 0 ? "Bearish MACD momentum" : "Neutral MACD momentum";
  const atr14 = atr(sorted, 14);
  const atrPercent = price != null && atr14 != null && price !== 0 ? (atr14 / Math.abs(price)) * 100 : null;
  const sr = price != null ? supportResistance(sorted, price, atr14) : { supports: [], resistances: [], method: "Price unavailable." };
  const fib = price != null ? fibonacci(sorted, price) : { swingLow: null, swingHigh: null, levels: [], interpretation: "Price unavailable." };
  const vp = volumeProfile(sorted);
  const patterns = price != null ? detectPatterns(sorted, price) : [];
  const score = (emaBias.includes("Bullish") ? 1 : emaBias.includes("Bearish") ? -1 : 0) + (rsiBias.includes("Bullish") ? 1 : rsiBias.includes("Bearish") ? -1 : 0) + (macdBias.includes("Bullish") ? 1 : macdBias.includes("Bearish") ? -1 : 0) + patterns.slice(0, 2).reduce((s, p) => s + (p.direction === "Bullish" ? 0.5 : p.direction === "Bearish" ? -0.5 : 0), 0);
  const overallBias = score >= 1.5 ? "Bullish" : score <= -1.5 ? "Bearish" : "Mixed";
  return {
    price,
    samples: sorted.length,
    ema: { ema20: e20, ema50: e50, ema200: e200, priceVsEma20: relation(e20), priceVsEma50: relation(e50), priceVsEma200: relation(e200), bias: emaBias, interpretation: emaInterpretation },
    momentum: { rsi14, rsiBias, macd: m.line, macdSignal: m.signal, macdHistogram: m.histogram, macdBias, interpretation: `RSI14 is ${rsi14 == null ? "unavailable" : round(rsi14, 2)}; ${macdBias.toLowerCase()}.` },
    volatility: { atr14, atrPercent, interpretation: `ATR14 is ${atr14 == null ? "unavailable" : round(atr14, 2)} (${atrPercent == null ? "--" : `${round(atrPercent, 2)}% of price`}).` },
    supportResistance: sr,
    fibonacci: fib,
    volumeProfile: vp,
    patterns,
    overall: { bias: overallBias, summary: `${overallBias} technical posture derived from EMA structure, RSI, MACD and detected price-action patterns; ATR is treated as a volatility measure rather than directional evidence.` },
  };
}
