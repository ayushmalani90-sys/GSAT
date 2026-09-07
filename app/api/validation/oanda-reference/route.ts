import { NextResponse } from "next/server";
import { calculateParity, parityStatus, type OandaReference } from "../../../../lib/oanda-parity";
import { analyze, type TechnicalCandle } from "../../../../lib/technical";

export const dynamic = "force-dynamic";

const INTERVALS: Record<string, string> = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const SYMBOLS = ["XAUUSD", "XAGUSD"] as const;
type SymbolCode = (typeof SYMBOLS)[number];

async function fetchCandles(symbol: SymbolCode, timeframe: string): Promise<TechnicalCandle[]> {
  const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
  url.searchParams.set("interval", INTERVALS[timeframe]);
  url.searchParams.set("limit", "500");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`BiQuote ${symbol} OHLC unavailable (${response.status})`);
  const data = await response.json() as { bars?: Array<Record<string, unknown>> };
  if (!Array.isArray(data.bars)) throw new Error(`BiQuote returned no ${symbol} bars`);
  return data.bars.filter(b => b.isOpen !== true).map(b => ({
    t: String(b.openTime ?? b.t ?? ""),
    o: Number(b.open ?? b.o), h: Number(b.high ?? b.h), l: Number(b.low ?? b.l), c: Number(b.close ?? b.c),
    volume: Number.isFinite(Number(b.volume)) ? Number(b.volume) : undefined,
    tickVolume: Number.isFinite(Number(b.tickVolume)) ? Number(b.tickVolume) : undefined,
  })).filter(c => Boolean(c.t) && [c.o,c.h,c.l,c.c].every(Number.isFinite)).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}

function parseReference(params: URLSearchParams): OandaReference {
  const num = (k: string) => { const n = Number(params.get(k)); return Number.isFinite(n) ? n : undefined; };
  return { symbol: params.get("symbol") ?? "", timeframe: params.get("timeframe") ?? "", capturedAt: params.get("capturedAt") ?? new Date().toISOString(), price:num("price"), ema20:num("ema20"), ema50:num("ema50"), ema200:num("ema200"), rsi14:num("rsi14"), macd:num("macd"), macdSignal:num("macdSignal"), macdHistogram:num("macdHistogram"), atr14:num("atr14") };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") as SymbolCode | null;
  const timeframe = params.get("timeframe") ?? "1H";
  if (!symbol || !SYMBOLS.includes(symbol) || !INTERVALS[timeframe]) return NextResponse.json({ error: "Use symbol=XAUUSD|XAGUSD and timeframe=15m|1H|4H|1D" }, { status:400 });
  try {
    const candles = await fetchCandles(symbol, timeframe);
    const reference = parseReference(params);
    const rows = calculateParity(candles, reference);
    const analysis = analyze(candles);
    return NextResponse.json({ symbol, timeframe, capturedAt: reference.capturedAt, status: parityStatus(rows), candles: candles.length, current: analysis, rows, note: "Reference values are manually captured from the TradingView OANDA chart. This route compares numbers; it does not scrape or access TradingView internals." }, { headers:{"Cache-Control":"no-store, max-age=0"} });
  } catch(error) { return NextResponse.json({ error:error instanceof Error?error.message:"OANDA parity unavailable" }, {status:502}); }
}
