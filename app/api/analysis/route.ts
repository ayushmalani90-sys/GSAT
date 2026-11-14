import { NextResponse } from "next/server";
import { analyzeVerified } from "../../../lib/technical-advanced";
import type { TechnicalCandle } from "../../../lib/technical";
import { normalizeMasterCandles } from "../../../lib/market-data/master-ohlc";
import { ANALYSIS_SOURCE_POLICY, analysisSourceNote } from "../../../lib/analysis-source-policy";
import { assessIndicatorHistory } from "../../../lib/indicator-quality";
import { calculateIndependentIndicatorReference, compareCoreIndicatorValues, type CoreIndicatorValues } from "../../../lib/indicator-benchmark";

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
type CandleResponse = { bars?: Array<Record<string, unknown>>; message?: string; nextCursor?: string; next_cursor?: string };
type StoredCandleRow = {
  candle_open: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number | null;
  tick_volume: number | null;
  source: string;
  last_ingested_at: string;
};
type Timeframe = "15m" | "1H" | "4H" | "1D";
type SymbolCode = "XAUUSD" | "XAGUSD";
type HistoryResult = {
  candles: TechnicalCandle[];
  source: string;
  storage: "supabase_persisted" | "live_fallback";
  firstCandleAt: string | null;
  lastCandleAt: string | null;
  lastIngestedAt: string | null;
  rejectedRows: number;
};
const TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H", "1D"];
const TF_AGGREGATION: Record<Timeframe, "15m" | "1h" | "4h" | "1d"> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const TF_INTERVAL_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
};
const MAX_CANDLES = 1000;

function historyDatabaseConfig() {
  const url = process.env.GSAT_HISTORY_SUPABASE_URL;
  const key = process.env.GSAT_HISTORY_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return null;
  if (!url || !key) throw new Error("GSAT history database is only partially configured; both Supabase URL and publishable key are required.");
  return { url: url.replace(/\/$/, ""), key };
}

function toHistoryResult(candles: TechnicalCandle[], source: string, storage: HistoryResult["storage"], lastIngestedAt: string | null, rejectedRows = 0): HistoryResult {
  return {
    candles,
    source,
    storage,
    firstCandleAt: candles[0]?.t ?? null,
    lastCandleAt: candles.at(-1)?.t ?? null,
    lastIngestedAt,
    rejectedRows,
  };
}

async function fetchStoredHistory(symbol: SymbolCode, timeframe: Timeframe): Promise<HistoryResult> {
  const config = historyDatabaseConfig();
  if (!config) throw new Error("Stored history requested without a database configuration.");
  const url = new URL(config.url + "/rest/v1/gsat_market_candles");
  url.searchParams.set("select", "candle_open,open_price,high_price,low_price,close_price,volume,tick_volume,source,last_ingested_at");
  url.searchParams.set("symbol", "eq." + symbol);
  url.searchParams.set("timeframe", "eq." + TF_AGGREGATION[timeframe]);
  url.searchParams.set("order", "candle_open.desc");
  url.searchParams.set("limit", String(MAX_CANDLES));

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: "Bearer " + config.key,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("Supabase stored candle query failed (" + response.status + "): " + body.slice(0, 300));
  }
  const rows = JSON.parse(body) as StoredCandleRow[];
  if (!Array.isArray(rows)) throw new Error("Supabase stored candle response was not an array.");

  const biquoteRows = rows.filter((row) => row.source === "BiQuote");
  const raw = biquoteRows.map((row) => ({
    openTime: row.candle_open,
    open: row.open_price,
    high: row.high_price,
    low: row.low_price,
    close: row.close_price,
    volume: row.volume,
    tickVolume: row.tick_volume,
    isOpen: false,
  }));
  const candles = normalizeMasterCandles(raw, symbol).map(({ symbol: _symbol, volume, tickVolume, ...candle }) => ({
    ...candle,
    volume,
    tickVolume,
  }));
  const latestRow = rows[0];
  return toHistoryResult(
    candles,
    "Supabase persisted BiQuote OHLC",
    "supabase_persisted",
    latestRow?.last_ingested_at ?? null,
    rows.length - candles.length,
  );
}

