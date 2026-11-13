import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type SymbolCode = "XAUUSD" | "XAGUSD";
type Timeframe = "1m" | "15m" | "1h" | "4h" | "1d";

type BiQuoteBar = {
  openTime?: unknown;
  t?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
  tickVolume?: unknown;
  isOpen?: unknown;
};

type CandleRow = {
  symbol: SymbolCode;
  timeframe: Timeframe;
  candle_open: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number | null;
  tick_volume: number | null;
  source: "BiQuote";
  last_ingested_at: string;
};

type FeedResult = {
  symbol: SymbolCode;
  timeframe: Timeframe;
  rows: CandleRow[];
  rawBars: number;
  openBarsExcluded: number;
  rejectedBars: number;
  gapCount: number;
  marketClosed: boolean;
  error?: string;
};

const SYMBOLS: SymbolCode[] = ["XAUUSD", "XAGUSD"];
const INTERVAL_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
const OVERLAP_MS: Record<Timeframe, number> = {
  "1m": 10 * 60_000,
  "15m": 60 * 60_000,
  "1h": 3 * 60 * 60_000,
  "4h": 12 * 60 * 60_000,
  "1d": 3 * 86_400_000,
};
const BIQUOTE_BASE = "https://biquote.io/api";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function selectedTimeframes(now: Date): Timeframe[] {
  const result: Timeframe[] = ["1m"];
  const minuteOfEpoch = Math.floor(now.getTime() / 60_000);
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

  // A one-minute grace window tolerates a slightly late cron invocation.
  if (minuteOfEpoch % 15 <= 1) result.push("15m");
  if (minuteOfEpoch % 60 <= 1) result.push("1h");
  if (minuteOfDay % 240 <= 1) result.push("4h");
  if (minuteOfDay <= 1) result.push("1d");

  return result;
}

function normalizeBar(
  bar: BiQuoteBar,
  symbol: SymbolCode,
  timeframe: Timeframe,
  now: Date,
): { row?: CandleRow; reason?: string; open?: boolean } {
  if (bar.isOpen === true) return { open: true };
  if (bar.isOpen !== false) return { reason: "missing_isOpen_flag" };

  const rawTime = bar.openTime ?? bar.t;
  if (typeof rawTime !== "string") return { reason: "missing_openTime" };
  const timestamp = Date.parse(rawTime);
  if (!Number.isFinite(timestamp)) return { reason: "invalid_openTime" };

  const intervalMs = INTERVAL_MS[timeframe];
  if (timestamp % intervalMs !== 0) return { reason: "unaligned_candle_open" };
  if (timestamp + intervalMs > now.getTime()) return { reason: "candle_not_completed" };

  const open = finiteNumber(bar.open);
  const high = finiteNumber(bar.high);
  const low = finiteNumber(bar.low);
  const close = finiteNumber(bar.close);
  if (
    open === null || high === null || low === null || close === null ||
    open <= 0 || high <= 0 || low <= 0 || close <= 0
  ) return { reason: "invalid_ohlc_values" };

  if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
    return { reason: "invalid_ohlc_order" };
  }

  const volume = finiteNumber(bar.volume);
  const tickVolume = finiteNumber(bar.tickVolume);
  if ((volume !== null && volume < 0) || (tickVolume !== null && tickVolume < 0)) {
    return { reason: "negative_volume" };
  }

  return {
    row: {
      symbol,
      timeframe,
      candle_open: new Date(timestamp).toISOString(),
      open_price: open,
      high_price: high,
      low_price: low,
      close_price: close,
      volume,
      tick_volume: tickVolume === null ? null : Math.trunc(tickVolume),
      source: "BiQuote",
      last_ingested_at: now.toISOString(),
    },
  };
}

async function fetchJson(url: URL, attempts = 3, onRequest?: () => void): Promise<unknown> {
  let lastError = "unknown request error";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      onRequest?.();
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      if (response.ok) return await response.json();

      const body = await response.text();
      lastError = "HTTP " + response.status + ": " + body.slice(0, 300);

      if (response.status !== 429 && response.status < 500) {
        throw new Error(lastError);
      }

      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const waitMs = retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : 300 * (attempt + 1);
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt + 1 < attempts && !lastError.startsWith("HTTP 4")) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      } else {
        break;
      }
    }
  }

  throw new Error(lastError);
}

