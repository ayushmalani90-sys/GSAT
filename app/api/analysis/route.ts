import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";

type OandaCandle = {
  time?: string;
  complete?: boolean;
  mid?: { o?: string; h?: string; l?: string; c?: string };
};

const GRANULARITY: Record<string, string> = {
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W",
};

const MAX_CANDLES = 5000;

async function fetchOandaCandles(instrument: "XAU_USD" | "XAG_USD", granularity: string): Promise<TechnicalCandle[]> {
  const account = process.env.OANDA_ACCOUNT_ID;
  const token = process.env.OANDA_API_TOKEN;
  const host = process.env.OANDA_API_URL ?? "https://api-fxpractice.oanda.com";
  if (!account || !token) throw new Error("OANDA credentials are not configured");

  const url = new URL(`${host}/v3/instruments/${instrument}/candles`);
  url.searchParams.set("price", "M");
  url.searchParams.set("granularity", granularity);
  url.searchParams.set("count", String(MAX_CANDLES));
  url.searchParams.set("smooth", "false");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`OANDA ${instrument} candles unavailable (${response.status})`);

  const data = (await response.json()) as { candles?: OandaCandle[] };
  return Array.isArray(data.candles)
    ? data.candles
        .filter((c) => c.complete !== false && c.mid)
        .map((c) => ({
          t: String(c.time ?? ""),
          o: Number(c.mid?.o),
          h: Number(c.mid?.h),
          l: Number(c.mid?.l),
          c: Number(c.mid?.c),
        }))
        .filter((c) => Boolean(c.t) && Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) && Number.isFinite(c.c))
    : [];
}

export async function GET(request: Request) {
  const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1H";
  const granularity = GRANULARITY[timeframe];
  if (!granularity) {
    return NextResponse.json({ error: `Unsupported timeframe: ${timeframe}` }, { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  try {
    const [gold, silver] = await Promise.all([
      fetchOandaCandles("XAU_USD", granularity),
      fetchOandaCandles("XAG_USD", granularity),
    ]);
    return NextResponse.json(
      {
        source: "OANDA",
        generatedAt: new Date().toISOString(),
        timeframe,
        granularity,
        gold: { intraday: analyze(gold) },
        silver: { intraday: analyze(silver) },
        methodology: {
          note: "Technical indicators use completed OANDA OHLC candles for the selected timeframe. EMA uses close prices, RSI uses Wilder RMA, MACD uses EMA 12/26 with EMA 9 signal, and support/resistance uses candle swing highs/lows with structural separation filtering.",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Technical analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
