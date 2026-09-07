import { NextResponse } from "next/server";
import { analyze, type TechnicalCandle } from "../../../lib/technical";
import { aggregate1mCandles, normalizeMasterCandles, validateMasterCandleSequence, type MasterCandle } from "../../../lib/market-data/master-ohlc";

type BiquoteTick = {
  symbol?: string; mid?: number; bid?: number; ask?: number; dayDiffPercent?: number;
  timestamp?: string; stale?: boolean; marketState?: string; quoteAgeSeconds?: number;
};
type CandleResponse = { bars?: Array<Record<string, unknown>>; message?: string };
const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type SymbolCode = "XAUUSD" | "XAGUSD";
const MAX_CANDLES = 2000;
const TF_AGGREGATION: Record<Timeframe, "15m" | "1h" | "4h" | "1d"> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };

async function fetchMaster1mCandles(symbol: SymbolCode): Promise<MasterCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", "1m");
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
  return aggregate1mCandles(candles, TF_AGGREGATION[timeframe]).map(({ symbol: _symbol, sourceInterval: _sourceInterval, ...candle }) => candle);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframeParam = params.get("timeframe") ?? "1H";
  if (!(TIMEFRAMES as readonly string[]).includes(timeframeParam)) {
    return NextResponse.json({ error: `Unsupported timeframe: ${timeframeParam}` }, { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  const timeframe = timeframeParam as Timeframe;
  try {
    const [gold1m, silver1m, goldTick, silverTick] = await Promise.all([
      fetchMaster1mCandles("XAUUSD"), fetchMaster1mCandles("XAGUSD"), fetchBiquoteTick("XAUUSD"), fetchBiquoteTick("XAGUSD"),
    ]);
    const goldQuality = validateMasterCandleSequence(gold1m);
    const silverQuality = validateMasterCandleSequence(silver1m);
    const goldCandles = aggregateForTimeframe(gold1m, timeframe);
    const silverCandles = aggregateForTimeframe(silver1m, timeframe);

    // Never let a short BiQuote 1m response make every indicator disappear.
    // The dashboard always gets the available technical values; only the individual
    // indicator whose minimum period is not met remains null.
    const response = {
      source: "BiQuote",
      dataArchitecture: "master-1m-derived",
      generatedAt: new Date().toISOString(),
      timeframe,
      masterInterval: "1m",
      feed: {
        gold: { ...goldTick, price: goldTick.mid, source: "BiQuote" },
        silver: { ...silverTick, price: silverTick.mid, source: "BiQuote" },
      },
      history: {
        gold1mSamples: gold1m.length, silver1mSamples: silver1m.length,
        goldDerivedSamples: goldCandles.length, silverDerivedSamples: silverCandles.length,
        goldMasterQuality: goldQuality, silverMasterQuality: silverQuality,
      },
      gold: { intraday: analyze(goldCandles) },
      silver: { intraday: analyze(silverCandles) },
      methodology: {
        note: "One normalized BiQuote 1-minute master series is aggregated into 15m, 1H, 4H and 1D before analysis.",
        indicators: "EMA 20/50/200 use close prices; RSI 14 and ATR 14 use Wilder RMA; MACD uses EMA 12/26 with EMA 9 signal.",
        dataQuality: "Malformed candles are excluded. Gaps are reported and are not silently filled. A short upstream 1m window can limit the available indicator periods.",
        display: "TradingView OANDA widgets are display-only. GSAT does not use the OANDA API.",
      },
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BiQuote master 1m analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
