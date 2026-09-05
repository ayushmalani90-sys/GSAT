import { NextResponse } from "next/server";
import { analyze, type TechnicalPoint } from "../../../lib/technical";

type XausPoint = { t?: string; p?: number };

const FRAME_MINUTES: Record<string, number> = {
  "15m": 15,
  "1H": 60,
  "4H": 240,
};

function bucketPoints(points: TechnicalPoint[], timeframe: string): TechnicalPoint[] {
  const minutes = FRAME_MINUTES[timeframe];
  if (!minutes || minutes === 1) return points;
  const bucketMs = minutes * 60_000;
  const buckets = new Map<number, TechnicalPoint>();
  for (const point of points) {
    const ts = Date.parse(point.t);
    if (!Number.isFinite(ts)) continue;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucket, { t: new Date(bucket).toISOString(), p: point.p });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedHours = Number(params.get("hours") ?? 72);
  const timeframe = params.get("timeframe") ?? "1H";
  const hours = Number.isFinite(requestedHours) ? Math.min(720, Math.max(24, requestedHours)) : 72;

  try {
    const [goldRaw, silverRaw] = await Promise.all([fetchIntraday("xau", hours), fetchIntraday("xag", hours)]);
    const gold = bucketPoints(goldRaw, timeframe);
    const silver = bucketPoints(silverRaw, timeframe);
    return NextResponse.json(
      {
        source: "XAUS",
        generatedAt: new Date().toISOString(),
        timeframe,
        gold: { intraday: analyze(gold) },
        silver: { intraday: analyze(silver) },
        methodology: {
          note: "EMA 20/50/200, RSI 14, MACD 12/26/9 and clustered swing support/resistance are calculated from timeframe-aligned XAUS observations. 15m/1H/4H use real intraday observations aggregated into the selected interval; no synthetic price values are created.",
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
