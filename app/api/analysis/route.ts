import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { normalizeMasterCandles, type MasterCandle } from "../../../lib/market-data/master-ohlc";
import { ANALYSIS_SOURCE_POLICY, analysisSourceNote } from "../../../lib/analysis-source-policy";

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
    const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(1000, MAX_CANDLES - all.length)));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (all.length) break;
      throw new Error(`BiQuote ${symbol} ${interval} candles unavailable (${response.status})`);
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
  const response = await fetch(`https://biquote.io/api/${symbol}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} quote unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error(`BiQuote returned an invalid ${symbol} mid price`);
  return data;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) return NextResponse.json({ error: `Unsupported timeframe: ${timeframeParam}` }, { status: 400 });
  const timeframe = timeframeParam as Timeframe;
  try {
    const [goldCandles, silverCandles, goldTick, silverTick] = await Promise.all([
      fetchHistory("XAUUSD", TF_AGGREGATION[timeframe]),
      fetchHistory("XAGUSD", TF_AGGREGATION[timeframe]),
      fetchBiquoteTick("XAUUSD"), fetchBiquoteTick("XAGUSD"),
    ]);
    const gold = analyze(goldCandles), silver = analyze(silverCandles);
    const sourceMode = "biquote-native-timeframe";
    return NextResponse.json({
      source: ANALYSIS_SOURCE_POLICY.liveQuotes,
      dataArchitecture: sourceMode,
      generatedAt: new Date().toISOString(), timeframe,
      feed: { gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" }, silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" } },
      history: { goldSamples: goldCandles.length, silverSamples: silverCandles.length, target: MAX_CANDLES },
      gold: { intraday: gold }, silver: { intraday: silver },
      methodology: { note: analysisSourceNote(), indicators: "EMA 20/50/200 use close prices with SMA-seeded EMA recursion; RSI 14 uses Wilder RMA of gains/losses; MACD uses EMA 12/26 and EMA 9 signal; ATR 14 uses True Range smoothed with Wilder RMA.", dataQuality: "Only completed BiQuote candles are analyzed. Historical requests paginate only through explicit BiQuote nextCursor/next_cursor fields and never infer pagination. OANDA is not used for calculations.", display: "TradingView OANDA widgets remain display-only. No OANDA API is used." },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BiQuote analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
