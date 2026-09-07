export type MacroImpact = "HIGH" | "VERY HIGH";
export type MacroBias = "BULLISH" | "BEARISH" | "MIXED";

export type MacroEvent = {
  id: string;
  name: string;
  shortName: string;
  country: "US";
  impact: MacroImpact;
  releaseAtUtc: string;
  previous: number | string | null;
  forecast: number | string | null;
  actual: number | string | null;
  unit?: string;
  status: "UPCOMING" | "RELEASED";
  goldBias: MacroBias | null;
  silverBias: MacroBias | null;
  explanation: string;
};

export const IMPORTANT_US_MACRO_EVENTS = [
  "CPI",
  "CORE_CPI",
  "PCE",
  "CORE_PCE",
  "NFP",
  "UNEMPLOYMENT_RATE",
  "AVERAGE_HOURLY_EARNINGS",
  "FOMC_RATE_DECISION",
] as const;

export function macroBias(event: string, actual: number | null, forecast: number | null): MacroBias | null {
  if (actual == null || forecast == null) return null;
  const delta = actual - forecast;
  if (Math.abs(delta) < Number.EPSILON) return "MIXED";

  switch (event) {
    case "CPI":
    case "CORE_CPI":
    case "PCE":
    case "CORE_PCE":
      return delta < 0 ? "BULLISH" : "BEARISH";
    case "NFP":
    case "AVERAGE_HOURLY_EARNINGS":
      return delta < 0 ? "BULLISH" : "BEARISH";
    case "UNEMPLOYMENT_RATE":
      return delta > 0 ? "BULLISH" : "BEARISH";
    default:
      return "MIXED";
  }
}
