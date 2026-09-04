import { NextResponse } from "next/server";
import { analyze, type TechnicalPoint } from "../../../lib/technical";

type XausPoint = { t?: string; p?: number };

async function fetchIntraday(symbol: "xau" | "xag", hours: number): Promise<TechnicalPoint[]> {
  const response = await fetch(`https://xaus.com/api/v1/intraday?symbol=${symbol}&hours=${hours}&fresh=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`XAUS ${symbol} intraday unavailable (${response.status})`);
  const data = (await response.json()) as { points?: XausPoint[] };
  return Array.isArray(data.points)
    ? data.points
        .map((p) => ({ t: String(p.t ?? ""), p: Number(p.p) }))
        .filter((p) => Boolean(p.t) && Number.isFinite(p.p))
    : [];
}

async function fetchDailyGold(): Promise<TechnicalPoint[]> {
  const response = await fetch(`https://xaus.com/api/v1/history?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { points?: Array<{ d?: string; c?: number }> };
  return Array.isArray(data.points)
    ? data.points
        .map((p) => ({ t: String(p.d ?? ""), p: Number(p.c) }))
        .filter((p) => Boolean(p.t) && Number.isFinite(p.p))
    : [];
}

export async function GET(request: Request) {
  const requestedHours = Number(new URL(request.url).searchParams.get("hours") ?? 48);
  const hours = Number.isFinite(requestedHours) ? Math.min(168, Math.max(24, requestedHours)) : 48;

  try {
    const [goldIntraday, silverIntraday, goldDaily] = await Promise.all([
      fetchIntraday("xau", hours),
      fetchIntraday("xag", hours),
      fetchDailyGold(),
    ]);

    return NextResponse.json(
      {
        source: "XAUS",
        generatedAt: new Date().toISOString(),
        gold: {
          intraday: analyze(goldIntraday),
          daily: analyze(goldDaily),
        },
        silver: {
          intraday: analyze(silverIntraday),
          daily: analyze([]),
        },
        methodology: {
          note: "EMA 20/50/200, RSI 14, MACD 12/26/9, and local swing support/resistance are calculated from the XAUS recorded price series. Support/resistance levels are clustered within an adaptive tolerance to reduce duplicate nearby pivots. RSI and MACD are interpreted in combination with EMA structure; no synthetic values are generated when history is insufficient.",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Technical analysis unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
