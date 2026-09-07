export type RsiReference = {
  name: "TradingView-compatible Wilder RSI";
  period: number;
  notes: string;
};

/**
 * Reference specification for RSI(14).
 * The calculation intentionally starts from the first available price change
 * and uses Wilder's RMA recurrence. This file documents the reference method;
 * it does not fabricate a live TradingView value.
 */
export const RSI_REFERENCE: RsiReference = {
  name: "TradingView-compatible Wilder RSI",
  period: 14,
  notes:
    "Use close-to-close changes, separate positive/negative changes, seed each Wilder average with the arithmetic mean of the first 14 changes, then apply avg = (prevAvg*13 + current)/14. The final RSI is 100 - 100/(1 + avgGain/avgLoss). Exact TradingView parity still requires identical symbol feed, timestamps, session handling, and completed candles.",
};