async function fetchLiveBiquoteHistory(symbol: SymbolCode, interval: string): Promise<HistoryResult> {
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 20 && all.length < MAX_CANDLES; page += 1) {
    const url = new URL("https://biquote.io/api/" + symbol + "/ohlc");
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(1000, MAX_CANDLES - all.length)));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      if (all.length) break;
      throw new Error("BiQuote " + symbol + " " + interval + " candles unavailable (" + response.status + ")");
    }
    const data = (await response.json()) as CandleResponse;
    if (!Array.isArray(data.bars) || data.bars.length === 0) break;
    all.push(...data.bars);
    const next = data.nextCursor ?? data.next_cursor ?? null;
    if (!next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  const candles = normalizeMasterCandles(all, symbol).map(({ symbol: _symbol, volume, tickVolume, ...candle }) => ({
    ...candle,
    volume,
    tickVolume,
  }));
  return toHistoryResult(candles, "BiQuote live OHLC (not persisted)", "live_fallback", null, all.length - candles.length);
}

async function fetchHistory(symbol: SymbolCode, timeframe: Timeframe): Promise<HistoryResult> {
  return historyDatabaseConfig()
    ? fetchStoredHistory(symbol, timeframe)
    : fetchLiveBiquoteHistory(symbol, TF_AGGREGATION[timeframe]);
}

