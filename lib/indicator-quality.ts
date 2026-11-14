export type IndicatorHistoryStatus = "unavailable" | "calculable" | "warmup_recommended";

type IndicatorRequirement = {
  minBars: number;
  recommendedWarmupBars: number;
  available: boolean;
  recommendedWarmupMet: boolean;
  status: IndicatorHistoryStatus;
};

function requirement(samples: number, minBars: number, recommendedWarmupBars: number): IndicatorRequirement {
  const available = samples >= minBars;
  const recommendedWarmupMet = samples >= recommendedWarmupBars;
  return {
    minBars,
    recommendedWarmupBars,
    available,
    recommendedWarmupMet,
    status: !available ? "unavailable" : recommendedWarmupMet ? "calculable" : "warmup_recommended",
  };
}

/**
 * Separates mathematical minimum history from a conservative warm-up target.
 * Recommended warm-up counts reduce seed sensitivity; they are not guarantees
 * of predictive accuracy and are not hard requirements for indicator calculation.
 */
export function assessIndicatorHistory(rawSamples: number) {
  const samples = Number.isFinite(rawSamples) ? Math.max(0, Math.floor(rawSamples)) : 0;

  const indicators = {
    ema20: requirement(samples, 20, 100),
    ema50: requirement(samples, 50, 250),
    ema200: requirement(samples, 200, 1000),
    rsi14: requirement(samples, 15, 100),
    macd12269: requirement(samples, 34, 200),
    atr14: requirement(samples, 14, 100),
  };

  const contextModules = {
    supportResistance: requirement(samples, 50, 100),
    fibonacci: requirement(samples, 30, 100),
    volumeProfile: requirement(samples, 40, 100),
    candlestickPatterns: requirement(samples, 12, 40),
  };

  const core = Object.values(indicators);
  const coreCalculationAvailable = core.every((item) => item.available);
  const recommendedWarmupMet = core.every((item) => item.recommendedWarmupMet);

  return {
    samples,
    status: !coreCalculationAvailable
      ? "insufficient_history" as const
      : recommendedWarmupMet
        ? "recommended_warmup_met" as const
        : "calculable_warmup_short" as const,
    coreCalculationAvailable,
    recommendedWarmupMet,
    ema200Available: indicators.ema200.available,
    indicators,
    contextModules,
    notes: [
      "Minimum bars mean the formula can return a value; they do not guarantee stable seed convergence.",
      "Recommended warm-up targets are conservative engineering guidance, not a claim of prediction accuracy.",
      "Volume Profile uses the available BiQuote broker/tick-volume proxy, not centralized exchange volume-at-price.",
    ],
  };
}
