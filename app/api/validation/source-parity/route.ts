import { NextResponse } from "next/server";
import { getHistoricalRates } from "dukascopy-node";
import { analyze, type TechnicalCandle } from "../../../../lib/technical";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIMEFRAMES = {
  "15m": { biquote: "15m", dukascopy: "m15" },
  "1H": { biquote: "1h", dukascopy: "h1" },
  "4H": { biquote: "4h", dukascopy: "h4" },
  "1D": { biquote: "1d", dukascopy: "d1" },
} as const;

type SymbolCode = "XAUUSD" | "XAGUSD";

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanCandle(raw: Record<string, unknown>, source: "BiQuote" | "Dukascopy"): TechnicalCandle | null {
  const timestamp = source === "BiQuote"
    ? Date.parse(String(raw.openTime ?? raw.t ?? ""))
    : finite(raw.timestamp);
  const o = finite(source === "BiQuote" ? raw.open : raw.open);
  const h = finite(raw.high);
  const l = finite(raw.low);
  const c = finite(raw.close);
  if (
    timestamp == null || !Number.isFinite(timestamp) ||
    o == null || h == null || l == null || c == null ||
    o <= 0 || h <= 0 || l <= 0 || c <= 0 ||
    h < Math.max(o, c, l) || l > Math.min(o, c, h)
  ) return null;
  return {
    t: new Date(timestamp).toISOString(),
    o, h, l, c,
    volume: finite(raw.volume) ?? undefined,
    tickVolume: finite(raw.tickVolume) ?? undefined,
  };
}

function indicatorSnapshot(candles: TechnicalCandle[]) {
  const a = analyze(candles);
  return {
    samples: a.samples,
    ema20: a.ema.ema20,
    ema50: a.ema.ema50,
    ema200: a.ema.ema200,
    rsi14: a.momentum.rsi14,
    macd: a.momentum.macd,
    macdSignal: a.momentum.macdSignal,
    macdHistogram: a.momentum.macdHistogram,
    atr14: a.volatility.atr14,
  };
}

function difference(a: number | null, b: number | null) {
  return {
    biquote: a,
    dukascopy: b,
    absoluteDifference: a == null || b == null ? null : Math.abs(a - b),
  };
}

