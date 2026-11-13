import { atr } from "./technical-reference";
import { analyze, type TechnicalAnalysis, type TechnicalCandle, type Level } from "./technical";

type Pivot = {
  index: number;
  type: "high" | "low";
  price: number;
  reaction: number;
  prominence: number;
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function confirmedPivots(candles: TechnicalCandle[], window = 3): Pivot[] {
  const out: Pivot[] = [];
  const volatility = atr(candles, 14) ?? 0;
  for (let i = window; i < candles.length - window; i += 1) {
    const candle = candles[i];
    const left = candles.slice(i - window, i);
    const right = candles.slice(i + 1, i + window + 1);
    const leftHigh = Math.max(...left.map(x => x.h));
    const rightHigh = Math.max(...right.map(x => x.h));
    const leftLow = Math.min(...left.map(x => x.l));
    const rightLow = Math.min(...right.map(x => x.l));
    const isHigh = candle.h >= leftHigh && candle.h >= rightHigh && (candle.h > leftHigh || candle.h > rightHigh);
    const isLow = candle.l <= leftLow && candle.l <= rightLow && (candle.l < leftLow || candle.l < rightLow);
    const after = right;
    if (isHigh) {
      const reaction = Math.max(0, candle.h - Math.min(...after.map(x => x.c)));
      const prominence = Math.max(0, candle.h - Math.max(Math.min(...left.map(x => x.l)), Math.min(...right.map(x => x.l))));
      out.push({ index: i, type: "high", price: candle.h, reaction: volatility > 0 ? reaction / volatility : 0, prominence: volatility > 0 ? prominence / volatility : 0 });
    }
    if (isLow) {
      const reaction = Math.max(0, Math.max(...after.map(x => x.c)) - candle.l);
      const prominence = Math.max(0, Math.min(Math.max(...left.map(x => x.h)), Math.max(...right.map(x => x.h))) - candle.l);
      out.push({ index: i, type: "low", price: candle.l, reaction: volatility > 0 ? reaction / volatility : 0, prominence: volatility > 0 ? prominence / volatility : 0 });
    }
  }

  // A wide outside candle can be both a local high and low. It is not a usable
  // directional swing anchor, so discard ambiguous same-index pivots.
  const byIndex = new Map<number, Pivot[]>();
  for (const pivot of out) byIndex.set(pivot.index, [...(byIndex.get(pivot.index) ?? []), pivot]);
  return [...byIndex.values()]
    .filter(group => group.length === 1)
    .map(group => group[0])
    .sort((a, b) => a.index - b.index);
}

function clusterLevels(
  candidates: Pivot[],
  candles: TechnicalCandle[],
  current: number,
  type: "support" | "resistance",
  tolerance: number,
): Level[] {
  const eligible = candidates
    .filter(p => type === "support" ? p.type === "low" && p.price < current : p.type === "high" && p.price > current)
    .sort((a, b) => a.price - b.price);
  const groups: Pivot[][] = [];

  for (const pivot of eligible) {
    const last = groups[groups.length - 1];
    const center = last ? median(last.map(x => x.price)) : null;
    if (last && center != null && Math.abs(pivot.price - center) <= tolerance) last.push(pivot);
    else groups.push([pivot]);
  }

  const lookback = Math.max(1, candles.length);
  return groups.map(group => {
    const price = median(group.map(x => x.price)) ?? group[0].price;
    const touches = group.length;
    const touchScore = Math.min(1, touches / 4);
    const reactionScore = group.reduce((sum, p) => sum + clamp(p.reaction / 1.5, 0, 1), 0) / touches;
    const recencyScore = group.reduce((sum, p) => sum + Math.exp(-(candles.length - 1 - p.index) / (lookback * 0.5)), 0) / touches;
    const prominenceScore = group.reduce((sum, p) => sum + clamp(p.prominence / 2, 0, 1), 0) / touches;
    // Structural strength is based on touch/reaction/recency/prominence only.
    // Distance to live price is deliberately excluded.
    const strength = Math.round(100 * (0.4 * touchScore + 0.3 * reactionScore + 0.15 * recencyScore + 0.15 * prominenceScore));
    const distancePct = Math.abs(current - price) / Math.max(Math.abs(current), 1) * 100;
    return { price: round(price), strength, touches, distancePct: round(distancePct, 3) };
  }).sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
}

export function verifiedSupportResistance(candles: TechnicalCandle[], current: number) {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)).slice(-300);
  if (sorted.length < 50) {
    return { supports: [] as Level[], resistances: [] as Level[], method: "Insufficient candle history for confirmed structural zones." };
  }
  const volatility = atr(sorted, 14);
  const tolerance = Math.max((volatility ?? current * 0.002) * 0.35, Math.abs(current) * 0.0005);
  const pivots = confirmedPivots(sorted, 3);
  return {
    supports: clusterLevels(pivots, sorted, current, "support", tolerance),
    resistances: clusterLevels(pivots, sorted, current, "resistance", tolerance),
    method: "Confirmed 3-left/3-right swing pivots clustered with ATR-normalized tolerance. Strength uses touches, post-pivot reaction, recency and prominence; proximity is reported separately and does not increase strength. Broker tick count is not treated as traded volume.",
  };
}

