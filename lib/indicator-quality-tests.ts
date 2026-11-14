import { assessIndicatorHistory } from "./indicator-quality";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export function runIndicatorQualityTests() {
  const at14 = assessIndicatorHistory(14);
  assert(at14.indicators.atr14.available, "ATR14 should be calculable with 14 candles");
  assert(!at14.indicators.rsi14.available, "RSI14 requires 15 closes");
  assert(!at14.indicators.macd12269.available, "MACD 12/26/9 requires 34 closes");

  const at15 = assessIndicatorHistory(15);
  assert(at15.indicators.rsi14.available, "RSI14 should be calculable with 15 closes");

  const at33 = assessIndicatorHistory(33);
  assert(!at33.indicators.macd12269.available, "MACD should remain unavailable at 33 closes");

  const at34 = assessIndicatorHistory(34);
  assert(at34.indicators.macd12269.available, "MACD should be calculable at 34 closes");

  const at199 = assessIndicatorHistory(199);
  assert(!at199.ema200Available, "EMA200 must be unavailable below 200 closes");

  const at200 = assessIndicatorHistory(200);
  assert(at200.ema200Available, "EMA200 should be calculable at 200 closes");
  assert(!at200.recommendedWarmupMet, "200 bars must not be labelled as the recommended EMA200 warm-up");

  const at999 = assessIndicatorHistory(999);
  assert(!at999.recommendedWarmupMet, "999 bars must remain below the 1,000-bar recommended warm-up");

  const at1000 = assessIndicatorHistory(1000);
  assert(at1000.recommendedWarmupMet, "1,000 bars should satisfy all core recommended warm-up targets");

  return {
    passed: true,
    cases: 8,
    note: "History readiness distinguishes minimum mathematical requirements from recommended warm-up targets.",
  };
}
