import type { TechnicalCandle } from "./technical";
import {
  analyzeVerified,
  verifiedFibonacci,
  verifiedPatterns,
  verifiedSupportResistance,
  verifiedVolumeProfile,
} from "./technical-advanced";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertNear(name: string, actual: number | null, expected: number, tolerance = 0.01) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(name + ": expected " + expected + ", received " + actual);
  }
}

function candle(index: number, open: number, high: number, low: number, close: number, extras: Partial<TechnicalCandle> = {}): TechnicalCandle {
  return {
    t: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    o: open,
    h: high,
    l: low,
    c: close,
    ...extras,
  };
}

function oscillatingFixture(count = 120, width = 0.2): TechnicalCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 4) * 5 + i * 0.02;
    return candle(i, close - 0.1, close + width, close - width, close, { tickVolume: 10 + (i % 7) });
  });
}

function fibonacciFixture(amplitude = 10): TechnicalCandle[] {
  const rows = Array.from({ length: 70 }, (_, i) => candle(i, 100, 101, 99, 100));
  rows[20] = candle(20, 92, 95, 100 - amplitude, 92);
  rows[40] = candle(40, 108, 100 + amplitude, 105, 108);
  return rows;
}

function patternBase() {
  return Array.from({ length: 12 }, (_, i) => candle(i, 10, 10.5, 9.5, 10));
}