export function verifiedFibonacci(candles: TechnicalCandle[], current: number) {
  const recent = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)).slice(-250);
  if (recent.length < 30) {
    return { swingLow: null, swingHigh: null, levels: [] as Array<{ ratio: string; price: number }>, interpretation: "Insufficient history for Fibonacci." };
  }

  const pivots = confirmedPivots(recent, 3);
  const alternating: Pivot[] = [];
  for (const pivot of pivots) {
    const last = alternating[alternating.length - 1];
    if (!last) {
      alternating.push(pivot);
      continue;
    }
    if (pivot.type === last.type) {
      const moreExtreme = pivot.type === "high" ? pivot.price > last.price : pivot.price < last.price;
      if (moreExtreme) alternating[alternating.length - 1] = pivot;
    } else if (pivot.index > last.index) {
      alternating.push(pivot);
    }
  }

  const volatility = atr(recent, 14) ?? Math.abs(current) * 0.005;
  const minimumSwing = Math.max(volatility * 1.25, Math.abs(current) * 0.002);
  let selected: [Pivot, Pivot] | null = null;
  for (let i = 1; i < alternating.length; i += 1) {
    const start = alternating[i - 1];
    const end = alternating[i];
    if (Math.abs(end.price - start.price) >= minimumSwing) selected = [start, end];
  }

  if (!selected) {
    return { swingLow: null, swingHigh: null, levels: [] as Array<{ ratio: string; price: number }>, interpretation: "No confirmed alternating swing leg meets the ATR-normalized minimum excursion." };
  }

  const [start, end] = selected;
  const swingLow = Math.min(start.price, end.price);
  const swingHigh = Math.max(start.price, end.price);
  const range = swingHigh - swingLow;
  const upswing = start.type === "low" && end.type === "high";
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map(ratio => ({
    ratio: (ratio * 100).toFixed(1) + "%",
    price: round(upswing ? swingHigh - range * ratio : swingLow + range * ratio),
  }));
  const nearest = [...levels].sort((a, b) => Math.abs(current - a.price) - Math.abs(current - b.price))[0];
  return {
    swingLow: round(swingLow),
    swingHigh: round(swingHigh),
    levels,
    direction: upswing ? "Upswing" : "Downswing",
    anchors: { startIndex: start.index, endIndex: end.index },
    interpretation: (upswing ? "Most recent qualifying confirmed upswing" : "Most recent qualifying confirmed downswing") +
      "; nearest retracement is " + nearest.ratio + " at " + nearest.price + ". A level is context, not a trade signal.",
  };
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
}

