import { NextResponse } from "next/server";
import { analyzeV2, type TechnicalPoint } from "../../../lib/technical_v2";

type XausPoint = { t?: string; p?: number };

async function fetchIntraday(symbol: "xau" | "xag", hours: number): Promise<TechnicalPoint[]> {
  const response = await fetch(`https://xaus.com/api/v1/intraday?symbol=${symbol}&hours=${hours}&fresh=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`XAUS ${symbol} intraday unavailable (${response.status})`);
  const data = (await response.json()) as { points?: XausPoint[] };
  return Array.isArray(data.points) ? data.points.map((p) => ({ t: String(p.t ?? ""), p: Number(p.p) })).filter((p) => Boolean(p.t) && Number.isFinite(p.p)) : [];
}

export async function GET(request: Request) {
  const requestedHours = Number(new URL(request.url).searchParams.get("hours") ?? 72);
  const hours = Number.isFinite(requestedHours) ? Math.min(168, Math.max(24, requestedHours)) : 72;
  try {
    const [gold, silver] = await Promise.all([fetchIntraday("xau", hours), fetchIntraday("xag", hours)]);
    return NextResponse.json({
      source: "XAUS",
      generatedAt: new Date().toISOString(),
      gold: { intraday: analyzeV2(gold) },
      silver: { intraday: analyzeV2(silver) },
      methodology: { note: "GSAT technical engine uses the real XAUS recorded intraday series. EMA 20/50/200, RSI 14 and MACD 12/26/9 are calculated from those observations. Support and resistance come from five-point swing pivots clustered into nearby levels; repeated pivots increase strength. No synthetic price levels are created." },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Technical analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
