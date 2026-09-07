import { NextResponse } from "next/server";
import { fetchOandaCandles } from "../../../../lib/oanda";
import { analyze, type TechnicalCandle } from "../../../../lib/technical";

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
const SYMBOLS = ["XAUUSD", "XAGUSD"] as const;

function mapCandles(candles: Awaited<ReturnType<typeof fetchOandaCandles>>): TechnicalCandle[] {
  return candles.map((c) => ({
    t: c.time,
    o: Number(c.mid?.o),
    h: Number(c.mid?.h),
    l: Number(c.mid?.l),
    c: Number(c.mid?.c),
  })).filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") as (typeof SYMBOLS)[number] | null;
  const timeframe = params.get("timeframe") as (typeof TIMEFRAMES)[number] | null;
  if (!symbol || !SYMBOLS.includes(symbol) || !timeframe || !TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json({ error: "Use symbol=XAUUSD|XAGUSD and timeframe=15m|1H|4H|1D" }, { status: 400 });
  }

  try {
    const candles = mapCandles(await fetchOandaCandles(symbol, timeframe, 2000));
    return NextResponse.json({
      source: "OANDA",
      symbol,
      timeframe,
      candleCount: candles.length,
      lastCandle: candles.at(-1) ?? null,
      previousCandle: candles.at(-2) ?? null,
      analysis: analyze(candles),
      note: "This route exposes the exact completed OANDA midpoint candle series used by GSAT technical calculations. Use it to compare against TradingView OANDA:XAUUSD or OANDA:XAGUSD on the same timeframe and bar state.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OANDA validation unavailable" }, { status: 502 });
  }
}
