import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { aggregate1mCandles, normalizeMasterCandles, type MasterCandle } from "../../../lib/market-data/master-ohlc";

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
function aggregate(candles: MasterCandle[], timeframe: Timeframe): TechnicalCandle[] { return aggregate1mCandles(candles, TF_AGGREGATION[timeframe]).map(({ symbol: _s, sourceInterval: _i, ...c }) => c); }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) return NextResponse.json({ error: `Unsupported timeframe: ${timeframeParam}` }, { status: 400 });
  const timeframe = timeframeParam as Timeframe;
  try {
    const [gold1m, silver1m, goldTick, silverTick] = await Promise.all([
      fetchMaster1mCandles("XAUUSD"), fetchMaster1mCandles("XAGUSD"), fetchBiquoteTick("XAUUSD"), fetchBiquoteTick("XAGUSD"),
    ]);
    let goldCandles = aggregate(gold1m, timeframe);
    let silverCandles = aggregate(silver1m, timeframe);
    // BiQuote may expose only a short 1m window. When it cannot form a technical
    // period, use its native completed timeframe endpoint so dashboard indicators remain populated.
    if (goldCandles.length < 200) goldCandles = await fetchDirectCandles("XAUUSD", timeframe);
    if (silverCandles.length < 200) silverCandles = await fetchDirectCandles("XAGUSD", timeframe);
    const gold = analyze(goldCandles), silver = analyze(silverCandles);
    return NextResponse.json({
      source: "BiQuote", dataArchitecture: goldCandles.length && gold1m.length < 200 ? "master-1m-with-native-history-fallback" : "master-1m-derived", generatedAt: new Date().toISOString(), timeframe, masterInterval: "1m",
      feed: { gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" }, silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" } },
      history: { gold1mSamples: gold1m.length, silver1mSamples: silver1m.length, goldAnalysisSamples: goldCandles.length, silverAnalysisSamples: silverCandles.length },
      gold: { intraday: gold }, silver: { intraday: silver },
      methodology: { note: "GSAT prefers one normalized BiQuote 1-minute master series and derives higher timeframes from it. If BiQuote exposes too little 1m history for a requested technical period, GSAT uses the provider's native completed timeframe history rather than displaying an empty dashboard.", indicators: "EMA 20/50/200 use close prices; RSI 14 and ATR 14 use Wilder RMA; MACD uses EMA 12/26 with EMA 9 signal.", dataQuality: "Incomplete upstream 1m depth is never presented as valid long-history data. Native timeframe fallback is explicitly reported through dataArchitecture.", display: "TradingView OANDA widgets are display-only. No OANDA API is used." },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BiQuote analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
