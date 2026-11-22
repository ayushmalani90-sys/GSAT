export const ANALYSIS_SOURCE_POLICY = {
  liveQuotes: "BiQuote",
  ohlc: "BiQuote",
  indicators: "GSAT-calculated-from-Supabase-stored-BiQuote-OHLC",
  chartDisplay: "TradingView-OANDA-display-only",
  prohibitedAnalysisSource: "OANDA-API",
} as const;

export function analysisSourceNote() {
  return "All GSAT technical calculations read completed BiQuote OHLC candles persisted in Supabase. TradingView OANDA charts are display-only and never feed indicators.";
}
