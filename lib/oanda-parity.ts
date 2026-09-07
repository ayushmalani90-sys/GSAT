import type { TechnicalCandle } from "./technical-reference";
import { ema, rsi, macd, atr } from "./technical-reference";

export type OandaReference = {
  symbol: string;
  timeframe: string;
  capturedAt: string;
  price?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  atr14?: number;
};

export type ParityRow = {
  name: string;
  gsat: number | null;
  reference: number | undefined;
  difference: number | null;
  status: "PASS" | "FAIL" | "UNVERIFIED";
};

const TOLERANCE: Record<string, number> = {
  EMA20: 0.02,
  EMA50: 0.02,
  EMA200: 0.05,
  RSI14: 0.1,
  MACD: 0.02,
  MACD_SIGNAL: 0.02,
  MACD_HISTOGRAM: 0.02,
  ATR14: 0.05,
};

function compare(name: string, gsat: number | null, reference: number | undefined): ParityRow {
  if (gsat == null || reference == null || !Number.isFinite(reference)) return { name, gsat, reference, difference: null, status: "UNVERIFIED" };
  const difference = Math.abs(gsat - reference);
  return { name, gsat, reference, difference, status: difference <= TOLERANCE[name] ? "PASS" : "FAIL" };
}

export function calculateParity(candles: TechnicalCandle[], reference: OandaReference): ParityRow[] {
  const closes = candles.map((c) => c.c);
  const m = macd(closes, 12, 26, 9);
  return [
    compare("EMA20", ema(closes, 20), reference.ema20),
    compare("EMA50", ema(closes, 50), reference.ema50),
    compare("EMA200", ema(closes, 200), reference.ema200),
    compare("RSI14", rsi(closes, 14), reference.rsi14),
    compare("MACD", m.line, reference.macd),
    compare("MACD_SIGNAL", m.signal, reference.macdSignal),
    compare("MACD_HISTOGRAM", m.histogram, reference.macdHistogram),
    compare("ATR14", atr(candles, 14), reference.atr14),
  ];
}

export function parityStatus(rows: ParityRow[]) {
  const verified = rows.filter((r) => r.status !== "UNVERIFIED");
  if (!verified.length) return "UNVERIFIED" as const;
  return verified.every((r) => r.status === "PASS") ? "PASS" as const : "FAIL" as const;
}