export function verifiedVolumeProfile(candles: TechnicalCandle[], bins = 24) {
  const empty = {
    poc: null as number | null,
    valueAreaHigh: null as number | null,
    valueAreaLow: null as number | null,
    highVolumeNodes: [] as number[],
    lowVolumeNodes: [] as number[],
    totalWeight: 0,
    source: "unavailable",
    interpretation: "Insufficient data for volume profile.",
  };
  if (!Number.isInteger(bins) || bins < 2 || bins > 200) return { ...empty, interpretation: "Invalid volume-profile bin count." };
  const recent = candles
    .filter(c => [c.h, c.l, c.c].every(Number.isFinite) && c.h >= c.l)
    .slice(-300);
  if (recent.length < 40) return empty;

  const useTick = recent.every(c => Number.isFinite(c.tickVolume));
  const useVolume = !useTick && recent.every(c => Number.isFinite(c.volume));
  const source = useTick ? "BiQuote tick volume proxy" : useVolume ? "BiQuote candle volume proxy" : "equal candle weight";
  const weights = recent.map(c => useTick ? Math.max(0, c.tickVolume ?? 0) : useVolume ? Math.max(0, c.volume ?? 0) : 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) {
    return { ...empty, source, interpretation: "No positive volume/tick-count data; POC and value area are unavailable." };
  }

  const min = Math.min(...recent.map(c => c.l));
  const max = Math.max(...recent.map(c => c.h));
  const span = max - min;
  if (!(span > 0)) {
    return { ...empty, poc: min, valueAreaHigh: max, valueAreaLow: min, totalWeight, source, interpretation: "No meaningful price range." };
  }
  const width = span / bins;
  const profile = Array.from({ length: bins }, () => 0);

  recent.forEach((candle, candleIndex) => {
    const weight = weights[candleIndex];
    if (!(weight > 0)) return;
    const low = clamp(candle.l, min, max);
    const high = clamp(candle.h, min, max);
    if (high <= low) {
      const index = clamp(Math.floor((candle.c - min) / width), 0, bins - 1);
      profile[index] += weight;
      return;
    }
    const first = clamp(Math.floor((low - min) / width), 0, bins - 1);
    const last = clamp(Math.floor((high - min) / width), 0, bins - 1);
    const overlaps: Array<{ index: number; amount: number }> = [];
    for (let index = first; index <= last; index += 1) {
      const binLow = min + index * width;
      const binHigh = binLow + width;
      const overlap = Math.max(0, Math.min(high, binHigh) - Math.max(low, binLow));
      if (overlap > 0) overlaps.push({ index, amount: overlap });
    }
    const overlapTotal = overlaps.reduce((sum, item) => sum + item.amount, 0);
    if (overlapTotal > 0) {
      for (const item of overlaps) profile[item.index] += weight * item.amount / overlapTotal;
    }
  });

  const maxWeight = Math.max(...profile);
  if (!(maxWeight > 0)) return { ...empty, source, totalWeight, interpretation: "No positive volume could be assigned to profile rows." };
  const pocIndex = profile.indexOf(maxWeight);
  const target = totalWeight * 0.7;
  let accumulated = profile[pocIndex];
  let lowerIndex = pocIndex;
  let upperIndex = pocIndex;
  while (accumulated < target && (lowerIndex > 0 || upperIndex < bins - 1)) {
    const below = lowerIndex > 0 ? profile[lowerIndex - 1] : -1;
    const above = upperIndex < bins - 1 ? profile[upperIndex + 1] : -1;
    if (above >= below && upperIndex < bins - 1) {
      upperIndex += 1;
      accumulated += profile[upperIndex];
    } else if (lowerIndex > 0) {
      lowerIndex -= 1;
      accumulated += profile[lowerIndex];
    } else {
      break;
    }
  }

  const spread = maxWeight - Math.min(...profile);
  const q25 = quantile(profile, 0.25);
  const q75 = quantile(profile, 0.75);
  const highVolumeNodes: number[] = [];
  const lowVolumeNodes: number[] = [];
  if (spread > Math.max(1e-9, maxWeight * 0.01)) {
    for (let i = 0; i < bins; i += 1) {
      const left = profile[i - 1] ?? -Infinity;
      const right = profile[i + 1] ?? -Infinity;
      const center = min + width * (i + 0.5);
      if (profile[i] >= q75 && profile[i] >= left && profile[i] >= right) highVolumeNodes.push(round(center));
      if (profile[i] <= q25 && profile[i] <= left && profile[i] <= right) lowVolumeNodes.push(round(center));
    }
  }

  const poc = round(min + width * (pocIndex + 0.5));
  const valueAreaLow = round(min + width * lowerIndex);
  const valueAreaHigh = round(min + width * (upperIndex + 1));
  return {
    poc,
    valueAreaHigh,
    valueAreaLow,
    highVolumeNodes: highVolumeNodes.slice(0, 3),
    lowVolumeNodes: lowVolumeNodes.slice(0, 3),
    totalWeight: round(totalWeight, 4),
    source,
    interpretation: "POC " + poc + "; 70% value area " + valueAreaLow + "–" + valueAreaHigh +
      ". Uses " + source + " distributed across each candle's traded price range. This is a broker-feed approximation, not centralized exchange volume-at-price.",
  };
}

