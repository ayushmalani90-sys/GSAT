import { atr, ema, macd, rsi } from "./technical-reference";

function assertNear(name: string, actual: number | null, expected: number, tolerance = 1e-9) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
}

/**
 * Fixed golden outputs for a deterministic 240-close fixture.
 * Expected constants were calculated independently with a separate Python reference implementation.
 * These tests validate formulas/seeding, not TradingView/OANDA parity or BiQuote history availability.
 */
export function runBiquoteIndicatorTests() {
  const values = Array.from({ length: 240 }, (_, i) => 100 + i * 0.25 + Math.sin(i / 7) * 2);
  const candles = values.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    o: c - 0.1,
    h: c + 0.8,
    l: c - 0.9,
    c,
  }));

  assertNear("EMA20 golden", ema(values, 20), 158.4829391999872);
  assertNear("EMA50 golden", ema(values, 50), 154.16361086663048);
  assertNear("EMA200 golden", ema(values, 200), 135.01256148195998);
  assertNear("RSI14 golden", rsi(values, 14), 99.68017716611763);
  const m = macd(values, 12, 26, 9);
  assertNear("MACD line golden", m.line, 2.1329387069332313);
  assertNear("MACD signal golden", m.signal, 2.2805924991872195);
  assertNear("MACD histogram golden", m.histogram, -0.14765379225398823);
  assertNear("ATR14 golden", atr(candles, 14), 1.7000000000000142);

  return {
    passed: true,
    cases: 8,
    note: "Fixed independent golden outputs; formula validation only, not TradingView/OANDA parity.",
  };
}
