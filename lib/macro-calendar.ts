export type MacroImpact = "HIGH" | "VERY HIGH";

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
};

const event = (input: Omit<MacroEvent, "releaseAtIst" | "status">): MacroEvent => ({
  ...input,
  releaseAtIst: new Date(input.releaseAtUtc).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }),
  status: Date.parse(input.releaseAtUtc) <= Date.now() ? "RELEASED" : "UPCOMING",
});

export const US_MACRO_SCHEDULE: MacroEvent[] = [
  event({ id: "cpi", name: "U.S. CPI Inflation", shortName: "CPI", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-11T12:30:00Z", previous: "3.4", forecast: null, actual: null, unit: "% YoY" }),
  event({ id: "core-cpi", name: "U.S. Core CPI", shortName: "Core CPI", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-11T12:30:00Z", previous: "2.5", forecast: null, actual: null, unit: "% YoY" }),
  event({ id: "fomc", name: "FOMC Interest Rate Decision", shortName: "FOMC Rate", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-16T18:00:00Z", previous: null, forecast: null, actual: null, unit: "%" }),
  event({ id: "pce", name: "PCE Price Index", shortName: "PCE", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-30T12:30:00Z", previous: "3.7", forecast: null, actual: null, unit: "% YoY" }),
  event({ id: "core-pce", name: "Core PCE Price Index", shortName: "Core PCE", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-09-30T12:30:00Z", previous: "3.3", forecast: null, actual: null, unit: "% YoY" }),
  event({ id: "nfp", name: "Nonfarm Payrolls", shortName: "NFP", country: "US", impact: "VERY HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", previous: "162K", forecast: null, actual: null, unit: "K" }),
  event({ id: "unemployment", name: "U.S. Unemployment Rate", shortName: "Unemployment", country: "US", impact: "HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", previous: "4.1", forecast: null, actual: null, unit: "%" }),
  event({ id: "earnings", name: "Average Hourly Earnings", shortName: "Hourly Earnings", country: "US", impact: "HIGH", releaseAtUtc: "2026-10-02T12:30:00Z", previous: "3.1", forecast: null, actual: null, unit: "% YoY" }),
];

export function getUpcomingMacroEvents(now = new Date()): MacroEvent[] {
  return US_MACRO_SCHEDULE
    .filter((item) => Date.parse(item.releaseAtUtc) >= now.getTime())
    .sort((a, b) => Date.parse(a.releaseAtUtc) - Date.parse(b.releaseAtUtc));
}
