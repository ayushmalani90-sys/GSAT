import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getHistoricalRates } from "npm:dukascopy-node@1.51.1";

type SymbolCode = "XAG" | "XAU";
type Timeframe = "15m" | "1h" | "4h" | "1d";
type Candle = { timestamp?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown };
const TIMEFRAMES: Array<{ value: Timeframe; provider: "m15" | "h1" | "h4" | "d1"; ms: number }> = [
  { value: "15m", provider: "m15", ms: 15 * 60_000 },
  { value: "1h", provider: "h1", ms: 60 * 60_000 },
  { value: "4h", provider: "h4", ms: 4 * 60 * 60_000 },
  { value: "1d", provider: "d1", ms: 24 * 60 * 60_000 },
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function credentials(): { url: string; key: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let modern: string | undefined;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try { modern = (JSON.parse(raw) as Record<string, string>).default; } catch { /* use legacy key */ }
  }
  const key = modern ?? legacy;
  if (!url || !key) throw new Error("Supabase server credentials unavailable");
  return { url: url.replace(/\/$/, ""), key };
}
async function writeBatch(
  creds: { url: string; key: string }, symbol: SymbolCode, timeframe: Timeframe,
  rows: Array<Record<string, unknown>>, fetched: number, rejected: number,
) {
  const headers: Record<string, string> = { apikey: creds.key, "content-type": "application/json", accept: "application/json" };
  if (!creds.key.startsWith("sb_secret_")) headers.authorization = "Bearer " + creds.key;
  const starts = rows.map(r => Date.parse(String(r.candle_open)));
  const response = await fetch(creds.url + "/rest/v1/rpc/gsat_import_dukascopy_research_candles", {
    method: "POST", headers,
    body: JSON.stringify({
      p_symbol: symbol, p_timeframe: timeframe, p_rows: rows,
      p_fetched_count: fetched, p_rejected_count: rejected,
      p_requested_start: new Date(Math.min(...starts)).toISOString(),
      p_requested_end: new Date(Math.max(...starts)).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Research database write failed (" + response.status + "): " + body.slice(0, 400));
  return body ? JSON.parse(body) : null;
}
function closedCandleCutoff(timeframeMs: number, now: number): number {
  return Math.floor(now / timeframeMs) * timeframeMs;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }});
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  let body: { from?: string; to?: string; symbols?: string[] };
  try { body = await request.json(); } catch { return json({ error: "Expected JSON body" }, 400); }

  const to = body.to ? Date.parse(body.to) : Date.now();
  const from = body.from ? Date.parse(body.from) : to - 7 * 24 * 60 * 60_000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return json({ error: "Invalid from/to dates" }, 400);
  if (to - from > 31 * 24 * 60 * 60_000 + 60_000) return json({ error: "Research import is capped at 31 days per run" }, 400);
  const requestedSymbols = body.symbols ?? ["XAG", "XAU"];
  if (!Array.isArray(requestedSymbols) || requestedSymbols.some(s => s !== "XAG" && s !== "XAU")) {
    return json({ error: "symbols must contain only XAG and/or XAU" }, 400);
  }

  let creds: { url: string; key: string };
  try { creds = credentials(); } catch (error) { return json({ error: String(error) }, 503); }
  const results: Array<Record<string, unknown>> = [];
  const now = Date.now();

  for (const symbol of requestedSymbols as SymbolCode[]) {
    for (const tf of TIMEFRAMES) {
      try {
        const instrument = symbol === "XAU" ? "xauusd" : "xagusd";
        const candles = await getHistoricalRates({
          instrument,
          dates: { from: new Date(from), to: new Date(to) },
          timeframe: tf.provider,
          priceType: "bid",
          volumes: true,
          format: "json",
          batchSize: 10,
          pauseBetweenBatchesMs: 500,
          retryCount: 2,
          pauseBetweenRetriesMs: 500,
          failAfterRetryCount: true,
        }) as Candle[];

        const cutoff = closedCandleCutoff(tf.ms, Math.min(now, to));
        const valid: Array<Record<string, unknown>> = [];
        let rejected = 0;
        for (const candle of candles) {
          const ts = finite(candle.timestamp);
          const open = finite(candle.open), high = finite(candle.high), low = finite(candle.low);
          const close = finite(candle.close), volume = finite(candle.volume);
          if (ts === null || open === null || high === null || low === null || close === null ||
              ts < from || ts >= to || ts + tf.ms > cutoff ||
              open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
              high < Math.max(open, close, low) || low > Math.min(open, close, high) ||
              (volume !== null && volume < 0)) { rejected += 1; continue; }
          valid.push({
            candle_open: new Date(ts).toISOString(), open_price: open, high_price: high,
            low_price: low, close_price: close, volume,
            raw_payload: { provider: "Dukascopy", instrument, priceType: "bid", timestamp: ts, volumeSemantics: "tick_volume" },
          });
        }
        let inserted = 0, updated = 0, batches = 0;
        for (let i = 0; i < valid.length; i += 100) {
          const batch = valid.slice(i, i + 100);
          const result = await writeBatch(creds, symbol, tf.value, batch, batch.length, i === 0 ? rejected : 0);
          const first = Array.isArray(result) ? result[0] : result;
          inserted += Number(first?.inserted_count ?? 0);
          updated += Number(first?.updated_count ?? 0);
          batches += 1;
        }
        results.push({ success: true, symbol, instrument, timeframe: tf.value, fetched: candles.length,
          accepted: valid.length, rejected, inserted, updated, batches, source: "Dukascopy BID", volumeSemantics: "tick_volume" });
      } catch (error) {
        results.push({ success: false, symbol, timeframe: tf.value, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  const failed = results.filter(r => r.success !== true).length;
  return json({
    success: failed === 0, partial: failed > 0 && failed < results.length,
    provider: "Dukascopy", from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    symbols: requestedSymbols, timeframes: TIMEFRAMES.map(t => t.value),
    results, productionCandlesTouched: false,
    note: "Research-only BID candles. Volume is tick volume, not exchange-traded volume. Only completed candles are stored.",
  }, failed === results.length ? 502 : failed ? 207 : 200);
});
