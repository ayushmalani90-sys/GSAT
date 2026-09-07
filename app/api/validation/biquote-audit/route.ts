import { NextResponse } from "next/server";
import { aggregate1mCandles, normalizeMasterCandles, validateMasterCandleSequence, type MasterCandle } from "../../../../lib/market-data/master-ohlc";
import { fetchBiquoteHistory } from "../../../../lib/market-data/biquote-history";
import { analyze, type TechnicalAnalysis, type TechnicalCandle } from "../../../../lib/technical";

export const dynamic = "force-dynamic";

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type SymbolCode = "XAUUSD" | "XAGUSD";
const MAP: Record<Timeframe, "15m" | "1h" | "4h" | "1d"> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const HISTORY_LIMIT = 20000;

function aggregate(candles: MasterCandle[], timeframe: Timeframe): TechnicalCandle[] {
  return aggregate1mCandles(candles, MAP[timeframe]).map(({ symbol: _s, sourceInterval: _i, ...c }) => c);
}

function eight(analysis: TechnicalAnalysis) {
  return {
    ema: analysis.ema,
    rsi: { value: analysis.momentum.rsi14, bias: analysis.momentum.rsiBias },
    macd: { line: analysis.momentum.macd, signal: analysis.momentum.macdSignal, histogram: analysis.momentum.macdHistogram, bias: analysis.momentum.macdBias },
    atr: analysis.volatility,
    supportResistance: analysis.supportResistance,
    fibonacci: analysis.fibonacci,
    volumeProfile: analysis.volumeProfile,
    patterns: analysis.patterns,
    overall: analysis.overall,
  };
}

async function history(symbol: SymbolCode) {
  return fetchBiquoteHistory(symbol, "1m", HISTORY_LIMIT, bars => normalizeMasterCandles(bars, symbol));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const timeframe = (params.get("timeframe") ?? "1H") as Timeframe;
  if (!TIMEFRAMES.includes(timeframe)) return NextResponse.json({ error: `Unsupported timeframe: ${timeframe}` }, { status: 400 });
  try {
    const [gold, silver] = await Promise.all([history("XAUUSD"), history("XAGUSD")]);
    const gold1m = gold.bars;
    const silver1m = silver.bars;
    const goldTf = aggregate(gold1m, timeframe).slice(-5000);
    const silverTf = aggregate(silver1m, timeframe).slice(-5000);
    const goldAnalysis = analyze(goldTf);
    const silverAnalysis = analyze(silverTf);
    return NextResponse.json({
      ok: true,
      source: "BiQuote",
      timeframe,
      calculationDataset: "normalized completed BiQuote 1m OHLC",
      history: {
        gold: { ...gold.diagnostics, quality: validateMasterCandleSequence(gold1m), analysisSamples: goldTf.length },
        silver: { ...silver.diagnostics, quality: validateMasterCandleSequence(silver1m), analysisSamples: silverTf.length },
      },
      outputs: { gold: eight(goldAnalysis), silver: eight(silverAnalysis) },
      verification: {
        complete: [goldAnalysis, silverAnalysis].every(a =>
          a.ema.ema20 != null && a.ema.ema50 != null && a.ema.ema200 != null &&
          a.momentum.rsi14 != null && a.momentum.macd != null && a.momentum.macdSignal != null && a.momentum.macdHistogram != null &&
          a.volatility.atr14 != null && a.supportResistance.supports.length + a.supportResistance.resistances.length > 0 &&
          a.fibonacci.levels.length > 0 && a.volumeProfile.poc != null
        ),
        note: "Eight technical output groups are computed from the exact same normalized BiQuote 1m dataset and its deterministic higher-timeframe aggregation. This verifies dataset linkage and output completeness; it is not a claim of parity with OANDA/TradingView."
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "BiQuote audit failed" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
