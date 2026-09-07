import { calculateIndicators, type TechnicalCandle } from "./technical-reference";

export function diagnoseIndicatorInput(candles: TechnicalCandle[]) {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const timestamps = sorted.map(c => Date.parse(c.t)).filter(Number.isFinite);
  const unique = new Set(timestamps);
  let gaps = 0;
  for (let i = 1; i < timestamps.length; i += 1) if (timestamps[i] - timestamps[i - 1] > 60 * 60 * 1000 + 1000) gaps += 1;
  const indicators = calculateIndicators(sorted);
  return {
    candles: sorted.length,
    first: sorted[0]?.t ?? null,
    last: sorted.at(-1)?.t ?? null,
    uniqueTimestamps: unique.size,
    duplicateTimestamps: sorted.length - unique.size,
    largeGaps: gaps,
    indicators,
  };
}
