import { calculateIndependentIndicatorReference } from "./indicator-benchmark";

function assertNear(name: string, actual: number | null, expected: number, tolerance = 1e-9) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
}

export function runIndependentBenchmarkTests() {
  const closes = Array.from({ length: 240 }, (_, i) => 100 + i * 0.25 + Math.sin(i / 7) * 2);
  const candles = closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    o: c - 0.1,
    h: c + 0.8,
    l: c - 0.9,
    c,
  }));
  const result = calculateIndependentIndicatorReference(candles);

  assertNear("Independent EMA20", result.ema20, 158.4829391999872);
  assertNear("Independent EMA50", result.ema50, 154.16361086663048);
  assertNear("Independent EMA200", result.ema200, 135.01256148195998);
  assertNear("Independent RSI14", result.rsi14, 99.68017716611763);
  assertNear("Independent MACD line", result.macd, 2.1329387069332313);
  assertNear("Independent MACD signal", result.macdSignal, 2.2805924991872195);
  assertNear("Independent MACD histogram", result.macdHistogram, -0.14765379225398823);
  assertNear("Independent ATR14", result.atr14, 1.7000000000000142);

  return {
    passed: true,
    cases: 8,
    note: "Separate reference implementation checked against fixed independently generated golden values.",
  };
}
