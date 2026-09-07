import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";

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

type CandleResponse = {
  symbol?: string;
  interval?: string;
  bars?: Array<{
    openTime?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    tickVolume?: number;
    isOpen?: boolean;
  }>;
  message?: string;
};

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const MAX_CANDLES = 2000;

const BIQUOTE_INTERVALS: Record<Timeframe, string> = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

async function fetchBiquoteCandles(symbol: "XAUUSD" | "XAGUSD", timeframe: Timeframe): Promise<TechnicalCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", BIQUOTE_INTERVALS[timeframe]);
  url.searchParams.set("limit", String(MAX_CANDLES));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} candles unavailable (${response.status})`);

  const data = (await response.json()) as CandleResponse;
  if (!Array.isArray(data.bars)) throw new Error(data.message ?? `BiQuote returned no ${symbol} candles`);

  return data.bars
    .filter((bar) => bar.isOpen !== true)
    .map((bar) => ({
      t: String(bar.openTime ?? ""),
      o: Number(bar.open),
      h: Number(bar.high),
      l: Number(bar.low),
      c: Number(bar.close),
    }))
    .filter((c) => Boolean(c.t) && [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

async function fetchBiquoteTick(symbol: "XAUUSD" | "XAGUSD") {
  const response = await fetch(`https://biquote.io/api/${symbol}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} quote unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error(`BiQuote returned an invalid ${symbol} mid price`);
  return data;
}

export async function GET(request: Request) {
  const timeframeParam = new URL(request.url).searchParams.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) {
    return NextResponse.json(
      { error: `Unsupported timeframe: ${timeframeParam}` },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const timeframe = timeframeParam as Timeframe;

  try {
    const [goldCandles, silverCandles, goldTick, silverTick] = await Promise.all([
      fetchBiquoteCandles("XAUUSD", timeframe),
      fetchBiquoteCandles("XAGUSD", timeframe),
      fetchBiquoteTick("XAUUSD"),
      fetchBiquoteTick("XAGUSD"),
    ]);

    return NextResponse.json(
      {
        source: "BiQuote",
        generatedAt: new Date().toISOString(),
        timeframe,
        interval: BIQUOTE_INTERVALS[timeframe],
        feed: {
          gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" },
          silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" },
        },
        gold: { intraday: analyze(goldCandles) },
        silver: { intraday: analyze(silverCandles) },
        methodology: {
          note: "BiQuote is the sole market-data source. Technical indicators use completed BiQuote OHLC candles for the selected timeframe; live spot uses the BiQuote mid price. EMA uses close prices; RSI and ATR use Wilder RMA; MACD uses EMA 12/26 with EMA 9 signal.",
          dataQuality: "GSAT does not use an OANDA API. TradingView OANDA widgets remain display-only; their candle values are not silently substituted into GSAT calculations.",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BiQuote technical analysis unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
