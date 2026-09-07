export type BiquoteHistoryBar = Record<string, unknown>;

export type BiquoteHistoryDiagnostics = {
  requestedLimit: number;
  pagesRequested: number;
  pagesSucceeded: number;
  rawBars: number;
  normalizedBars: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  duplicatesRemoved: number;
  paginationMode: "provider-cursor" | "single-page-or-provider-limited";
};

export type BiquoteHistoryResult<T> = {
  bars: T[];
  diagnostics: BiquoteHistoryDiagnostics;
};

function asBars(data: unknown): BiquoteHistoryBar[] {
  if (!data || typeof data !== "object") return [];
  const candidate = data as { bars?: unknown; data?: unknown; candles?: unknown };
  for (const value of [candidate.bars, candidate.data, candidate.candles]) {
    if (Array.isArray(value)) return value.filter((x): x is BiquoteHistoryBar => !!x && typeof x === "object");
  }
  return [];
}

function nextCursor(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  for (const key of ["nextCursor", "next_cursor"]) {
    const value = candidate[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export async function fetchBiquoteHistory<T extends BiquoteHistoryBar>(
  symbol: string,
  interval: string,
  requestedLimit: number,
  normalize: (bars: BiquoteHistoryBar[]) => T[],
): Promise<BiquoteHistoryResult<T>> {
  const target = Math.max(1, requestedLimit);
  const all: BiquoteHistoryBar[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesRequested = 0;
  let pagesSucceeded = 0;
  let paginationMode: BiquoteHistoryDiagnostics["paginationMode"] = "single-page-or-provider-limited";

  for (let page = 0; page < 20 && all.length < target; page += 1) {
    const url = new URL(`https://biquote.io/api/${symbol}/ohlc`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(2000, target - all.length)));
    if (cursor) url.searchParams.set("cursor", cursor);
    pagesRequested += 1;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (pagesSucceeded > 0) break;
      throw new Error(`BiQuote ${symbol} ${interval} history unavailable (${response.status})`);
    }
    const data = await response.json();
    pagesSucceeded += 1;
    const bars = asBars(data);
    if (!bars.length) break;
    all.push(...bars);
    const next = nextCursor(data);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
    paginationMode = "provider-cursor";
  }

  const normalized = normalize(all);
  return {
    bars: normalized,
    diagnostics: {
      requestedLimit: target,
      pagesRequested,
      pagesSucceeded,
      rawBars: all.length,
      normalizedBars: normalized.length,
      firstTimestamp: normalized.length ? String(normalized[0].t) : null,
      lastTimestamp: normalized.length ? String(normalized.at(-1)!.t) : null,
      duplicatesRemoved: Math.max(0, all.length - normalized.length),
      paginationMode,
    },
  };
}