async function fetchBiquoteTick(symbol: SymbolCode) {
  const response = await fetch("https://biquote.io/api/" + symbol, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("BiQuote " + symbol + " quote unavailable (" + response.status + ")");
  const data = (await response.json()) as BiquoteTick;
  if (typeof data.mid !== "number" || !Number.isFinite(data.mid) || data.mid <= 0) {
    throw new Error("BiQuote returned an invalid " + symbol + " mid price");
  }
  return data;
}

function indicatorSnapshot(analysis: ReturnType<typeof analyzeVerified>): CoreIndicatorValues {
  return {
    ema20: analysis.ema.ema20,
    ema50: analysis.ema.ema50,
    ema200: analysis.ema.ema200,
    rsi14: analysis.momentum.rsi14,
    macd: analysis.momentum.macd,
    macdSignal: analysis.momentum.macdSignal,
    macdHistogram: analysis.momentum.macdHistogram,
    atr14: analysis.volatility.atr14,
  };
}

async function buildMtf(symbol: SymbolCode) {
  const results = await Promise.all(TIMEFRAMES.map(async (timeframe) => {
    const history = await fetchHistory(symbol, timeframe);
    const analysis = analyzeVerified(history.candles);
    const reference = calculateIndependentIndicatorReference(history.candles);
    const audit = compareCoreIndicatorValues(indicatorSnapshot(analysis), reference);
    return { timeframe, history, analysis, audit };
  }));

  const analyses: Record<Timeframe, ReturnType<typeof analyzeVerified>> = {} as Record<Timeframe, ReturnType<typeof analyzeVerified>>;
  const histories: Record<Timeframe, HistoryResult> = {} as Record<Timeframe, HistoryResult>;
  const audits: Record<Timeframe, ReturnType<typeof compareCoreIndicatorValues>> = {} as Record<Timeframe, ReturnType<typeof compareCoreIndicatorValues>>;
  for (const result of results) {
    analyses[result.timeframe] = result.analysis;
    histories[result.timeframe] = result.history;
    audits[result.timeframe] = result.audit;
  }
  return { analyses, histories, audits };
}

function buildHistoryQuality(
  analysisByTimeframe: Record<Timeframe, ReturnType<typeof analyzeVerified>>,
  histories: Record<Timeframe, HistoryResult>,
  marketState: string | undefined,
) {
  const now = Date.now();
  return Object.fromEntries(TIMEFRAMES.map((timeframe) => {
    const history = histories[timeframe];
    const samples = analysisByTimeframe[timeframe]?.samples ?? 0;
    const lastCandleAt = history?.lastCandleAt ?? null;
    const lastCloseAt = lastCandleAt ? Date.parse(lastCandleAt) + TF_INTERVAL_MS[timeframe] : null;
    const candleAgeSeconds = lastCloseAt == null ? null : Math.max(0, Math.floor((now - lastCloseAt) / 1000));
    const marketClosed = String(marketState ?? "").toLowerCase() === "closed";
    const freshness = samples === 0
      ? "no_data"
      : marketClosed
        ? "market_closed"
        : candleAgeSeconds != null && candleAgeSeconds > (TF_INTERVAL_MS[timeframe] * 2) / 1000 + 120
          ? "stale"
          : "current";
    return [timeframe, {
      ...assessIndicatorHistory(samples, timeframe),
      data: {
        source: history?.source ?? "unknown",
        storage: history?.storage ?? "unknown",
        firstCandleAt: history?.firstCandleAt ?? null,
        lastCandleAt,
        lastIngestedAt: history?.lastIngestedAt ?? null,
        candleAgeSeconds,
        freshness,
        rejectedRows: history?.rejectedRows ?? 0,
      },
    }];
  }));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe: " + timeframeParam }, { status: 400 });
  }
  const timeframe = timeframeParam as Timeframe;

  try {
    const [goldTick, silverTick, goldMtfResult, silverMtfResult] = await Promise.all([
      fetchBiquoteTick("XAUUSD"),
      fetchBiquoteTick("XAGUSD"),
      buildMtf("XAUUSD"),
      buildMtf("XAGUSD"),
    ]);
    const goldMtf = goldMtfResult.analyses;
    const silverMtf = silverMtfResult.analyses;
    const gold = goldMtf[timeframe];
    const silver = silverMtf[timeframe];
    const historyQuality = {
      gold: buildHistoryQuality(goldMtf, goldMtfResult.histories, goldTick.marketState),
      silver: buildHistoryQuality(silverMtf, silverMtfResult.histories, silverTick.marketState),
    };
    const calculationAudit = {
      gold: goldMtfResult.audits,
      silver: silverMtfResult.audits,
    };
    const storedHistory = historyDatabaseConfig() !== null;
    const dataArchitecture = storedHistory
      ? "supabase-persisted-biquote-candles"
      : "biquote-live-fallback-no-persisted-history";
    const goldHistory = goldMtfResult.histories[timeframe];
    const silverHistory = silverMtfResult.histories[timeframe];

    return NextResponse.json({
      source: ANALYSIS_SOURCE_POLICY.liveQuotes,
      dataArchitecture,
      generatedAt: new Date().toISOString(),
      timeframe,
      feed: {
        gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" },
        silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" },
      },
      history: {
        goldSamples: gold.samples,
        silverSamples: silver.samples,
        target: MAX_CANDLES,
        goldSource: goldHistory.source,
        silverSource: silverHistory.source,
      },
      historyQuality,
      calculationAudit,
      gold: { intraday: gold },
      silver: { intraday: silver },
      mtf: { gold: goldMtf, silver: silverMtf },
      methodology: {
        note: analysisSourceNote(),
        indicators: "EMA 20/50/200 use close prices with SMA-seeded EMA recursion; RSI 14 uses Wilder RMA of gains/losses; MACD uses EMA 12/26 and EMA 9 signal; ATR 14 uses True Range smoothed with Wilder RMA.",
        advanced: "Structural zones use confirmed pivots and distance-independent strength; Fibonacci uses the latest qualifying alternating confirmed swing; Volume Profile distributes broker/tick volume across candle ranges and calculates a 70% value area; candlestick quality is geometric and not a win probability.",
        dataQuality: storedHistory
          ? "Indicator calculations use the latest 1,000 completed BiQuote candles persisted in Supabase for each metal/timeframe. Only rows labelled BiQuote are accepted. Storage retains up to two years; the returned history count and freshness metadata show what is actually available."
          : "No persisted history database is configured in this deployment. The API uses the latest completed BiQuote candles returned by the live provider and explicitly labels this fallback; it does not claim two-year history.",
        display: "TradingView OANDA widgets remain display-only. No OANDA API is used for calculations.",
        historyQuality: "Minimum formula history and recommended warm-up targets are reported separately. EMA200 is unavailable below 200 completed candles; a calculable value with short warm-up is not labelled fully warmed.",
        calculationAudit: "Core indicators are checked against a separate reference implementation using the identical normalized candle input. This verifies formula parity, not parity with another broker feed or trading performance.",
        volumeProfile: "BiQuote tick volume is a tick-count proxy, not centralized exchange traded volume or true volume-at-price.",
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "BiQuote analysis unavailable",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
