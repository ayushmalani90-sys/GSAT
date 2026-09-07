import type { TechnicalCandle } from "./technical";

export type ValidationReferenceCase = {
  symbol: "XAUUSD" | "XAGUSD";
  timeframe: "15m" | "1H" | "4H" | "1D";
  source: "TradingView" | "TA-Lib" | "GSAT-reference";
  status: "REFERENCE_REQUIRED";
  note: string;
  candles?: TechnicalCandle[];
  reference?: Partial<Record<"ema20" | "ema50" | "ema200" | "rsi14" | "macd" | "macdSignal" | "macdHistogram" | "atr14", number>>;
};

/**
 * Reference values are intentionally empty until a human-verified TradingView
 * export or API-equivalent dataset is attached for the exact same completed
 * candle set. Never fabricate a reference number here.
 */
export const VALIDATION_REFERENCE_CASES: ValidationReferenceCase[] =
  (['XAUUSD', 'XAGUSD'] as const).flatMap((symbol) =>
    (['15m', '1H', '4H', '1D'] as const).map((timeframe) => ({
      symbol,
      timeframe,
      source: 'TradingView' as const,
      status: 'REFERENCE_REQUIRED' as const,
      note: 'Supply verified TradingView values from the exact same completed-bar dataset before declaring PASS.',
    })),
  );
