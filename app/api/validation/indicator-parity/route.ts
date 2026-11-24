import { NextResponse } from "next/server";
import { analyzeVerified } from "../../../../lib/technical-advanced";
import { normalizeMasterCandles } from "../../../../lib/market-data/master-ohlc";
import type { TechnicalCandle } from "../../../../lib/technical";

export const dynamic = "force-dynamic";

type SymbolCode = "XAUUSD" | "XAGUSD";
type Bar = Record<string, unknown>;

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function independentEma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let value = mean(values.slice(0, period));
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) value = alpha * values[i] + (1 - alpha) * value;
  return value;
}

function independentRma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let value = mean(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) value = ((period - 1) * value + values[i]) / period;
  return value;
}

function independentRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const gain = independentRma(gains, period);
  const loss = independentRma(losses, period);
  if (gain == null || loss == null) return null;
  if (loss === 0) return gain === 0 ? 50 : 100;
  if (gain === 0) return 0;
  return 100 - 100 / (1 + gain / loss);
}

function independentMacd(closes: number[]) {
  const fast: Array<number | null> = Array(closes.length).fill(null);
  const slow: Array<number | null> = Array(closes.length).fill(null);
  const seed = (period: number, out: Array<number | null>) => {
    if (closes.length < period) return;
    let value = mean(closes.slice(0, period));
    out[period - 1] = value;
    const alpha = 2 / (period + 1);
    for (let i = period; i < closes.length; i += 1) {
      value = alpha * closes[i] + (1 - alpha) * value;
      out[i] = value;
    }
  };
  seed(12, fast);
  seed(26, slow);
  const line: number[] = [];
  for (let i = 25; i < closes.length; i += 1) {
    if (fast[i] != null && slow[i] != null) line.push(fast[i]! - slow[i]!);
  }
  if (line.length < 9) return { line: null, signal: null, histogram: null };
  let signal = mean(line.slice(0, 9));
  const alpha = 2 / 10;
  for (let i = 9; i < line.length; i += 1) signal = alpha * line[i] + (1 - alpha) * signal;
  const current = line[line.length - 1];
  return { line: current, signal, histogram: current - signal };
}

function independentAtr(candles: TechnicalCandle[], period = 14): number | null {
  if (candles.length < period) return null;
  const ranges = candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.c;
    return previousClose == null
      ? candle.h - candle.l
      : Math.max(candle.h - candle.l, Math.abs(candle.h - previousClose), Math.abs(candle.l - previousClose));
  });
  return independentRma(ranges, period);
}

async function fetchCandles(symbol: SymbolCode, interval: string) {
  const url = new URL("https://biquote.io/api/" + symbol + "/ohlc");
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", "1000");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("BiQuote " + symbol + " " + interval + " returned " + response.status);
  const payload = await response.json() as { bars?: Bar[] };
  return normalizeMasterCandles(Array.isArray(payload.bars) ? payload.bars : [], symbol)
    .map(({ symbol: _symbol, ...candle }) => candle as TechnicalCandle);
}

function compare(symbol: SymbolCode, candles: TechnicalCandle[]) {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const closes = sorted.map(c => c.c);
  const actual = analyzeVerified(sorted);
  const expected = {
    ema20: independentEma(closes, 20),
    ema50: independentEma(closes, 50),
    ema200: independentEma(closes, 200),
    rsi14: independentRsi(closes, 14),
    ...independentMacd(closes),
    atr14: independentAtr(sorted, 14),
  };
  const observed = {
    ema20: actual.ema.ema20,
    ema50: actual.ema.ema50,
    ema200: actual.ema.ema200,
    rsi14: actual.momentum.rsi14,
    line: actual.momentum.macd,
    signal: actual.momentum.macdSignal,
    histogram: actual.momentum.macdHistogram,
    atr14: actual.volatility.atr14,
  };
  const deltas = Object.fromEntries(Object.keys(expected).map(key => {
    const left = expected[key as keyof typeof expected];
    const right = observed[key as keyof typeof observed];
    return [key, left == null || right == null ? null : Math.abs(left - right)];
  }));
  const checked = Object.values(deltas).filter((value): value is number => value != null);
  return {
    symbol,
    source: "BiQuote native OHLC",
    samples: sorted.length,
    firstClosedCandleAt: sorted[0]?.t ?? null,
    lastClosedCandleAt: sorted.at(-1)?.t ?? null,
    reference: expected,
    gsat: observed,
    absoluteDifferences: deltas,
    allAvailableIndicatorsMatch: checked.length > 0 && checked.every(value => value < 1e-9),
    note: "Independent implementation recalculates indicators from the exact same normalized, completed BiQuote candles. This validates arithmetic on this snapshot, not agreement with another broker's candles or future feed quality.",
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const interval = params.get("timeframe") ?? "15m";
  const intervals: Record<string, string> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
  if (!intervals[interval]) return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  try {
    const [gold, silver] = await Promise.all([
      fetchCandles("XAUUSD", intervals[interval]),
      fetchCandles("XAGUSD", intervals[interval]),
    ]);
    const results = [compare("XAUUSD", gold), compare("XAGUSD", silver)];
    return NextResponse.json({
      ok: results.every(result => result.allAvailableIndicatorsMatch),
      timeframe: interval,
      generatedAt: new Date().toISOString(),
      results,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Parity audit failed" }, { status: 502 });
  }
}
