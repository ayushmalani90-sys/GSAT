import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type MetalSymbol = "XAG" | "XAU";
type HistoryBar = { timestamp?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function getSupabaseCredentials(): { url: string; key: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const legacyServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let modernSecret: string | undefined;
  if (secretKeysRaw) {
    try { modernSecret = (JSON.parse(secretKeysRaw) as Record<string, string>).default; }
    catch { /* Use the legacy server-side service role key. */ }
  }
  const key = modernSecret ?? legacyServiceRole;
  if (!url || !key) throw new Error("Supabase URL or server-side secret key is unavailable");
  return { url: url.replace(/\/$/, ""), key };
}
async function callSupabaseImport(credentials: { url: string; key: string }, body: Record<string, unknown>) {
  const headers: Record<string, string> = { apikey: credentials.key, "content-type": "application/json", accept: "application/json" };
  if (!credentials.key.startsWith("sb_secret_")) headers.authorization = "Bearer " + credentials.key;
  const response = await fetch(credentials.url + "/rest/v1/rpc/gsat_import_external_research_candles", {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error("Supabase research import RPC failed (" + response.status + "): " + responseText.slice(0, 500));
  return responseText ? JSON.parse(responseText) : null;
}

async function importMetal(symbol: MetalSymbol, apiKey: string, credentials: { url: string; key: string }) {
  const url = new URL("https://api.metalcharts.org/v1/history/" + symbol);
  url.searchParams.set("range", "1M");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("currency", "USD");
  url.searchParams.set("unit", "toz");
  const response = await fetch(url, {
    headers: { authorization: "Bearer " + apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("MetalCharts " + symbol + " HTTP " + response.status + ": " + (await response.text()).slice(0, 400));

  const payload = await response.json() as {
    success?: boolean; data?: HistoryBar[]; count?: number; startDate?: string; endDate?: string;
    currency?: string; unit?: string; source?: string; _rid?: string;
  };
  if (payload.success !== true || !Array.isArray(payload.data)) throw new Error("Unexpected MetalCharts " + symbol + " history response");

  const rows: Array<{
    candle_open: string; open_price: number; high_price: number; low_price: number;
    close_price: number; volume: number | null; raw_payload: HistoryBar;
  }> = [];
  let rejected = 0;
  for (const bar of payload.data) {
    const timestamp = typeof bar.timestamp === "string" ? Date.parse(bar.timestamp) : NaN;
    const open = finiteNumber(bar.open), high = finiteNumber(bar.high), low = finiteNumber(bar.low);
    const close = finiteNumber(bar.close), volume = finiteNumber(bar.volume);
    if (!Number.isFinite(timestamp) || open === null || high === null || low === null || close === null ||
        open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
        high < Math.max(open, close, low) || low > Math.min(open, close, high) ||
        (volume !== null && volume < 0)) { rejected += 1; continue; }
    rows.push({
      candle_open: new Date(timestamp).toISOString(),
      open_price: open, high_price: high, low_price: low, close_price: close,
      volume, raw_payload: bar,
    });
  }
  if (rows.length === 0) throw new Error("MetalCharts returned no valid " + symbol + " daily candles");

  const startMs = Math.min(...rows.map(row => Date.parse(row.candle_open)));
  const endMs = Math.max(...rows.map(row => Date.parse(row.candle_open)));
  const result = await callSupabaseImport(credentials, {
    p_symbol: symbol,
    p_rows: rows,
    p_fetched_count: payload.data.length,
    p_rejected_count: rejected,
    p_request_weight: 2,
    p_requested_start: new Date(startMs).toISOString(),
    p_requested_end: new Date(endMs).toISOString(),
  });
  return {
    success: true, symbol, timeframe: "1d",
    fetched: payload.data.length, valid: rows.length, rejected, import: result,
    providerSource: payload.source ?? null, providerRequestId: payload._rid ?? null,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const importSecret = Deno.env.get("GSAT_RESEARCH_IMPORT_SECRET");
  const suppliedSecret = request.headers.get("x-gsat-research-secret") ?? "";
  if (!importSecret) return json({ error: "GSAT_RESEARCH_IMPORT_SECRET is not configured" }, 503);
  if (!constantTimeEqual(suppliedSecret, importSecret)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("METALCHARTS_API_KEY");
  if (!apiKey) return json({ error: "METALCHARTS_API_KEY is not configured" }, 503);
  let credentials: { url: string; key: string };
  try { credentials = getSupabaseCredentials(); }
  catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 503); }

  const results: Array<Record<string, unknown>> = [];
  for (const symbol of ["XAG", "XAU"] as const) {
    try { results.push(await importMetal(symbol, apiKey, credentials)); }
    catch (error) { results.push({ success: false, symbol, error: error instanceof Error ? error.message : String(error) }); }
  }
  const successful = results.filter(result => result.success === true).length;
  const failed = results.length - successful;
  return json({
    success: failed === 0,
    partial: successful > 0 && failed > 0,
    source: "MetalCharts",
    timeframe: "1d",
    symbols: ["XAG", "XAU"],
    results,
    requestWeightUsed: successful * 2,
    productionCandlesTouched: false,
    attributionRequiredForPublicDisplay: true,
  }, successful === 0 ? 502 : failed > 0 ? 207 : 200);
});
