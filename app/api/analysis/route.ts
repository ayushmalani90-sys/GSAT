import { NextResponse } from "next/server";
import { analyzeVerified } from "../../../lib/technical-advanced";
import type { TechnicalCandle } from "../../../lib/technical";
import { normalizeMasterCandles } from "../../../lib/market-data/master-ohlc";
import { ANALYSIS_SOURCE_POLICY, analysisSourceNote } from "../../../lib/analysis-source-policy";
import { assessIndicatorHistory } from "../../../lib/indicator-quality";

type BiquoteTick = { symbol?: string; mid?: number; bid?: number; ask?: number; dayDiffPercent?: number; timestamp?: string; stale?: boolean; marketState?: string; quoteAgeSeconds?: number };
type CandleResponse = { bars?: Array<Record<string, unknown>>; message?: string; nextCursor?: string; next_cursor?: string };
const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type SymbolCode = "XAUUSD" | "XAGUSD";
const MAX_CANDLES = 1000;
const TF_AGGREGATION: Record<Timeframe, "15m" | "1h" | "4h" | "1d"> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };

async function fetchHistory(symbol: SymbolCode, interval: string): Promise<TechnicalCandle[]> {
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 20 && all.length < MAX_CANDLES; page += 1) {
    const url = new URL("https://biquote.io/api/" + symbol + "/ohlc");
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(1000, MAX_CANDLES - all.length)));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { cache: "no-store" });
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
  return normalizeMasterCandles(all, symbol).map(({ symbol: _symbol, volume, tickVolume, ...c }) => ({ ...c, volume, tickVolume }));
}

async function fetchBiquoteTick(symbol: SymbolCode) {
  const response = await fetch("https://biquote.io/api/" + symbol, { cache: "no-store" });
  if (!response.ok) throw new Error("BiQuote " + symbol + " quote unavailable (" + response.status + ")");
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error("BiQuote returned an invalid " + symbol + " mid price");
  return data;
}

async function buildMtf(symbol: SymbolCode) {
  const out: Record<string, ReturnType<typeof analyzeVerified>> = {};
  for (const tf of TIMEFRAMES) {
    const candles = await fetchHistory(symbol, TF_AGGREGATION[tf]);
    out[tf] = analyzeVerified(candles);
  }
  return out;
}

function buildHistoryQuality(analysisByTimeframe: Record<string, ReturnType<typeof analyzeVerified>>) {
  return Object.fromEntries(
    TIMEFRAMES.map((timeframe) => [
      timeframe,
      assessIndicatorHistory(analysisByTimeframe[timeframe]?.samples ?? 0),
    ]),
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) return NextResponse.json({ error: "Unsupported timeframe: " + timeframeParam }, { status: 400 });
  const timeframe = timeframeParam as Timeframe;
  try {
    const [goldCandles, silverCandles, goldTick, silverTick, goldMtf, silverMtf] = await Promise.all([
      fetchHistory("XAUUSD", TF_AGGREGATION[timeframe]),
      fetchHistory("XAGUSD", TF_AGGREGATION[timeframe]),
      fetchBiquoteTick("XAUUSD"), fetchBiquoteTick("XAGUSD"),
      buildMtf("XAUUSD"), buildMtf("XAGUSD"),
    ]);
    const gold = analyzeVerified(goldCandles), silver = analyzeVerified(silverCandles);
    const historyQuality = {
      gold: buildHistoryQuality(goldMtf),
      silver: buildHistoryQuality(silverMtf),
    };
    const sourceMode = "biquote-native-timeframe";
    return NextResponse.json({
      source: ANALYSIS_SOURCE_POLICY.liveQuotes,
      dataArchitecture: sourceMode,
      generatedAt: new Date().toISOString(), timeframe,
      feed: { gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" }, silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" } },
      history: { goldSamples: goldCandles.length, silverSamples: silverCandles.length, target: MAX_CANDLES },
      historyQuality,
      gold: { intraday: gold }, silver: { intraday: silver },
      mtf: { gold: goldMtf, silver: silverMtf },
      methodology: {
        note: analysisSourceNote(),
        indicators: "EMA 20/50/200 use close prices with SMA-seeded EMA recursion; RSI 14 uses Wilder RMA of gains/losses; MACD uses EMA 12/26 and EMA 9 signal; ATR 14 uses True Range smoothed with Wilder RMA.",
        advanced: "Structural zones use confirmed pivots and distance-independent strength; Fibonacci uses the latest qualifying alternating confirmed swing; Volume Profile distributes broker/tick volume across candle ranges and calculates a 70% value area; candlestick quality is geometric and not a win probability.",
        dataQuality: "Only completed BiQuote candles are analyzed. Historical requests paginate only through explicit BiQuote nextCursor/next_cursor fields and never infer pagination. OANDA is not used for calculations.",
        display: "TradingView OANDA widgets remain display-only. No OANDA API is used.",
        historyQuality: "The response distinguishes minimum formula history from recommended warm-up targets. EMA200 is unavailable below 200 completed candles; recommended warm-up is not a prediction-accuracy guarantee.",
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BiQuote analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
