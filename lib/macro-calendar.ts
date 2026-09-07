export type MacroImpact = "HIGH" | "VERY HIGH";
export type MacroBias = "BULLISH" | "BEARISH" | "MIXED";

export type MacroEvent = {
  id: string;
  name: string;
  shortName: string;
  country: "US";
  impact: MacroImpact;
  releaseAtUtc: string;
  releaseAtIst: string;
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

export const US_MACRO_SCHEDULE: MacroEvent[] = [
  { id: "cpi", name: "U.S. CPI Inflation", shortName: "CPI", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-11T12:30:00Z", releaseAtIst: "11 Sep 2026, 6:00 PM IST", previous: "3.4", forecast: null, actual: null, unit: "% YoY", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Major inflation release; lower-than-expected inflation is generally supportive for precious metals, while higher-than-expected inflation can pressure them." },
  { id: "core-cpi", name: "U.S. Core CPI", shortName: "Core CPI", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-11T12:30:00Z", releaseAtIst: "11 Sep 2026, 6:00 PM IST", previous: "2.5", forecast: null, actual: null, unit: "% YoY", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Core inflation is closely watched for Federal Reserve policy expectations and precious-metal pricing." },
  { id: "fomc", name: "FOMC Interest Rate Decision", shortName: "FOMC Rate", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-16T18:00:00Z", releaseAtIst: "16 Sep 2026, 11:30 PM IST", previous: null, forecast: null, actual: null, unit: "%", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Fed rate decision and policy stance can cause immediate moves in yields, USD and precious metals." },
  { id: "pce", name: "PCE Price Index", shortName: "PCE", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-30T12:30:00Z", releaseAtIst: "30 Sep 2026, 6:00 PM IST", previous: null, forecast: null, actual: null, unit: "% YoY", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Fed-preferred inflation gauge with direct implications for rate expectations." },
  { id: "core-pce", name: "Core PCE Price Index", shortName: "Core PCE", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-30T12:30:00Z", releaseAtIst: "30 Sep 2026, 6:00 PM IST", previous: null, forecast: null, actual: null, unit: "% YoY", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Core inflation measure used heavily in Fed policy assessment." },
  { id: "nfp", name: "Nonfarm Payrolls", shortName: "NFP", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", releaseAtIst: "2 Oct 2026, 6:00 PM IST", previous: null, forecast: null, actual: null, unit: "K", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Major U.S. labor-market release; stronger employment can lift yields and USD and weigh on precious metals." },
  { id: "unemployment", name: "U.S. Unemployment Rate", shortName: "Unemployment", country: "US", impact: "HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", releaseAtIst: "2 Oct 2026, 6:00 PM IST", previous: null, forecast: null, actual: null, unit: "%", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Labor-market indicator released with NFP and useful for judging rate-path expectations." },
  { id: "earnings", name: "Average Hourly Earnings", shortName: "Hourly Earnings", country: "US", impact: "HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", releaseAtIst: "2 Oct 2026, 6:00 PM IST", previous: null, forecast: null, actual: null, unit: "%", status: "UPCOMING", goldBias: null, silverBias: null, explanation: "Wage-growth component of the employment report that can affect inflation and Fed expectations." },
];

export function macroBias(event: string, actual: number | null, forecast: number | null): MacroBias | null {
  if (actual == null || forecast == null) return null;
  const delta = actual - forecast;
  if (Math.abs(delta) < Number.EPSILON) return "MIXED";
  switch (event) {
    case "CPI": case "CORE_CPI": case "PCE": case "CORE_PCE": case "NFP": case "AVERAGE_HOURLY_EARNINGS":
      return delta < 0 ? "BULLISH" : "BEARISH";
    case "UNEMPLOYMENT_RATE":
      return delta > 0 ? "BULLISH" : "BEARISH";
    default:
      return "MIXED";
  }
}

export function getUpcomingMacroEvents(now = new Date()): MacroEvent[] {
  return US_MACRO_SCHEDULE.filter((event) => Date.parse(event.releaseAtUtc) >= now.getTime()).sort((a, b) => Date.parse(a.releaseAtUtc) - Date.parse(b.releaseAtUtc));
}