async function fetchFeed(
  symbol: SymbolCode,
  timeframe: Timeframe,
  now: Date,
  onRequest: () => void,
): Promise<FeedResult> {
  const url = new URL(BIQUOTE_BASE + "/" + symbol + "/ohlc");
  url.searchParams.set("interval", timeframe);
  url.searchParams.set("limit", "1000");
  url.searchParams.set("from", new Date(now.getTime() - OVERLAP_MS[timeframe]).toISOString());
  url.searchParams.set("to", now.toISOString());

  const payload = await fetchJson(url, 3, onRequest) as { bars?: BiQuoteBar[]; message?: string };
  if (!Array.isArray(payload.bars)) {
    throw new Error("BiQuote response did not contain a bars array: " + String(payload.message ?? "unknown response"));
  }
  if (payload.bars.length === 0) {
    const marketState = await getMarketState(symbol, onRequest);
    if (marketState === "closed") {
      return { symbol, timeframe, rows: [], rawBars: 0, openBarsExcluded: 0, rejectedBars: 0, gapCount: 0, marketClosed: true };
    }
    throw new Error("BiQuote returned no " + timeframe + " bars while market state is " + marketState);
  }

  const rows: CandleRow[] = [];
  let openBarsExcluded = 0;
  let rejectedBars = 0;

  for (const bar of payload.bars) {
    const normalized = normalizeBar(bar, symbol, timeframe, now);
    if (normalized.open) {
      openBarsExcluded += 1;
    } else if (normalized.row) {
      rows.push(normalized.row);
    } else {
      rejectedBars += 1;
    }
  }

  rows.sort((a, b) => Date.parse(a.candle_open) - Date.parse(b.candle_open));
  const unique = new Map<string, CandleRow>();
  for (const row of rows) unique.set(row.candle_open, row);
  const dedupedRows = [...unique.values()];

  let gapCount = 0;
  for (let i = 1; i < dedupedRows.length; i += 1) {
    const delta = Date.parse(dedupedRows[i].candle_open) - Date.parse(dedupedRows[i - 1].candle_open);
    if (delta > INTERVAL_MS[timeframe] && delta <= INTERVAL_MS[timeframe] * 5) {
      gapCount += Math.max(1, Math.round(delta / INTERVAL_MS[timeframe]) - 1);
    }
  }

  return {
    symbol,
    timeframe,
    rows: dedupedRows,
    rawBars: payload.bars.length,
    openBarsExcluded,
    rejectedBars,
    gapCount,
    marketClosed: false,
  };
}

function getSupabaseCredentials(): { url: string; key: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const legacyServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");

  let modernSecret: string | undefined;
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw) as Record<string, string>;
      modernSecret = parsed.default;
    } catch {
      // Fall back to the legacy service-role environment variable.
    }
  }

  const key = modernSecret ?? legacyServiceRole;
  if (!url || !key) throw new Error("Supabase URL or server-side secret key is unavailable");
  return { url: url.replace(/\/$/, ""), key };
}

