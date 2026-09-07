import { NextResponse } from "next/server";
import { getUpcomingMacroEvents, US_MACRO_SCHEDULE } from "../../../lib/macro-calendar";

export async function GET() {
  const now = new Date();
  const upcoming = getUpcomingMacroEvents(now);
  const recent = US_MACRO_SCHEDULE
    .filter((event) => Date.parse(event.releaseAtUtc) < now.getTime())
    .sort((a, b) => Date.parse(b.releaseAtUtc) - Date.parse(a.releaseAtUtc))
    .slice(0, 8);

  const events = [...upcoming, ...recent].map((item) => ({
    ...item,
    releaseAtIst: new Date(item.releaseAtUtc).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
    }),
  }));

  return NextResponse.json(
    {
      source: "GSAT macro schedule",
      timezone: "Asia/Kolkata",
      events,
      generatedAt: now.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
