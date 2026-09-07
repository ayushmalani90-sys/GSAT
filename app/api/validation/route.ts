import { NextResponse } from "next/server";
import { validateAgainstReference } from "../../../lib/validation";
import { type TechnicalCandle } from "../../../lib/technical";

export const dynamic = "force-dynamic";

type ReferenceValues = Partial<Record<string, number | null>>;
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

const MAX_CANDLES = 2000;
const INTERVALS: Record<string, string> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const SYMBOLS = ["XAUUSD", "XAGUSD"] as const;

async function fetchCandles(symbol: (typeof SYMBOLS)[number], timeframe: string): Promise<TechnicalCandle[]> {
  const interval = INTERVALS[timeframe];
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(MAX_CANDLES));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} OHLC unavailable (${response.status})`);
  const data = (await response.json()) as { bars?: BiquoteBar[] };
  if (!Array.isArray(data.bars)) throw new Error(`BiQuote returned no ${symbol} bars`);
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

function readReference(search: URLSearchParams): ReferenceValues {
  const output: ReferenceValues = {};
  for (const key of ["ema20", "ema50", "ema200", "rsi14", "macd", "macdSignal", "macdHistogram", "atr14"]) {
    const raw = search.get(key);
    if (raw != null && raw.trim() !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) output[key] = value;
    }
  }
  return output;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframe = params.get("timeframe") ?? "1H";
  const symbol = params.get("symbol") as (typeof SYMBOLS)[number] | null;
  if (!INTERVALS[timeframe] || !symbol || !SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: "Use symbol=XAUUSD|XAGUSD and timeframe=15m|1H|4H|1D" }, { status: 400 });
  }

  try {
    const candles = await fetchCandles(symbol, timeframe);
    const reference = readReference(params);
    return NextResponse.json(validateAgainstReference(symbol, timeframe, candles, reference), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Validation unavailable" }, { status: 502 });
  }
}