export function runAdvancedIndicatorTests() {
  let cases = 0;

  // Structural strength must not be boosted merely because a zone is closer to price.
  const srCandles = oscillatingFixture(180, 0.8);
  const srNear = verifiedSupportResistance(srCandles, 160);
  const srFar = verifiedSupportResistance(srCandles, 180);
  assert(srNear.supports.length > 0, "Support fixture did not create confirmed support pivots");
  for (const near of srNear.supports) {
    const far = srFar.supports.find(level => level.price === near.price);
    assert(Boolean(far), "Changing only current price changed the support cluster set");
    assert(near.strength === far!.strength, "Support strength changed with distance to current price");
  }
  assert(srNear.supports[0].distancePct !== srFar.supports[0].distancePct, "Distance fixture did not change proximity");
  cases += 1;

  // Fibonacci must choose a confirmed, alternating, sufficiently large swing leg.
  const fib = verifiedFibonacci(fibonacciFixture(10), 108);
  assert(fib.swingLow != null && fib.swingHigh != null, "Fibonacci did not select the known confirmed swing");
  assertNear("Fibonacci swing low", fib.swingLow, 90);
  assertNear("Fibonacci swing high", fib.swingHigh, 110);
  assert(fib.direction === "Upswing", "Fibonacci selected the wrong swing direction");
  assertNear("Fib 23.6%", fib.levels[0]?.price ?? null, 105.28);
  assertNear("Fib 38.2%", fib.levels[1]?.price ?? null, 102.36);
  assertNear("Fib 50%", fib.levels[2]?.price ?? null, 100);
  assert(fib.anchors?.endIndex < 67, "Fibonacci used an unconfirmed pivot at the end of the series");
  cases += 1;

  // Volume must be distributed across the candle range and the 70% value area must be present.
  const profileCandles: TechnicalCandle[] = [];
  for (let i = 0; i < 20; i += 1) profileCandles.push(candle(i, 2, 3, 1, 2, { tickVolume: 10 }));
  for (let i = 20; i < 30; i += 1) profileCandles.push(candle(i, 8, 9, 7, 8, { tickVolume: 10 }));
  for (let i = 30; i < 40; i += 1) profileCandles.push(candle(i, 5, 6, 4, 5, { tickVolume: 10 }));
  const profile = verifiedVolumeProfile(profileCandles, 10);
  assert(profile.poc != null && profile.valueAreaLow != null && profile.valueAreaHigh != null, "Volume Profile omitted POC or value area");
  assert(profile.poc! >= profile.valueAreaLow! && profile.poc! <= profile.valueAreaHigh!, "POC is outside the value area");
  assertNear("Volume profile total tick count", profile.totalWeight, 400);
  assert(profile.source === "BiQuote tick volume proxy", "Volume Profile did not disclose its tick-volume source");
  assert(profile.valueAreaHigh! > profile.valueAreaLow!, "Value area has no width");
  cases += 1;

  const zeroVolume = profileCandles.map(c => ({ ...c, tickVolume: 0 }));
  const zeroProfile = verifiedVolumeProfile(zeroVolume, 10);
  assert(zeroProfile.poc == null, "Zero tick volume must not produce a fabricated POC");
  cases += 1;

  // Engulfing quality must be derived from measurable candle geometry and include invalidation.
  const bullish = patternBase();
  bullish[10] = candle(10, 10, 10.2, 8, 8.2);
  bullish[11] = candle(11, 8, 10.5, 7.5, 10.2);
  const bullPattern = verifiedPatterns(bullish).find(p => p.name === "Bullish Engulfing");
  assert(Boolean(bullPattern), "Bullish engulfing fixture was not detected");
  assert(bullPattern!.confidence >= 50 && bullPattern!.confidence <= 95, "Bullish engulfing quality is outside its bounded range");
  assert(bullPattern!.invalidation.includes("7.5"), "Bullish engulfing omitted its invalidation level");

  const strongerBullish = patternBase();
  strongerBullish[10] = candle(10, 10, 10.2, 8, 8.2);
  strongerBullish[11] = candle(11, 7.5, 11, 7, 10.8);
  const strongerPattern = verifiedPatterns(strongerBullish).find(p => p.name === "Bullish Engulfing");
  assert(Boolean(strongerPattern) && strongerPattern!.confidence > bullPattern!.confidence, "Pattern quality did not respond to stronger engulfing geometry");
  cases += 1;

  const bearish = patternBase();
  bearish[10] = candle(10, 8, 10.2, 7.8, 10);
  bearish[11] = candle(11, 10.2, 10.5, 7.5, 7.8);
  assert(verifiedPatterns(bearish).some(p => p.name === "Bearish Engulfing"), "Bearish engulfing fixture was not detected");
  cases += 1;

  const rejection = patternBase();
  rejection[11] = candle(11, 10.5, 11.2, 8, 11);
  assert(verifiedPatterns(rejection).some(p => p.name === "Bullish Rejection"), "Bullish rejection fixture was not detected");
  cases += 1;

  // Missing EMA200 must reduce EMA component weight instead of silently keeping the full 25%.
  const shortAnalysis = analyzeVerified(oscillatingFixture(100, 0.2));
  const emaComponent = shortAnalysis.confluence.components.find(component => component.name === "EMA structure");
  assert(shortAnalysis.ema.ema200 == null, "Short-history fixture unexpectedly has EMA200");
  assert(emaComponent != null && emaComponent.weight < 25, "Missing EMA200 did not reduce EMA confluence weight");
  assert(shortAnalysis.confluence.coverage < 100, "Short history was reported as complete evidence coverage");
  cases += 1;

  // Changing only candle range changes ATR but must not change directional confluence.
  const narrow = oscillatingFixture(240, 0.2);
  const wide = narrow.map(c => ({ ...c, h: c.c + 5, l: c.c - 5 }));
  const narrowAnalysis = analyzeVerified(narrow);
  const wideAnalysis = analyzeVerified(wide);
  assert(narrowAnalysis.volatility.atr14 !== wideAnalysis.volatility.atr14, "ATR fixture did not change volatility");
  assert(narrowAnalysis.confluence.score === wideAnalysis.confluence.score, "ATR-only change altered directional confluence");
  cases += 1;

  // A no-pattern result is neutral evidence, not an automatic directional vote.
  const flat = Array.from({ length: 240 }, (_, i) => candle(i, 100, 101, 99, 100));
  const flatAnalysis = analyzeVerified(flat);
  const priceAction = flatAnalysis.confluence.components.find(component => component.name === "Price action");
  assert(priceAction?.score === 50, "No detected pattern was not treated as neutral price-action evidence");
  assert(flatAnalysis.overall.bias === "Mixed", "Flat market should not produce a directional overall bias");
  cases += 1;

  return {
    passed: true,
    cases,
    note: "Independent deterministic tests for structural zones, swing selection, volume distribution/value area, pattern geometry/invalidation, evidence coverage and directional-score isolation.",
  };
}
