import { atr, ema, macd, rsi, type TechnicalCandle } from "./technical";

export type ValidationStatus = "PASS" | "FAIL" | "UNVERIFIED";

export type ValidationCase = {
  name: string;
  gsat: number | null;
  reference: number | null;
  difference: number | null;
  tolerance: number;
  status: ValidationStatus;
  note?: string;
};

export type ValidationReport = {
  symbol: string;
  timeframe: string;
  candleCount: number;
  generatedAt: string;
  status: ValidationStatus;
  cases: ValidationCase[];
  limitation: string;
};

const compare = (name: string, gsat: number | null, reference: number | null, tolerance: number, note?: string): ValidationCase => {
  if (gsat == null || reference == null || !Number.isFinite(gsat) || !Number.isFinite(reference)) {
    return { name, gsat, reference, difference: null, tolerance, status: "UNVERIFIED", note };
  }
  const difference = Math.abs(gsat - reference);
  return { name, gsat, reference, difference: Number(difference.toFixed(6)), tolerance, status: difference <= tolerance ? "PASS" : "FAIL", note };
};

export function validateAgainstReference(
  symbol: string,
  timeframe: string,
  candles: TechnicalCandle[],
  reference: Partial<Record<string, number | null>>,
): ValidationReport {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = sorted.map((c) => c.c).filter(Number.isFinite);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const macdValues = macd(closes);
  const atr14 = atr(sorted, 14);

  const cases: ValidationCase[] = [
    compare("EMA20", e20, reference.ema20 ?? null, 0.02),
    compare("EMA50", e50, reference.ema50 ?? null, 0.02),
    compare("EMA200", e200, reference.ema200 ?? null, 0.05),
    compare("RSI14", rsi14, reference.rsi14 ?? null, 0.10),
    compare("MACD Line", macdValues.line, reference.macd ?? null, 0.02),
    compare("MACD Signal", macdValues.signal, reference.macdSignal ?? null, 0.02),
    compare("MACD Histogram", macdValues.histogram, reference.macdHistogram ?? null, 0.02),
    compare("ATR14", atr14, reference.atr14 ?? null, 0.02),
  ];

  const status: ValidationStatus = cases.some((c) => c.status === "FAIL")
    ? "FAIL"
    : cases.every((c) => c.status === "PASS")
      ? "PASS"
      : "UNVERIFIED";

  return {
    symbol,
    timeframe,
    candleCount: sorted.length,
    generatedAt: new Date().toISOString(),
    status,
    cases,
    limitation: "A PASS here means GSAT matches the explicitly supplied reference values within tolerance. It does not claim TradingView parity unless the reference values come from the same TradingView symbol, timeframe, candle set, and completed-bar state.",
  };
}
