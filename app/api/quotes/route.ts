import { NextResponse } from "next/server";

const SYMBOLS = [
  ["GC=F", "Gold"],
  ["SI=F", "Silver"],
  ["DX-Y.NYB", "DXY"],
  ["USDINR=X", "USD/INR"],
  ["BZ=F", "Brent"],
  ["^VIX", "VIX"],
] as const;

function marketStatus(now = new Date()) {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  // First smoke-test version: treat the weekend as closed and regular weekdays
  // as session-aware. We keep the provider timestamp as the source of truth.
  const weekend = day === 0 || day === 6;
  return {
    status: weekend ? "CLOSED" : "OPEN",
    isWeekend: weekend,
    asOf: ist.toISOString(),
    minutes,
  } as const;
}

async function fetchQuote(symbol: string, label: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} unavailable`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.chartPreviousClose);
  const previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
  const currency = String(meta?.currency ?? "USD");
  if (!Number.isFinite(price)) throw new Error(`${label} invalid price`);
  return {
    symbol,
    label,
    price,
    currency,
    changePercent: Number.isFinite(previous) && previous !== 0 ? ((price - previous) / previous) * 100 : null,
    marketState: String(meta?.marketState ?? "UNKNOWN"),
    providerUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

export async function GET() {
  const [quotesResults, session] = await Promise.all([
    Promise.allSettled(SYMBOLS.map(([symbol, label]) => fetchQuote(symbol, label))),
    Promise.resolve(marketStatus()),
  ]);

  const quotes = quotesResults
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchQuote>>> => result.status === "fulfilled")
    .map((result) => result.value);

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      session,
      source: "Yahoo Finance public chart endpoint",
      note: "Gold/Silver currently use Yahoo futures symbols. Spot XAU/USD and XAG/USD require a separate provider in the next data-source pass.",
    },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}
