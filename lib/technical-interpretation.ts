export function emaWarmupSamples(period: number): number {
  if (!Number.isInteger(period) || period <= 0) return Number.POSITIVE_INFINITY;
  const alpha = 2 / (period + 1);
  const updatesForOnePercentSeedWeight = Math.ceil(Math.log(0.01) / Math.log(1 - alpha));
  return period + updatesForOnePercentSeedWeight;
}

export function hasEmaWarmup(samples: number, period: number): boolean {
  return Number.isFinite(samples) && samples >= emaWarmupSamples(period);
}

export function classifyMacdState(line: number | null, histogram: number | null): string {
  if (line == null || histogram == null || !Number.isFinite(line) || !Number.isFinite(histogram)) return "MACD unavailable";
  if (line > 0 && histogram > 0) return "MACD above zero and signal (positive trend and momentum)";
  if (line > 0 && histogram < 0) return "MACD above zero but below signal (upside momentum easing)";
  if (line < 0 && histogram > 0) return "MACD below zero but above signal (downside momentum easing)";
  if (line < 0 && histogram < 0) return "MACD below zero and signal (negative trend and momentum)";
  if (line > 0) return "MACD above zero and at signal line";
  if (line < 0) return "MACD below zero and at signal line";
  return "MACD at zero (mixed/neutral state)";
}

export function scoreMacdState(line: number | null, histogram: number | null): number | null {
  if (line == null || histogram == null || !Number.isFinite(line) || !Number.isFinite(histogram)) return null;
  if (line > 0 && histogram > 0) return 100;
  if (line < 0 && histogram < 0) return 0;
  return 50;
}
