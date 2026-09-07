import type { MacroBias, MacroEvent } from "./macro-calendar";

export type MacroRelease = Pick<MacroEvent, "id" | "name" | "shortName" | "impact" | "releaseAtUtc" | "releaseAtIst" | "previous" | "forecast" | "actual" | "unit" | "status" | "goldBias" | "silverBias" | "explanation">;

// Release history is kept separate from the schedule so that upcoming events can
// be populated as soon as dates are known and released observations can be added
// later without changing the event identity.
export const MACRO_RELEASE_HISTORY: MacroRelease[] = [];

export function releasedMacroEvents(now = new Date()): MacroRelease[] {
  return MACRO_RELEASE_HISTORY.filter((event) => Date.parse(event.releaseAtUtc) <= now.getTime()).sort((a, b) => Date.parse(b.releaseAtUtc) - Date.parse(a.releaseAtUtc));
}

export function withMacroBias(event: MacroRelease, goldBias: MacroBias | null, silverBias: MacroBias | null): MacroRelease {
  return { ...event, goldBias, silverBias };
}