export function verifiedPatterns(candles: TechnicalCandle[]) {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const patterns: Array<{ name: string; direction: "Bullish" | "Bearish" | "Neutral"; confidence: number; description: string; invalidation: string; confirmation: string }> = [];
  if (sorted.length < 12) return patterns;
  const last = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const body = Math.abs(last.c - last.o);
  const range = Math.max(last.h - last.l, 1e-9);
  const closePosition = clamp((last.c - last.l) / range, 0, 1);
  const upperWick = last.h - Math.max(last.o, last.c);
  const lowerWick = Math.min(last.o, last.c) - last.l;

  if (last.c > last.o && previous.c < previous.o && last.o <= previous.c && last.c >= previous.o) {
    const previousBody = Math.max(Math.abs(previous.c - previous.o), 1e-9);
    const bodyRatio = body / previousBody;
    const quality = Math.round(clamp(55 + Math.min(25, Math.max(0, bodyRatio - 1) * 18) + closePosition * 15, 50, 95));
    patterns.push({
      name: "Bullish Engulfing",
      direction: "Bullish",
      confidence: quality,
      description: "A completed bullish body engulfs the prior bearish body; quality score reflects body expansion and close location, not win probability.",
      confirmation: "Pattern is confirmed by the completed engulfing candle close.",
      invalidation: "A later completed candle closing below " + round(last.l) + " invalidates this candle pattern.",
    });
  }

  if (last.c < last.o && previous.c > previous.o && last.o >= previous.c && last.c <= previous.o) {
    const previousBody = Math.max(Math.abs(previous.c - previous.o), 1e-9);
    const bodyRatio = body / previousBody;
    const quality = Math.round(clamp(55 + Math.min(25, Math.max(0, bodyRatio - 1) * 18) + (1 - closePosition) * 15, 50, 95));
    patterns.push({
      name: "Bearish Engulfing",
      direction: "Bearish",
      confidence: quality,
      description: "A completed bearish body engulfs the prior bullish body; quality score reflects body expansion and close location, not win probability.",
      confirmation: "Pattern is confirmed by the completed engulfing candle close.",
      invalidation: "A later completed candle closing above " + round(last.h) + " invalidates this candle pattern.",
    });
  }

  if (body >= range * 0.05 && lowerWick >= Math.max(body * 2, range * 0.5) && closePosition >= 0.65 && last.c >= last.o) {
    const quality = Math.round(clamp(50 + Math.min(25, (lowerWick / range - 0.5) * 60) + Math.min(20, (closePosition - 0.65) * 50), 50, 95));
    patterns.push({
      name: "Bullish Rejection",
      direction: "Bullish",
      confidence: quality,
      description: "A long lower wick with a close in the upper part of the completed candle shows rejection of lower prices; quality score is geometric, not win probability.",
      confirmation: "The rejection candle has closed in its upper range.",
      invalidation: "A later completed candle closing below " + round(last.l) + " invalidates this rejection.",
    });
  }

  if (body >= range * 0.05 && upperWick >= Math.max(body * 2, range * 0.5) && closePosition <= 0.35 && last.c <= last.o) {
    const quality = Math.round(clamp(50 + Math.min(25, (upperWick / range - 0.5) * 60) + Math.min(20, (0.35 - closePosition) * 50), 50, 95));
    patterns.push({
      name: "Bearish Rejection",
      direction: "Bearish",
      confidence: quality,
      description: "A long upper wick with a close in the lower part of the completed candle shows rejection of higher prices; quality score is geometric, not win probability.",
      confirmation: "The rejection candle has closed in its lower range.",
      invalidation: "A later completed candle closing above " + round(last.h) + " invalidates this rejection.",
    });
  }

  return patterns.slice(0, 4);
}