async function restRequest(
  path: string,
  method: string,
  key: string,
  body?: unknown,
  prefer?: string,
): Promise<unknown> {
  const { url } = getSupabaseCredentials();
  const headers: Record<string, string> = {
    apikey: key,
    "content-type": "application/json",
  };
  // New Supabase secret keys are API keys, not JWTs; legacy service-role keys remain JWTs.
  if (!key.startsWith("sb_secret_")) headers.authorization = "Bearer " + key;
  if (prefer) headers.prefer = prefer;

  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error("Supabase " + method + " " + path + " failed (" + response.status + "): " + text.slice(0, 500));
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function getMarketState(symbol: SymbolCode, onRequest: () => void): Promise<string> {
  const url = new URL(BIQUOTE_BASE + "/" + symbol);
  url.searchParams.set("allowStale", "true");
  const tick = await fetchJson(url, 3, onRequest) as { marketState?: string };
  return String(tick.marketState ?? "unknown").toLowerCase();
}

async function updateRun(
  runId: number,
  key: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await restRequest(
    "gsat_market_data_ingestion_runs?id=eq." + runId,
    "PATCH",
    key,
    patch,
    "return=minimal",
  );
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const credentials = (() => {
    try {
      return getSupabaseCredentials();
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })();
  if ("error" in credentials) return json({ error: credentials.error }, 500);

  const providedCronSecret = request.headers.get("x-gsat-cron-secret") ?? "";
  if (!providedCronSecret) return json({ error: "Unauthorized" }, 401);

  let expectedCronSecret: unknown;
  try {
    expectedCronSecret = await restRequest(
      "rpc/gsat_get_ingestion_cron_secret",
      "POST",
      credentials.key,
      {},
    );
  } catch {
    return json({ error: "Ingestion authentication is not configured" }, 503);
  }

  if (
    typeof expectedCronSecret !== "string" ||
    !constantTimeEqual(providedCronSecret, expectedCronSecret)
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const timeframes = selectedTimeframes(now);
  const runStart = now.toISOString();
  let runId: number | null = null;
  let apiRequests = 0;
  const countRequest = () => { apiRequests += 1; };

  try {
    const runResult = await restRequest(
      "gsat_market_data_ingestion_runs",
      "POST",
      credentials.key,
      {
        started_at: runStart,
        status: "running",
        symbols: SYMBOLS,
        timeframes,
      },
      "return=representation",
    ) as Array<{ id: number }>;

    runId = runResult?.[0]?.id ?? null;
    if (!runId) throw new Error("Supabase did not return the ingestion run ID");

    const tasks = SYMBOLS.flatMap((symbol) =>
      timeframes.map((timeframe) => fetchFeed(symbol, timeframe, now, countRequest)),
    );

    const settled = await Promise.allSettled(tasks);
    const feeds: FeedResult[] = [];
    const errors: Array<{ symbol: SymbolCode; timeframe: Timeframe; error: string }> = [];

    for (let i = 0; i < settled.length; i += 1) {
      const item = settled[i];
      if (item.status === "fulfilled") {
        feeds.push(item.value);
      } else {
        const taskIndex = i;
        const symbol = SYMBOLS[Math.floor(taskIndex / timeframes.length)];
        const timeframe = timeframes[taskIndex % timeframes.length];
        errors.push({
          symbol,
          timeframe,
          error: item.reason instanceof Error ? item.reason.message : String(item.reason),
        });
      }
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let fetchedCount = 0;
    let rejectedCount = 0;
    let gapCount = 0;

    for (const feed of feeds) {
      fetchedCount += feed.rawBars;
      rejectedCount += feed.rejectedBars;
      gapCount += feed.gapCount;

      if (feed.rows.length === 0) continue;

      const upsertResult = await restRequest(
        "rpc/gsat_upsert_market_candles",
        "POST",
        credentials.key,
        { p_rows: feed.rows },
      ) as Array<{ inserted_count: number; updated_count: number }>;

      insertedCount += Number(upsertResult?.[0]?.inserted_count ?? 0);
      updatedCount += Number(upsertResult?.[0]?.updated_count ?? 0);
    }

    const failedFeeds = errors.length;
    const partial = failedFeeds > 0 || rejectedCount > 0;
    const allFailed = failedFeeds === SYMBOLS.length * timeframes.length;
    const status = allFailed ? "failed" : partial ? "partial" : "succeeded";
    const errorMessage = errors.length
      ? errors.map((x) => x.symbol + " " + x.timeframe + ": " + x.error).join(" | ").slice(0, 4_000)
      : null;

    const latestBySymbol = SYMBOLS.map((symbol) => {
      const latest = feeds
        .filter((feed) => feed.symbol === symbol && feed.timeframe === "1m")
        .flatMap((feed) => feed.rows.map((row) => row.candle_open))
        .sort()
        .at(-1);
      return latest ?? null;
    });
    const commonLatest1m = latestBySymbol.every(Boolean)
      ? latestBySymbol.map((value) => Date.parse(value!)).reduce((a, b) => Math.min(a, b))
      : null;

    await updateRun(runId, credentials.key, {
      finished_at: new Date().toISOString(),
      status,
      api_requests: apiRequests,
      fetched_count: fetchedCount,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      rejected_count: rejectedCount,
      gap_count: gapCount,
      details: {
        source: "BiQuote",
        intervalSelection: timeframes,
        feeds: feeds.map((feed) => ({
          symbol: feed.symbol,
          timeframe: feed.timeframe,
          rawBars: feed.rawBars,
          storedCandidates: feed.rows.length,
          openBarsExcluded: feed.openBarsExcluded,
          rejectedBars: feed.rejectedBars,
          gapCount: feed.gapCount,
          marketClosed: feed.marketClosed,
        })),
        errors,
      },
      error_message: errorMessage,
    });

    const healthRows = await restRequest(
      "gsat_market_data_health?select=consecutive_failures&id=eq.1",
      "GET",
      credentials.key,
    ) as Array<{ consecutive_failures: number }>;
    const previousFailures = Number(healthRows?.[0]?.consecutive_failures ?? 0);
    const healthPatch: Record<string, unknown> = {
      last_attempt_at: runStart,
      status: allFailed ? "offline" : partial ? "degraded" : "healthy",
      consecutive_failures: allFailed ? previousFailures + 1 : 0,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    };
    if (!allFailed) healthPatch.last_success_at = new Date().toISOString();
    if (commonLatest1m !== null) {
      healthPatch.latest_closed_1m_candle_at = new Date(commonLatest1m).toISOString();
    }

    await restRequest(
      "gsat_market_data_health?id=eq.1",
      "PATCH",
      credentials.key,
      healthPatch,
      "return=minimal",
    );

    return json({
      status,
      runId,
      symbols: SYMBOLS,
      timeframes,
      apiRequests,
      fetchedBars: fetchedCount,
      insertedCandles: insertedCount,
      updatedCandles: updatedCount,
      rejectedBars: rejectedCount,
      smallGaps: gapCount,
      latestClosed1mCandleAt: commonLatest1m === null ? null : new Date(commonLatest1m).toISOString(),
      errors,
    }, status === "failed" ? 502 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId !== null) {
      try {
        await updateRun(runId, credentials.key, {
          finished_at: new Date().toISOString(),
          status: "failed",
          error_message: message.slice(0, 4_000),
          details: { source: "BiQuote", fatalError: message },
        });
      } catch {
        // Keep the original failure as the function response.
      }
    }
    return json({ status: "failed", runId, error: message }, 502);
  }
});
