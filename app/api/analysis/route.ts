import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";

type BiquoteBar = {
  openTime?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  tickVolume?: number;
  isOpen?: boolean;
};

type BiquoteOhlcResponse = {
  symbol?: string;
  interval?: string;
  bars?: BiquoteBar[];
  message?: string;
};

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

const TIMEFRAME_TO_BIQUOTE: Record<string, string> = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

const MAX_CANDLES = 1000;

async function fetchBiquoteCandles(symbol: "XAUUSD" | "XAGUSD", interval: string): Promise<TechnicalCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(MAX_CANDLES));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} candles unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteOhlcResponse;
  if (!Array.isArray(data.bars)) throw new Error(data.message ?? `BiQuote returned no ${symbol} OHLC bars`);

  return data.bars
    .filter((bar) => bar.isOpen !== true)
    .map((bar) => ({
      t: String(bar.openTime ?? ""),
      o: Number(bar.open),
      h: Number(bar.high),
      l: Number(bar.low),
      c: Number(bar.close),
    }))
    .filter((c) => Boolean(c.t) && Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) && Number.isFinite(c.c))
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
  const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1H";
  const interval = TIMEFRAME_TO_BIQUOTE[timeframe];
  if (!interval) {
    return NextResponse.json(
      { error: `Unsupported timeframe: ${timeframe}` },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const [gold, silver, goldTick, silverTick] = await Promise.all([
      fetchBiquoteCandles("XAUUSD", interval),
      fetchBiquoteCandles("XAGUSD", interval),
      fetchBiquoteTick("XAUUSD"),
      fetchBiquoteTick("XAGUSD"),
    ]);

    return NextResponse.json(
      {
        source: "BiQuote",
        generatedAt: new Date().toISOString(),
        timeframe,
        interval,
        feed: {
          gold: { ...goldTick, price: goldTick.mid },
          silver: { ...silverTick, price: silverTick.mid },
        },
        gold: { intraday: analyze(gold) },
        silver: { intraday: analyze(silver) },
        methodology: {
          note: "Technical indicators use completed BiQuote OHLC candles for the selected timeframe. EMA uses close prices, RSI uses Wilder RMA, MACD uses EMA 12/26 with EMA 9 signal, and support/resistance uses structural candle swing highs/lows with separation filtering.",
          dataQuality: "BiQuote is a MetaTrader 5 broker CFD feed. It provides mid/bid/ask pricing rather than consolidated exchange last-trade data, so GSAT treats the BiQuote mid as the spot reference price.",
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
