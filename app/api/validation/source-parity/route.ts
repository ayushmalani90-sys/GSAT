import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { analyze, type TechnicalCandle } from "../../../../lib/technical";

export const runtime = "nodejs";
export const maxDuration = 30;

const TIMEFRAMES = {
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D1",
} as const;
type SymbolCode = "XAUUSD" | "XAGUSD";
type Basis = "bid" | "ask" | "mid";

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function metric(a: number | null, b: number | null) {
  return {
    biquote: a,
    evTradingLabs: b,
    absoluteDifference: a == null || b == null ? null : Math.abs(a - b),
  };
}

function snapshot(candles: TechnicalCandle[]) {
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

function summarizeDiff(barsA: TechnicalCandle[], barsB: TechnicalCandle[]) {
  const diffs = { open: [] as number[], high: [] as number[], low: [] as number[], close: [] as number[] };
  for (let i = 0; i < barsA.length; i += 1) {
    diffs.open.push(Math.abs(barsA[i].o - barsB[i].o));
    diffs.high.push(Math.abs(barsA[i].h - barsB[i].h));
    diffs.low.push(Math.abs(barsA[i].l - barsB[i].l));
    diffs.close.push(Math.abs(barsA[i].c - barsB[i].c));
  }
  const mean = (xs: number[]) => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
  const max = (xs: number[]) => xs.length ? Math.max(...xs) : null;
  return {
    meanAbsolute: {
      open: mean(diffs.open),
      high: mean(diffs.high),
      low: mean(diffs.low),
      close: mean(diffs.close),
    },
    maxAbsolute: {
      open: max(diffs.open),
      high: max(diffs.high),
      low: max(diffs.low),
      close: max(diffs.close),
    },
  };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") ?? "XAUUSD").toUpperCase() as SymbolCode;
  const timeframe = (params.get("timeframe") ?? "1D") as keyof typeof TIMEFRAMES;
  const year = Number(params.get("year") ?? "2025");
  if (symbol !== "XAUUSD" && symbol !== "XAGUSD") {
    return NextResponse.json({ error: "symbol must be XAUUSD or XAGUSD" }, { status: 400 });
  }
  if (!(timeframe in TIMEFRAMES)) {
    return NextResponse.json({ error: "timeframe must be 15m, 1H, 4H or 1D" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2003 || year > 2025) {
    return NextResponse.json({
      error: "Public EV archive files are available for closed years through 2025; current-year 2026 files require a free account.",
    }, { status: 403 });
  }

  try {
    const [biquoteResponse, archiveResponse] = await Promise.all([
      fetch(`https://biquote.io/api/${symbol}/ohlc?interval=${TIMEFRAMES[timeframe]}&limit=1000`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
      fetch(`https://evtradelabs.com/api/simulator/data/${symbol}/${TIMEFRAMES[timeframe]}/${year}.json.gz`, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 GSAT historical-source validation" },
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    if (!biquoteResponse.ok) throw new Error("BiQuote returned HTTP " + biquoteResponse.status);
    if (!archiveResponse.ok) throw new Error("EV Trading Labs archive returned HTTP " + archiveResponse.status);

    const biquotePayload = await biquoteResponse.json() as { bars?: Array<Record<string, unknown>> };
    if (!Array.isArray(biquotePayload.bars)) throw new Error("BiQuote response did not contain bars");
    const biquote = biquotePayload.bars
      .filter((bar) => bar.isOpen === false)
      .map((bar) => {
        const t = Date.parse(String(bar.openTime ?? ""));
        const o = finite(bar.open), h = finite(bar.high), l = finite(bar.low), c = finite(bar.close);
        if (!Number.isFinite(t) || o == null || h == null || l == null || c == null) return null;
        return { t: new Date(t).toISOString(), o, h, l, c, volume: finite(bar.volume) ?? undefined };
      })
      .filter((bar): bar is TechnicalCandle => bar !== null)
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

    const compressed = Buffer.from(await archiveResponse.arrayBuffer());
    const archiveRows = JSON.parse(gunzipSync(compressed).toString("utf8")) as Array<Record<string, unknown>>;
    const evByBasis: Record<Basis, TechnicalCandle[]> = { bid: [], ask: [], mid: [] };
    for (const row of archiveRows) {
      const ts = finite(row.ts);
      const bidO = finite(row.o), bidH = finite(row.h), bidL = finite(row.l), bidC = finite(row.c);
      const askO = finite(row.ao), askH = finite(row.ah), askL = finite(row.al), askC = finite(row.ac);
      if (ts == null || bidO == null || bidH == null || bidL == null || bidC == null ||
          askO == null || askH == null || askL == null || askC == null) continue;
      const t = new Date(ts * 1000).toISOString();
      evByBasis.bid.push({ t, o: bidO, h: bidH, l: bidL, c: bidC, volume: finite(row.v) ?? undefined });
      evByBasis.ask.push({ t, o: askO, h: askH, l: askL, c: askC, volume: finite(row.v) ?? undefined });
      evByBasis.mid.push({
        t,
        o: (bidO + askO) / 2,
        h: (bidH + askH) / 2,
        l: (bidL + askL) / 2,
        c: (bidC + askC) / 2,
        volume: finite(row.v) ?? undefined,
      });
    }

    const biquoteMap = new Map(biquote.map((bar) => [bar.t, bar]));
    const evMaps = Object.fromEntries(
      (Object.keys(evByBasis) as Basis[]).map((basis) => [
        basis,
        new Map(evByBasis[basis].map((bar) => [bar.t, bar])),
      ]),
    ) as Record<Basis, Map<string, TechnicalCandle>>;
    const commonTimes = [...biquoteMap.keys()]
      .filter((time) => evMaps.bid.has(time) && evMaps.ask.has(time) && evMaps.mid.has(time))
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    if (commonTimes.length === 0) {
      return NextResponse.json({
        ok: true,
        symbol,
        timeframe,
        archiveYear: year,
        archiveRows: archiveRows.length,
        biquoteBars: biquote.length,
        evTradingLabsBars: evByBasis.bid.length,
        exactTimestampMatches: 0,
        commonWindow: null,
        ohlcDifference: null,
        indicatorDifference: null,
        caveat: "No exact UTC candle timestamps overlap. No OHLC or indicator parity claim is possible for this timeframe/year pair.",
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const alignedBiQuote = commonTimes.map((time) => biquoteMap.get(time)!);
    const alignedEv = {
      bid: commonTimes.map((time) => evMaps.bid.get(time)!),
      ask: commonTimes.map((time) => evMaps.ask.get(time)!),
      mid: commonTimes.map((time) => evMaps.mid.get(time)!),
    };

    const ohlcDifference = {
      bid: summarizeDiff(alignedBiQuote, alignedEv.bid),
      ask: summarizeDiff(alignedBiQuote, alignedEv.ask),
      mid: summarizeDiff(alignedBiQuote, alignedEv.mid),
    };
    const meanClose = {
      bid: ohlcDifference.bid.meanAbsolute.close,
      ask: ohlcDifference.ask.meanAbsolute.close,
      mid: ohlcDifference.mid.meanAbsolute.close,
    };
    const bestBasis = (Object.keys(meanClose) as Basis[])
      .filter((basis) => meanClose[basis] != null)
      .sort((a, b) => meanClose[a]! - meanClose[b]!)[0] ?? null;
    const biquoteIndicators = snapshot(alignedBiQuote);
    const evIndicators = {
      bid: snapshot(alignedEv.bid),
      ask: snapshot(alignedEv.ask),
      mid: snapshot(alignedEv.mid),
    };

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      archiveYear: year,
      archiveRows: archiveRows.length,
      archiveCompressedBytes: compressed.length,
      sources: {
        biquote: "BiQuote native OHLC",
        evTradingLabs: "EV Trading Labs archive, aggregated from Dukascopy ticks with bid and ask",
      },
      candleCounts: {
        biquote: biquote.length,
        evTradingLabs: evByBasis.bid.length,
        exactTimestampMatches: commonTimes.length,
        biquoteOnly: biquote.length - commonTimes.length,
        evOnly: evByBasis.bid.length - commonTimes.length,
      },
      commonWindow: commonTimes.length ? { from: commonTimes[0], to: commonTimes[commonTimes.length - 1] } : null,
      bestMatchingEVPriceBasisByMeanCloseDifference: bestBasis,
      ohlcDifference,
      indicatorDifference: {
        ema20: { biquote: biquoteIndicators.ema20, evBid: evIndicators.bid.ema20, evAsk: evIndicators.ask.ema20, evMid: evIndicators.mid.ema20 },
        ema50: { biquote: biquoteIndicators.ema50, evBid: evIndicators.bid.ema50, evAsk: evIndicators.ask.ema50, evMid: evIndicators.mid.ema50 },
        ema200: { biquote: biquoteIndicators.ema200, evBid: evIndicators.bid.ema200, evAsk: evIndicators.ask.ema200, evMid: evIndicators.mid.ema200 },
        rsi14: { biquote: biquoteIndicators.rsi14, evBid: evIndicators.bid.rsi14, evAsk: evIndicators.ask.rsi14, evMid: evIndicators.mid.rsi14 },
        macd: { biquote: biquoteIndicators.macd, evBid: evIndicators.bid.macd, evAsk: evIndicators.ask.macd, evMid: evIndicators.mid.macd },
        macdSignal: { biquote: biquoteIndicators.macdSignal, evBid: evIndicators.bid.macdSignal, evAsk: evIndicators.ask.macdSignal, evMid: evIndicators.mid.macdSignal },
        macdHistogram: { biquote: biquoteIndicators.macdHistogram, evBid: evIndicators.bid.macdHistogram, evAsk: evIndicators.ask.macdHistogram, evMid: evIndicators.mid.macdHistogram },
        atr14: { biquote: biquoteIndicators.atr14, evBid: evIndicators.bid.atr14, evAsk: evIndicators.ask.atr14, evMid: evIndicators.mid.atr14 },
      },
      caveat: "This is a feed comparison on exact common UTC candle timestamps. EV Trading Labs is Dukascopy-derived, not BiQuote. Do not merge the histories until price-basis and OHLC differences are reviewed. Indicator comparisons are only meaningful when the common timestamp sample is sufficiently long.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      symbol,
      timeframe,
      error: error instanceof Error ? error.message : "Historical source comparison failed",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
