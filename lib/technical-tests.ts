import { atr, ema, macd, rma, rsi } from "./technical-reference";

function assertNear(name: string, actual: number | null, expected: number, tolerance = 1e-10) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
}

export function runIndicatorSelfTests() {
  const values = Array.from({ length: 240 }, (_, i) => 100 + i * 0.25 + Math.sin(i / 7) * 2);
  const candles = values.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    o: c - 0.1,
    h: c + 0.8,
    l: c - 0.9,
    c,
  }));

  if (ema(values, 20) == null) throw new Error("EMA20 missing");
  if (ema(values, 50) == null) throw new Error("EMA50 missing");
  if (ema(values, 200) == null) throw new Error("EMA200 missing");
  if (rma(values, 14) == null) throw new Error("RMA14 missing");
  if (rsi(values, 14) == null) throw new Error("RSI14 missing");
  if (macd(values, 12, 26, 9).line == null) throw new Error("MACD missing");
  if (atr(candles, 14) == null) throw new Error("ATR14 missing");

  assertNear("EMA constant", ema(Array(30).fill(100), 20), 100);
  assertNear("RMA constant", rma(Array(30).fill(100), 14), 100);
  assertNear("RSI constant", rsi(Array(30).fill(100), 14), 50);
  assertNear("ATR constant-range", atr(Array.from({ length: 30 }, (_, i) => ({
    t: String(i), o: 99, h: 101, l: 99, c: 100,
  })), 14), 2);

  return { passed: true, cases: 10 };
}
