import { macd } from "./technical-reference";

export const MACD_WARMUP_CANDLES = 1000;
export const MACD_TOLERANCE = 0.05;

export function validateMacdInput(candles: Array<{ t: string; c: number }>) {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closed = sorted.filter((c) => Number.isFinite(c.c));
  return {
    candles: closed.length,
    sufficientHistory: closed.length >= MACD_WARMUP_CANDLES,
    latestTimestamp: closed.length ? closed.at(-1)!.t : null,
  };
}

export function calculateValidatedMacd(candles: Array<{ t: string; c: number }>) {
  const sorted = [...candles]
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .filter((c) => Number.isFinite(c.c));
  if (sorted.length === 0) return { ...validateMacdInput(sorted), macd: null, signal: null, histogram: null };
  const values = sorted.map((c) => c.c);
  const result = macd(values, 12, 26, 9);
  return { ...validateMacdInput(sorted), macd: result.line, signal: result.signal, histogram: result.histogram };
}
