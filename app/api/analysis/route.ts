import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { aggregate1mCandles, normalizeMasterCandles, toTechnicalCandles, type MasterCandle } from "../../../lib/market-data/master-ohlc";

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
  bars?: Array<Record<string, unknown>>;
  message?: string;
};

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const MAX_CANDLES = 2000;
const MASTER_INTERVAL = "1m";

const TF_INTERVALS: Record<Timeframe, Exclude<MasterCandle["t"], never> extends never ? never : "15m" | "1h" | "4h" | "1d"> = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

const TF_AGGREGATION = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" } as const;

type SymbolCode = "XAUUSD" | "XAGUSD";

async function fetchMaster1mCandles(symbol: SymbolCode): Promise<MasterCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", MASTER_INTERVAL);
  url.searchParams.set("limit", String(MAX_CANDLES));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} 1m candles unavailable (${response.status})`);
  const data = (await response.json()) as CandleResponse;
  if (!Array.isArray(data.bars)) throw new Error(data.message ?? `BiQuote returned no ${symbol} 1m candles`);

  return normalizeMasterCandles(data.bars, symbol);
}

async function fetchBiquoteTick(symbol: SymbolCode) {
  const response = await fetch(`https://biquote.io/api/${symbol}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} quote unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error(`BiQuote returned an invalid ${symbol} mid price`);
  return data;
}

function aggregateForTimeframe(candles: MasterCandle[], timeframe: Timeframe): TechnicalCandle[] {
  return toTechnicalCandles(aggregate1mCandles(candles, TF_AGGREGATION[timeframe]));
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
    const [gold1m, silver1m, goldTick, silverTick] = await Promise.all([
      fetchMaster1mCandles("XAUUSD"),
      fetchMaster1mCandles("XAGUSD"),
      fetchBiquoteTick("XAUUSD"),
      fetchBiquoteTick("XAGUSD"),
    ]);

    const goldCandles = aggregateForTimeframe(gold1m, timeframe);
    const silverCandles = aggregateForTimeframe(silver1m, timeframe);

    return NextResponse.json(
      {
        source: "BiQuote",
        dataArchitecture: "master-1m-derived",
        generatedAt: new Date().toISOString(),
        timeframe,
        masterInterval: MASTER_INTERVAL,
        requestedInterval: TF_INTERVALS[timeframe],
        feed: {
          gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" },
          silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" },
        },
        history: {
          gold1mSamples: gold1m.length,
          silver1mSamples: silver1m.length,
          goldDerivedSamples: goldCandles.length,
          silverDerivedSamples: silverCandles.length,
        },
        gold: { intraday: analyze(goldCandles) },
        silver: { intraday: analyze(silverCandles) },
        methodology: {
          note: "GSAT now uses one normalized BiQuote 1-minute OHLC master series per metal and deterministically aggregates that same master series into 15m, 1H, 4H and 1D candles before technical analysis.",
          indicators: "EMA uses close prices; RSI and ATR use Wilder RMA; MACD uses EMA 12/26 with EMA 9 signal.",
          dataQuality: "This creates one internally consistent historical candle source across timeframes, but it does not guarantee TradingView parity. Parity still requires the same underlying candle feed, session boundaries and completed-bar state.",
          display: "TradingView OANDA widgets remain display-only. GSAT does not use an OANDA API.",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BiQuote master 1m analysis unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
