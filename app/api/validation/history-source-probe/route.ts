import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";

export const runtime = "nodejs";
export const maxDuration = 20;

const TIMEFRAMES = ["M15", "H1", "H4", "D1"] as const;
const SYMBOLS = ["XAUUSD", "XAGUSD"] as const;

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") ?? "XAUUSD").toUpperCase();
  const timeframe = (params.get("timeframe") ?? "M15").toUpperCase();
  const year = Number(params.get("year") ?? "2025");
  if (!SYMBOLS.includes(symbol as (typeof SYMBOLS)[number])) {
    return NextResponse.json({ error: "symbol must be XAUUSD or XAGUSD" }, { status: 400 });
  }
  if (!TIMEFRAMES.includes(timeframe as (typeof TIMEFRAMES)[number])) {
    return NextResponse.json({ error: "timeframe must be M15, H1, H4 or D1" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2003 || year > 2025) {
    return NextResponse.json({ error: "year must be a closed year from 2003 to 2025" }, { status: 400 });
  }

  try {
    const pageResponse = await fetch("https://evtradelabs.com/data", {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 GSAT historical-source validation" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!pageResponse.ok) throw new Error("EV Trading Labs catalogue returned HTTP " + pageResponse.status);
    const html = await pageResponse.text();
    const archiveUrls = [...html.matchAll(/https:\/\/evtradelabs\.com\/api\/simulator\/data\/[A-Z0-9]+\/[A-Z0-9]+\/\d{4}\.json\.gz/g)]
      .map((match) => match[0]);
    const url = archiveUrls.find((value) => value.includes(`/${symbol}/${timeframe}/${year}.json.gz`));
    if (!url) {
      return NextResponse.json({
        ok: false,
        catalogueStatus: pageResponse.status,
        error: "No public catalogue link found for the requested symbol/timeframe/year",
      }, { status: 404 });
    }

    const fileResponse = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 GSAT historical-source validation" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!fileResponse.ok) {
      return NextResponse.json({
        ok: false,
        url,
        status: fileResponse.status,
        error: "EV Trading Labs archive file is not publicly accessible for this request",
      }, { status: fileResponse.status });
    }

    const compressed = Buffer.from(await fileResponse.arrayBuffer());
    const decompressed = gunzipSync(compressed).toString("utf8");
    const rows = JSON.parse(decompressed) as Array<Record<string, unknown>>;
    return NextResponse.json({
      ok: true,
      source: "EV Trading Labs historical archive (Dukascopy-derived bid/ask)",
      symbol,
      timeframe,
      year,
      url,
      compressedBytes: compressed.length,
      rowCount: rows.length,
      firstRow: rows[0] ?? null,
      lastRow: rows[rows.length - 1] ?? null,
      fields: rows[0] ? Object.keys(rows[0]) : [],
      note: "Preview-only file inspection. No external candles are inserted into GSAT.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "EV archive probe failed",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
