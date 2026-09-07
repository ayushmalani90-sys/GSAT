import { atr, ema, macd, rsi, type TechnicalCandle } from "./technical-reference";

export type ParityReport = {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  samples: number;
  completedOnly: boolean;
};

export const REQUIRED_WARMUP = {
  ema20: 300,
  ema50: 300,
  ema200: 400,
  rsi14: 250,
  macd: 300,
  atr14: 250,
} as const;

function sortedCompleted(candles: TechnicalCandle[]) {
  return [...candles]
    .filter((c) => Number.isFinite(Date.parse(c.t)) && [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function calculateParityIndicators(candles: TechnicalCandle[]): ParityReport {
  const sorted = sortedCompleted(candles);
  const closes = sorted.map((c) => c.c);
  const m = macd(closes, 12, 26, 9);
  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    macd: m.line,
    macdSignal: m.signal,
    macdHistogram: m.histogram,
    atr14: atr(sorted, 14),
    samples: sorted.length,
    completedOnly: true,
  };
}

export function validateIndicatorAvailability(report: ParityReport) {
  return {
    ema20: report.samples >= REQUIRED_WARMUP.ema20 && report.ema20 != null,
    ema50: report.samples >= REQUIRED_WARMUP.ema50 && report.ema50 != null,
    ema200: report.samples >= REQUIRED_WARMUP.ema200 && report.ema200 != null,
    rsi14: report.samples >= REQUIRED_WARMUP.rsi14 && report.rsi14 != null,
    macd: report.samples >= REQUIRED_WARMUP.macd && report.macd != null && report.macdSignal != null && report.macdHistogram != null,
    atr14: report.samples >= REQUIRED_WARMUP.atr14 && report.atr14 != null,
  };
}
