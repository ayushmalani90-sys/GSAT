import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

type HistoryBar = { timestamp?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown; };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const importSecret = Deno.env.get("GSAT_RESEARCH_IMPORT_SECRET");
  const suppliedSecret = request.headers.get("x-gsat-research-secret") ?? "";
  if (!importSecret) return json({ error: "GSAT_RESEARCH_IMPORT_SECRET is not configured" }, 503);
  if (!constantTimeEqual(suppliedSecret, importSecret)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("METALCHARTS_API_KEY");
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!apiKey || !databaseUrl) {
    return json({ error: "Configuration missing", requiredSecrets: [
      ...(!apiKey ? ["METALCHARTS_API_KEY"] : []),
      ...(!databaseUrl ? ["SUPABASE_DB_URL (provided by Supabase runtime)"] : []),
    ] }, 503);
  }

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 10, connect_timeout: 10, prepare: false });
  let runId: number | null = null;
  try {
    const [run] = await sql`
      insert into research.gsat_external_ingestion_runs
        (source, symbol, timeframe, requested_start, requested_end, status, request_weight)
      values ('MetalCharts', 'XAG', '1d', now() - interval '30 days', now(), 'running', 2)
      returning id
    `;
    runId = Number(run.id);

    const url = new URL("https://api.metalcharts.org/v1/history/XAG");
    url.searchParams.set("range", "1M");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("currency", "USD");
    url.searchParams.set("unit", "toz");
    const response = await fetch(url, {
      headers: { authorization: "Bearer " + apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error("MetalCharts HTTP " + response.status + ": " + (await response.text()).slice(0, 500));

    const payload = await response.json() as { success?: boolean; data?: HistoryBar[]; count?: number };
    if (payload.success !== true || !Array.isArray(payload.data)) throw new Error("Unexpected MetalCharts history response shape");

    const validRows: Array<{ candleOpen: string; open: number; high: number; low: number; close: number; volume: number | null; raw: HistoryBar }> = [];
    let rejected = 0;
    for (const bar of payload.data) {
      const timestamp = typeof bar.timestamp === "string" ? Date.parse(bar.timestamp) : NaN;
      const open = numberOrNull(bar.open), high = numberOrNull(bar.high), low = numberOrNull(bar.low);
      const close = numberOrNull(bar.close), volume = numberOrNull(bar.volume);
      if (!Number.isFinite(timestamp) || open === null || high === null || low === null || close === null ||
          open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
          high < Math.max(open, close, low) || low > Math.min(open, close, high) ||
          (volume !== null && volume < 0)) { rejected += 1; continue; }
      validRows.push({ candleOpen: new Date(timestamp).toISOString(), open, high, low, close, volume, raw: bar });
    }
    if (validRows.length === 0) throw new Error("No valid daily XAG candles returned");

    let inserted = 0, updated = 0;
    await sql.begin(async (tx) => {
      for (const bar of validRows) {
        const [saved] = await tx`
          insert into research.gsat_external_candles
            (source, symbol, timeframe, candle_open, open_price, high_price, low_price, close_price,
             volume, volume_semantics, currency, price_unit, raw_payload, retrieved_at)
          values ('MetalCharts', 'XAG', '1d', ${bar.candleOpen}::timestamptz, ${bar.open}, ${bar.high},
            ${bar.low}, ${bar.close}, ${bar.volume}, 'provider_reported_not_exchange_volume',
            'USD', 'troy_ounce', ${tx.json(bar.raw)}, now())
          on conflict (source, symbol, timeframe, candle_open) do update set
            open_price = excluded.open_price, high_price = excluded.high_price,
            low_price = excluded.low_price, close_price = excluded.close_price,
            volume = excluded.volume, volume_semantics = excluded.volume_semantics,
            currency = excluded.currency, price_unit = excluded.price_unit,
            raw_payload = excluded.raw_payload, retrieved_at = now()
          returning (xmax = 0) as inserted
        `;
        if (saved?.inserted) inserted += 1; else updated += 1;
      }
    });

    await sql`
      update research.gsat_external_ingestion_runs
      set finished_at = now(), status = 'succeeded', fetched_count = ${payload.data.length},
          inserted_count = ${inserted}, updated_count = ${updated}, rejected_count = ${rejected},
          details = ${sql.json({ providerCount: payload.count ?? payload.data.length, timeframe: "1d", currency: "USD", unit: "toz", attributionRequiredForPublicDisplay: true })}::jsonb
      where id = ${runId}
    `;
    return json({ success: true, source: "MetalCharts", symbol: "XAG", timeframe: "1d",
      fetched: payload.data.length, valid: validRows.length, inserted, updated, rejected,
      productionCandlesTouched: false, attributionRequiredForPublicDisplay: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId !== null) {
      try {
        await sql`update research.gsat_external_ingestion_runs
          set finished_at = now(), status = 'failed', error_message = ${message} where id = ${runId}`;
      } catch { /* Preserve the original import error. */ }
    }
    return json({ success: false, error: message, productionCandlesTouched: false }, 502);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
