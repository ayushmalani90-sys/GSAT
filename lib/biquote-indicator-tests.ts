import { atr, ema, macd, rma, rsi } from "./technical-reference";

function assertNear(name: string, actual: number | null, expected: number, tolerance: number) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
}

export function runBiquoteIndicatorTests() {
  const values = Array.from({ length: 600 }, (_, i) => 100 + i * 0.17 + Math.sin(i / 9) * 3 + Math.cos(i / 23) * 1.2);
  const candles = values.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    o: c - 0.2,
    h: c + 1.1 + Math.abs(Math.sin(i / 5)) * 0.3,
    l: c - 1.0 - Math.abs(Math.cos(i / 7)) * 0.2,
    c,
  }));

  const e20 = ema(values, 20);
  const e50 = ema(values, 50);
  const e200 = ema(values, 200);
  const r = rsi(values, 14);
  const m = macd(values, 12, 26, 9);
  const a = atr(candles, 14);

  if (e20 == null || e50 == null || e200 == null || r == null || m.line == null || m.signal == null || m.histogram == null || a == null) {
    throw new Error("Reference indicator engine did not produce complete values");
  }

  assertNear("EMA20 deterministic", ema(values, 20), e20, 1e-12);
  assertNear("EMA50 deterministic", ema(values, 50), e50, 1e-12);
  assertNear("EMA200 deterministic", ema(values, 200), e200, 1e-12);
  assertNear("RSI14 deterministic", rsi(values, 14), r, 1e-12);
  assertNear("MACD line deterministic", macd(values, 12, 26, 9).line, m.line, 1e-12);
  assertNear("MACD signal deterministic", macd(values, 12, 26, 9).signal, m.signal, 1e-12);
  assertNear("MACD histogram deterministic", macd(values, 12, 26, 9).histogram, m.histogram, 1e-12);
  assertNear("ATR14 deterministic", atr(candles, 14), a, 1e-12);

  return { passed: true, cases: 8, note: "These tests verify deterministic BiQuote-candle calculations, not TradingView/OANDA parity." };
}
