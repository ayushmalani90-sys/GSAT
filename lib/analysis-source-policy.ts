export const ANALYSIS_SOURCE_POLICY = {
  liveQuotes: "BiQuote",
  ohlc: "BiQuote",
  indicators: "GSAT-calculated-from-BiQuote-OHLC",
  chartDisplay: "TradingView-OANDA-display-only",
  prohibitedAnalysisSource: "OANDA-API",
} as const;

export function analysisSourceNote() {
  return "TradingView OANDA charts are display-only. All GSAT technical calculations are generated from normalized BiQuote OHLC data.";
}