function calculateVerifiedConfluence(args: {
  price: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdHistogram: number | null;
  patterns: ReturnType<typeof verifiedPatterns>;
}): TechnicalAnalysis["confluence"] {
  const components: TechnicalAnalysis["confluence"]["components"] = [];
  const emaScores = [args.ema20, args.ema50, args.ema200]
    .filter((value): value is number => args.price != null && value != null)
    .map(value => args.price! > value ? 100 : args.price! < value ? 0 : 50);
  const emaWeight = 25 * emaScores.length / 3;
  components.push({ name: "EMA structure", weight: emaWeight, score: emaScores.length ? emaScores.reduce<number>((sum, value) => sum + value, 0) / emaScores.length : null, contribution: 0 });
  components.push({ name: "RSI", weight: 15, score: args.rsi14 == null ? null : args.rsi14 > 70 || args.rsi14 < 30 ? 50 : args.rsi14 > 50 ? 100 : args.rsi14 < 50 ? 0 : 50, contribution: 0 });
  components.push({ name: "MACD", weight: 20, score: args.macdHistogram == null ? null : args.macdHistogram > 0 ? 100 : args.macdHistogram < 0 ? 0 : 50, contribution: 0 });

  const patternScore = args.patterns.length
    ? args.patterns.reduce((sum, pattern) => sum + (pattern.direction === "Bullish" ? 100 : pattern.direction === "Bearish" ? 0 : 50) * pattern.confidence, 0) /
      args.patterns.reduce((sum, pattern) => sum + pattern.confidence, 0)
    : 50;
  components.push({ name: "Price action", weight: 15, score: patternScore, contribution: 0 });

  // S/R, Fibonacci and Volume Profile are deliberately not assigned directional
  // weight from proximity alone. They remain context until a validated reaction,
  // breakout/retest or value-area acceptance model exists.
  components.push({ name: "Support / resistance context (not directionally scored)", weight: 0, score: null, contribution: 0 });

  const scoringBaseWeight = 75; // EMA 25 + RSI 15 + MACD 20 + price action 15.
  const usable = components.filter(component => component.score != null && component.weight > 0);
  const weightSum = usable.reduce((sum, component) => sum + component.weight, 0);
  const weightedSum = usable.reduce((sum, component) => sum + (component.score ?? 0) * component.weight, 0);
  const score = weightSum > 0 ? Math.round(weightedSum / weightSum) : 50;
  const coverage = Math.round(weightSum / scoringBaseWeight * 100);
  for (const component of components) {
    component.contribution = component.score == null || weightSum === 0
      ? 0
      : Number(((component.score * component.weight) / weightSum).toFixed(2));
  }
  const label = score >= 80 ? "Very Bullish" : score >= 60 ? "Bullish" : score <= 20 ? "Very Bearish" : score <= 40 ? "Bearish" : "Neutral";
  return {
    score,
    label,
    coverage,
    components,
    interpretation: "Directional confluence is " + score + "/100 (" + label + ") with " + coverage +
      "% evidence coverage. EMA weight is reduced when one or more EMA periods are unavailable. ATR is volatility only; S/R proximity, Fibonacci location and Volume Profile location are not treated as directional signals.",
  };
}

export function analyzeVerified(candles: TechnicalCandle[]): TechnicalAnalysis {
  const base = analyze(candles);
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const current = base.price;
  const supportResistance = current == null
    ? { supports: [] as Level[], resistances: [] as Level[], method: "Price unavailable." }
    : verifiedSupportResistance(sorted, current);
  const fibonacci = current == null
    ? { swingLow: null, swingHigh: null, levels: [] as Array<{ ratio: string; price: number }>, interpretation: "Price unavailable." }
    : verifiedFibonacci(sorted, current);
  const volumeProfile = verifiedVolumeProfile(sorted);
  const patterns = verifiedPatterns(sorted);
  const confluence = calculateVerifiedConfluence({
    price: current,
    ema20: base.ema.ema20,
    ema50: base.ema.ema50,
    ema200: base.ema.ema200,
    rsi14: base.momentum.rsi14,
    macdHistogram: base.momentum.macdHistogram,
    patterns,
  });
  const bias = confluence.coverage < 60 ? "Mixed" : confluence.score >= 60 ? "Bullish" : confluence.score <= 40 ? "Bearish" : "Mixed";
  return {
    ...base,
    supportResistance,
    fibonacci,
    volumeProfile,
    patterns,
    confluence,
    overall: {
      bias,
      summary: bias + " technical posture from EMA structure, RSI, MACD and completed-candle price action. Directional confluence is " +
        confluence.score + "/100 with " + confluence.coverage + "% evidence coverage. ATR is volatility only; S/R, Fibonacci and Volume Profile remain contextual until their directional confirmation rules are validated. This is not a price prediction.",
    },
  };
}
