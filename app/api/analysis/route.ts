import { NextResponse } from "next/server";
import { analyzeVerified } from "../../../lib/technical-advanced";
import type { TechnicalCandle } from "../../../lib/technical";
import { ANALYSIS_SOURCE_POLICY, analysisSourceNote } from "../../../lib/analysis-source-policy";

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type SymbolCode = "XAUUSD" | "XAGUSD";
type DbTimeframe = "15m" | "1h" | "4h" | "1d";

const DB_TIMEFRAME: Record<Timeframe, DbTimeframe> = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};
const MAX_CANDLES = 1000;

type StoredCandleRow = {
  source: string;
  candle_open: string;
  open_price: number | string;
  high_price: number | string;
  low_price: number | string;
  close_price: number | string;
  volume: number | string | null;
  tick_volume: number | string | null;
};

type StoredHistory = {
  candles: TechnicalCandle[];
  oldest: string | null;
  newest: string | null;
  rejectedRows: number;
};

function supabaseConfig() {
  const url = process.env.GSAT_HISTORY_SUPABASE_URL;
  const key = process.env.GSAT_HISTORY_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Stored BiQuote history is not configured for this deployment.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

function finite(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchStoredHistory(symbol: SymbolCode, timeframe: DbTimeframe): Promise<StoredHistory> {
  const { url: baseUrl, key } = supabaseConfig();
  const url = new URL(baseUrl + "/rest/v1/gsat_market_candles");
  url.searchParams.set("select", "source,candle_open,open_price,high_price,low_price,close_price,volume,tick_volume");
  url.searchParams.set("symbol", "eq." + symbol);
  url.searchParams.set("timeframe", "eq." + timeframe);
  url.searchParams.set("source", "eq.BiQuote");
  url.searchParams.set("order", "candle_open.desc");
  url.searchParams.set("limit", String(MAX_CANDLES));

  const response = await fetch(url, {
    cache: "no-store",
    headers: { apikey: key, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("Supabase stored " + symbol + " " + timeframe + " history failed (" +
      response.status + "): " + (await response.text()).slice(0, 300));
  }

  const fetchedRows = await response.json() as StoredCandleRow[];
  if (!Array.isArray(fetchedRows)) throw new Error("Stored history response was not an array");
  // Supabase applies the row limit after ordering. Fetch newest candles first,
  // then reverse locally so indicators receive chronological input. Ascending
  // order here would silently analyze the oldest 1,000 candles once history grows.
  const rows = [...fetchedRows].reverse();

  const candles: TechnicalCandle[] = [];
  let rejectedRows = 0;
  for (const row of rows) {
    const timestamp = Date.parse(row.candle_open);
    const o = finite(row.open_price);
    const h = finite(row.high_price);
    const l = finite(row.low_price);
    const c = finite(row.close_price);
    const volume = finite(row.volume);
    const tickVolume = finite(row.tick_volume);

    if (
      row.source !== "BiQuote" || !Number.isFinite(timestamp) ||
      o === undefined || h === undefined || l === undefined || c === undefined ||
      o <= 0 || h <= 0 || l <= 0 || c <= 0 ||
      h < Math.max(o, c, l) || l > Math.min(o, c, h) ||
      (volume !== undefined && volume < 0) ||
      (tickVolume !== undefined && tickVolume < 0)
    ) {
      rejectedRows += 1;
      continue;
    }

    candles.push({
      t: new Date(timestamp).toISOString(),
      o, h, l, c,
      ...(volume !== undefined ? { volume } : {}),
      ...(tickVolume !== undefined ? { tickVolume } : {}),
    });
  }

  if (candles.length === 0) {
    throw new Error("No valid stored BiQuote candles for " + symbol + " " + timeframe +
      ". The collector must backfill this timeframe before analysis is available.");
  }

  return {
    candles,
    oldest: candles[0].t,
    newest: candles[candles.length - 1].t,
    rejectedRows,
  };
}

async function fetchAllStoredTimeframes(symbol: SymbolCode) {
  const entries = await Promise.all(TIMEFRAMES.map(async (timeframe) => {
    const history = await fetchStoredHistory(symbol, DB_TIMEFRAME[timeframe]);
    return [timeframe, history] as const;
  }));
  return Object.fromEntries(entries) as Record<Timeframe, StoredHistory>;
}

function coverage(history: Record<Timeframe, StoredHistory>) {
  return Object.fromEntries(TIMEFRAMES.map((timeframe) => {
    const item = history[timeframe];
    return [timeframe, {
      samples: item.candles.length,
      oldest: item.oldest,
      newest: item.newest,
      rejectedRows: item.rejectedRows,
    }];
  }));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) {
    return NextResponse.json({ error: "Unsupported timeframe: " + timeframeParam }, { status: 400 });
  }

  const timeframe = timeframeParam as Timeframe;
  try {
    const [goldHistory, silverHistory] = await Promise.all([
      fetchAllStoredTimeframes("XAUUSD"),
      fetchAllStoredTimeframes("XAGUSD"),
    ]);

    const goldMtf = Object.fromEntries(TIMEFRAMES.map((tf) => [
      tf, analyzeVerified(goldHistory[tf].candles),
    ]));
    const silverMtf = Object.fromEntries(TIMEFRAMES.map((tf) => [
      tf, analyzeVerified(silverHistory[tf].candles),
    ]));

    const gold = goldMtf[timeframe];
    const silver = silverMtf[timeframe];
    const goldCoverage = coverage(goldHistory);
    const silverCoverage = coverage(silverHistory);

    return NextResponse.json({
      source: ANALYSIS_SOURCE_POLICY.ohlc,
      dataArchitecture: "supabase-stored-biquote-ohlc",
      generatedAt: new Date().toISOString(),
      timeframe,
      history: {
        gold: goldCoverage,
        silver: silverCoverage,
        maxSamplesPerTimeframe: MAX_CANDLES,
        storageSource: "public.gsat_market_candles",
      },
      gold: { intraday: gold },
      silver: { intraday: silver },
      mtf: { gold: goldMtf, silver: silverMtf },
      methodology: {
        note: analysisSourceNote(),
        indicators: "EMA 20/50/200 use close prices with SMA-seeded EMA recursion; RSI 14 uses Wilder RMA of gains/losses; MACD uses EMA 12/26 and EMA 9 signal; ATR 14 uses True Range smoothed with Wilder RMA.",
        advanced: "Structural zones use confirmed pivots and distance-independent strength; Fibonacci uses the latest qualifying alternating confirmed swing; Volume Profile distributes broker/tick volume across candle ranges and calculates a 70% value area; candlestick quality is geometric and not a win probability.",
        dataQuality: "Only completed BiQuote candles already stored in Supabase are analyzed. No direct historical-provider request is made by this endpoint. Sample counts and coverage timestamps are returned for every timeframe. Broker tick volume is not centralized exchange volume.",
        display: "TradingView OANDA widgets remain display-only. No OANDA API is used for calculations.",
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Stored BiQuote analysis unavailable",
      dataArchitecture: "supabase-stored-biquote-ohlc",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
