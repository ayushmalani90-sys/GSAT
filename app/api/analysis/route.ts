import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { fetchOandaCandles } from "../../../lib/oanda";

type BiquoteTick = {
  symbol?: string;
  mid?: number;
  bid?: number;
  ask?: number;
  dayDiffPercent?: number;
  timestamp?: string;
  stale?: boolean;
  marketState?: string;
  quoteAgeSeconds?: number;
};

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function oandaToTechnicalCandles(candles: Awaited<ReturnType<typeof fetchOandaCandles>>): TechnicalCandle[] {
  return candles
    .filter((c) => c.complete && c.mid)
    .map((c) => ({
      t: c.time,
      o: Number(c.mid?.o),
      h: Number(c.mid?.h),
      l: Number(c.mid?.l),
      c: Number(c.mid?.c),
    }))
    .filter((c) => Boolean(c.t) && [c.o, c.h, c.l, c.c].every(Number.isFinite));
}

async function fetchBiquoteTick(symbol: "XAUUSD" | "XAGUSD") {
  const response = await fetch(`https://biquote.io/api/${symbol}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} quote unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error(`BiQuote returned an invalid ${symbol} mid price`);
  return data;
}

export async function GET(request: Request) {
  const timeframe = (new URL(request.url).searchParams.get("timeframe") ?? "1H") as Timeframe;
  if (!TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json(
      { error: `Unsupported timeframe: ${timeframe}` },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const [goldOanda, silverOanda, goldTick, silverTick] = await Promise.all([
      fetchOandaCandles("XAUUSD", timeframe, 2000),
      fetchOandaCandles("XAGUSD", timeframe, 2000),
      fetchBiquoteTick("XAUUSD"),
      fetchBiquoteTick("XAGUSD"),
    ]);

    const goldCandles = oandaToTechnicalCandles(goldOanda);
    const silverCandles = oandaToTechnicalCandles(silverOanda);

    return NextResponse.json(
      {
        source: "OANDA",
        generatedAt: new Date().toISOString(),
        timeframe,
        interval: timeframe,
        feed: {
          gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" },
          silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" },
        },
        gold: { intraday: analyze(goldCandles) },
        silver: { intraday: analyze(silverCandles) },
        methodology: {
          note: "Technical indicators use completed OANDA midpoint OHLC candles for the selected timeframe. BiQuote is used only for the live spot quote. EMA uses close prices; RSI and ATR use Wilder RMA; MACD uses EMA 12/26 with EMA 9 signal.",
          dataQuality: "Technical analysis and chart data are aligned to OANDA midpoint candles; live spot remains sourced from BiQuote as requested.",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OANDA technical analysis unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
