import { NextResponse } from "next/server";
import { getUpcomingMacroEvents } from "@/lib/macro-calendar";

export async function GET() {
  const events = getUpcomingMacroEvents(new Date()).map((event) => ({
    ...event,
    releaseAtIst: new Date(event.releaseAtUtc).toLocaleString("en-IN", {
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
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
