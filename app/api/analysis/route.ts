import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { aggregate1mCandles, normalizeMasterCandles, type MasterCandle } from "../../../lib/market-data/master-ohlc";
import { ANALYSIS_SOURCE_POLICY, analysisSourceNote } from "../../../lib/analysis-source-policy";

type BiquoteTick = { symbol?: string; mid?: number; bid?: number; ask?: number; dayDiffPercent?: number; timestamp?: string; stale?: boolean; marketState?: string; quoteAgeSeconds?: number };
type CandleResponse = { bars?: Array<Record<string, unknown>>; message?: string };
const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type SymbolCode = "XAUUSD" | "XAGUSD";
const MAX_CANDLES = 2000;
const TF_AGGREGATION: Record<Timeframe, "15m" | "1h" | "4h" | "1d"> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };

async function fetchMaster1mCandles(symbol: SymbolCode): Promise<MasterCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", "1m"); url.searchParams.set("limit", String(MAX_CANDLES));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} 1m candles unavailable (${response.status})`);
  const data = (await response.json()) as CandleResponse;
  if (!Array.isArray(data.bars)) throw new Error(data.message ?? `BiQuote returned no ${symbol} 1m candles`);
  return normalizeMasterCandles(data.bars, symbol);
}
async function fetchDirectCandles(symbol: SymbolCode, timeframe: Timeframe): Promise<TechnicalCandle[]> {
  const interval = TF_AGGREGATION[timeframe];
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", interval); url.searchParams.set("limit", String(MAX_CANDLES));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} ${interval} candles unavailable (${response.status})`);
  const data = (await response.json()) as CandleResponse;
  if (!Array.isArray(data.bars)) throw new Error(data.message ?? `BiQuote returned no ${symbol} ${interval} candles`);
  return normalizeMasterCandles(data.bars, symbol).map(({ symbol: _s, ...c }) => c);
}
async function fetchBiquoteTick(symbol: SymbolCode) {
  const response = await fetch(`https://biquote.io/api/${symbol}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} quote unavailable (${response.status})`);
  const data = (await response.json()) as BiquoteTick;
  if (!Number.isFinite(data.mid)) throw new Error(`BiQuote returned an invalid ${symbol} mid price`);
  return data;
}
function aggregate(candles: MasterCandle[], timeframe: Timeframe): TechnicalCandle[] {
  return aggregate1mCandles(candles, TF_AGGREGATION[timeframe]).map(({ symbol: _s, sourceInterval: _i, ...c }) => c);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) return NextResponse.json({ error: `Unsupported timeframe: ${timeframeParam}` }, { status: 400 });
  const timeframe = timeframeParam as Timeframe;
  try {
    const [gold1m, silver1m, goldTick, silverTick] = await Promise.all([
      fetchMaster1mCandles("XAUUSD"), fetchMaster1mCandles("XAGUSD"), fetchBiquoteTick("XAUUSD"), fetchBiquoteTick("XAGUSD"),
    ]);
    const goldDerived = aggregate(gold1m, timeframe);
    const silverDerived = aggregate(silver1m, timeframe);
    const useMaster = goldDerived.length >= 400 && silverDerived.length >= 400;
    const [goldCandles, silverCandles] = useMaster
      ? [goldDerived, silverDerived]
      : await Promise.all([fetchDirectCandles("XAUUSD", timeframe), fetchDirectCandles("XAGUSD", timeframe)]);
    const gold = analyze(goldCandles), silver = analyze(silverCandles);
    const sourceMode = useMaster ? "master-1m-derived" : "biquote-native-timeframe-fallback";
    return NextResponse.json({
      source: ANALYSIS_SOURCE_POLICY.liveQuotes,
      dataArchitecture: sourceMode,
      generatedAt: new Date().toISOString(), timeframe, masterInterval: "1m",
      feed: { gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" }, silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" } },
      history: { gold1mSamples: gold1m.length, silver1mSamples: silver1m.length, goldDerivedSamples: goldDerived.length, silverDerivedSamples: silverDerived.length, goldAnalysisSamples: goldCandles.length, silverAnalysisSamples: silverCandles.length },
      gold: { intraday: gold }, silver: { intraday: silver },
      methodology: { note: analysisSourceNote(), indicators: "EMA 20/50/200 use close prices with SMA-seeded EMA recursion; RSI 14 uses Wilder RMA of gains/losses; MACD uses EMA 12/26 and EMA 9 signal; ATR 14 uses True Range smoothed with Wilder RMA.", dataQuality: "Open candles are excluded. Higher timeframes are derived from normalized BiQuote 1m data when sufficient history is available; otherwise BiQuote's own completed timeframe candles are used and the source mode is reported.", display: "TradingView OANDA widgets remain display-only. No OANDA API is used." },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BiQuote analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
