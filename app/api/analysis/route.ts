import { NextResponse } from "next/server";

type Point = { t: string; p: number };
type Analysis = {
  price: number | null;
  samples: number;
  ema: { ema20: number | null; ema50: number | null; ema200: number | null; priceVsEma20: string; priceVsEma50: string; priceVsEma200: string; bias: string };
  momentum: { rsi14: number | null; macd: number | null; macdSignal: number | null; macdHistogram: number | null; macdBias: string; rsiBias: string };
  supportResistance: { supports: number[]; resistances: number[] };
};

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) current = values[i] * k + current * (1 - k);
  return current;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = Math.max(d, 0);
    const loss = Math.max(-d, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  if (fast == null || slow == null) return { line: null, signal: null, histogram: null };
  const macdSeries: number[] = [];
  for (let i = 26; i <= values.length; i++) {
    const f = ema(values.slice(0, i), 12);
    const s = ema(values.slice(0, i), 26);
    if (f != null && s != null) macdSeries.push(f - s);
  }
  const line = macdSeries.at(-1) ?? (fast - slow);
  const signal = ema(macdSeries, 9);
  return { line, signal, histogram: signal == null ? null : line - signal };
}

function levels(values: number[], current: number) {
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = 2; i < values.length - 2; i++) {
    const v = values[i];
    const lowPivot = v <= values[i - 1] && v <= values[i - 2] && v <= values[i + 1] && v <= values[i + 2];
    const highPivot = v >= values[i - 1] && v >= values[i - 2] && v >= values[i + 1] && v >= values[i + 2];
    if (lowPivot && v < current) supports.push(v);
    if (highPivot && v > current) resistances.push(v);
  }
  return { supports: [...new Set(supports.map((v) => Number(v.toFixed(2))))].sort((a,b) => b-a).slice(0,3), resistances: [...new Set(resistances.map((v) => Number(v.toFixed(2))))].sort((a,b) => a-b).slice(0,3) };
}

function analyze(points: Point[]): Analysis {
  const values = points.map((p) => p.p).filter(Number.isFinite);
  const price = values.at(-1) ?? null;
  const e20 = ema(values, 20);
  const e50 = ema(values, 50);
  const e200 = ema(values, 200);
  const relation = (e: number | null) => e == null || price == null ? "Unavailable" : price > e ? "Above" : price < e ? "Below" : "At";
  const bullish = [e20, e50, e200].filter((e) => price != null && e != null && price > e).length;
  const bearish = [e20, e50, e200].filter((e) => price != null && e != null && price < e).length;
  const bias = bullish >= 2 ? "Bullish EMA structure" : bearish >= 2 ? "Bearish EMA structure" : "Mixed EMA structure";
  const r = rsi(values);
  const m = macd(values);
  return {
    price,
    samples: values.length,
    ema: { ema20: e20, ema50: e50, ema200: e200, priceVsEma20: relation(e20), priceVsEma50: relation(e50), priceVsEma200: relation(e200), bias },
    momentum: {
      rsi14: r,
      macd: m.line,
      macdSignal: m.signal,
      macdHistogram: m.histogram,
      macdBias: m.line == null || m.signal == null ? "Unavailable" : m.line > m.signal ? "Bullish MACD" : m.line < m.signal ? "Bearish MACD" : "Neutral MACD",
      rsiBias: r == null ? "Unavailable" : r >= 70 ? "Overbought" : r <= 30 ? "Oversold" : r >= 50 ? "Bullish momentum" : "Bearish momentum",
    },
    supportResistance: price == null ? { supports: [], resistances: [] } : levels(values, price),
  };
}

async function fetchIntraday(symbol: "xau" | "xag", hours: number): Promise<Point[]> {
  const url = `https://xaus.com/api/v1/intraday?symbol=${symbol}&hours=${hours}&fresh=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`XAUS ${symbol} intraday unavailable`);
  const data = await response.json();
  return Array.isArray(data?.points) ? data.points.map((p: { t?: string; p?: number }) => ({ t: String(p.t), p: Number(p.p) })).filter((p: Point) => Number.isFinite(p.p) && p.t) : [];
}

async function fetchDailyGold(): Promise<Point[]> {
  const response = await fetch(`https://xaus.com/api/v1/history?fresh=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.points) ? data.points.map((p: { d?: string; c?: number }) => ({ t: String(p.d), p: Number(p.c) })).filter((p: Point) => Number.isFinite(p.p) && p.t) : [];
}

export async function GET(request: Request) {
  const hours = Math.min(48, Math.max(24, Number(new URL(request.url).searchParams.get("hours") ?? 48)));
  try {
    const [goldIntraday, silverIntraday, goldDaily] = await Promise.all([fetchIntraday("xau", hours), fetchIntraday("xag", hours), fetchDailyGold()]);
    return NextResponse.json({
      source: "XAUS",
      generatedAt: new Date().toISOString(),
      gold: { intraday: analyze(goldIntraday), daily: analyze(goldDaily) },
      silver: { intraday: analyze(silverIntraday), daily: analyze([]) },
      methodology: { note: "EMA, RSI, MACD and pivot-based support/resistance are calculated from real XAUS observations only. Silver long-term daily EMA is withheld because XAUS currently documents daily history for XAU and intraday recorded history for XAG." },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Technical analysis unavailable" }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