export async function GET(request: Request) {
  // This is a preview-only QA route. Never expose an unauthenticated source
  // comparison endpoint from the production deployment.
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") ?? "XAUUSD").toUpperCase() as SymbolCode;
  const timeframe = (params.get("timeframe") ?? "15m") as keyof typeof TIMEFRAMES;
  if (symbol !== "XAUUSD" && symbol !== "XAGUSD") {
    return NextResponse.json({ error: "symbol must be XAUUSD or XAGUSD" }, { status: 400 });
  }
  if (!(timeframe in TIMEFRAMES)) {
    return NextResponse.json({ error: "timeframe must be 15m, 1H, 4H or 1D" }, { status: 400 });
  }

  try {
    const spec = TIMEFRAMES[timeframe];
    const biquoteUrl = new URL("https://biquote.io/api/" + symbol + "/ohlc");
    biquoteUrl.searchParams.set("interval", spec.biquote);
    biquoteUrl.searchParams.set("limit", "1000");
    const biquoteResponse = await fetch(biquoteUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!biquoteResponse.ok) {
      throw new Error("BiQuote OHLC request failed with HTTP " + biquoteResponse.status);
    }
    const biquotePayload = await biquoteResponse.json() as { bars?: Array<Record<string, unknown>> };
    if (!Array.isArray(biquotePayload.bars)) throw new Error("BiQuote response did not contain bars");

    const biquoteCandles = biquotePayload.bars
      .filter((bar) => bar.isOpen === false)
      .map((bar) => cleanCandle(bar, "BiQuote"))
      .filter((bar): bar is TechnicalCandle => bar !== null)
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

    if (biquoteCandles.length < 2) {
      return NextResponse.json({
        ok: false,
        symbol,
        timeframe,
        error: "BiQuote did not return enough completed candles for an overlap test",
        biquoteBars: biquoteCandles.length,
      }, { status: 424 });
    }

    const from = biquoteCandles[0].t;
    const to = new Date().toISOString();
    const instrument = symbol.toLowerCase() as "xauusd" | "xagusd";
    const rawDukascopy = await getHistoricalRates({
      instrument,
      dates: { from, to },
      timeframe: spec.dukascopy,
      priceType: "bid",
      format: "json",
      volumes: true,
      batchSize: 5,
      pauseBetweenBatchesMs: 500,
      retryCount: 2,
      pauseBetweenRetriesMs: 500,
      useCache: false,
    }) as unknown as Array<Record<string, unknown>>;

    const dukascopyCandles = rawDukascopy
      .map((bar) => cleanCandle(bar, "Dukascopy"))
      .filter((bar): bar is TechnicalCandle => bar !== null)
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

    const biquoteByTime = new Map(biquoteCandles.map((bar) => [bar.t, bar]));
    const dukascopyByTime = new Map(dukascopyCandles.map((bar) => [bar.t, bar]));
    const commonTimes = [...biquoteByTime.keys()]
      .filter((time) => dukascopyByTime.has(time))
      .sort((a, b) => Date.parse(a) - Date.parse(b));

    const closeDiffs: number[] = [];
    const closePctDiffs: number[] = [];
    const ohlcDiffs: number[] = [];
    for (const time of commonTimes) {
      const b = biquoteByTime.get(time)!;
      const d = dukascopyByTime.get(time)!;
      closeDiffs.push(Math.abs(b.c - d.c));
      closePctDiffs.push(Math.abs(b.c - d.c) / Math.abs(b.c) * 100);
      ohlcDiffs.push(
        Math.abs(b.o - d.o),
        Math.abs(b.h - d.h),
        Math.abs(b.l - d.l),
        Math.abs(b.c - d.c),
      );
    }

    const max = (values: number[]) => values.length ? Math.max(...values) : null;
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const biquoteIndicators = indicatorSnapshot(biquoteCandles);
    const dukascopyIndicators = indicatorSnapshot(dukascopyCandles);

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      window: { from, to },
      sources: {
        biquote: "BiQuote OHLC (native source used by GSAT)",
        dukascopy: "Dukascopy Bank historical feed, BID candles",
      },
      candleCounts: {
        biquote: biquoteCandles.length,
        dukascopy: dukascopyCandles.length,
        exactTimestampMatches: commonTimes.length,
        biquoteOnly: biquoteCandles.length - commonTimes.length,
        dukascopyOnly: dukascopyCandles.length - commonTimes.length,
      },
      ohlcDifference: {
        meanAbsoluteCloseDifference: mean(closeDiffs),
        maxAbsoluteCloseDifference: max(closeDiffs),
        meanAbsoluteCloseDifferencePercent: mean(closePctDiffs),
        maxAbsoluteCloseDifferencePercent: max(closePctDiffs),
        meanAbsoluteOhlcDifference: mean(ohlcDiffs),
        maxAbsoluteOhlcDifference: max(ohlcDiffs),
      },
      indicatorDifference: {
        ema20: difference(biquoteIndicators.ema20, dukascopyIndicators.ema20),
        ema50: difference(biquoteIndicators.ema50, dukascopyIndicators.ema50),
        ema200: difference(biquoteIndicators.ema200, dukascopyIndicators.ema200),
        rsi14: difference(biquoteIndicators.rsi14, dukascopyIndicators.rsi14),
        macd: difference(biquoteIndicators.macd, dukascopyIndicators.macd),
        macdSignal: difference(biquoteIndicators.macdSignal, dukascopyIndicators.macdSignal),
        macdHistogram: difference(biquoteIndicators.macdHistogram, dukascopyIndicators.macdHistogram),
        atr14: difference(biquoteIndicators.atr14, dukascopyIndicators.atr14),
      },
      biquoteIndicators,
      dukascopyIndicators,
      interpretation: "Reference comparison only. These are different broker feeds and may use different bid/ask construction. Do not merge the two candle histories until the overlap differences and timestamp alignment are reviewed.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      symbol,
      timeframe,
      error: error instanceof Error ? error.message : "Source parity comparison failed",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
