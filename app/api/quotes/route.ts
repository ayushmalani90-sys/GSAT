import { NextResponse } from "next/server";

const SYMBOLS = [
  ["GC=F", "Gold"],
  ["SI=F", "Silver"],
  ["DX-Y.NYB", "DXY"],
  ["USDINR=X", "USD/INR"],
  ["BZ=F", "Brent"],
  ["^VIX", "VIX"],
] as const;

async function fetchQuote(symbol: string, label: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} unavailable`);
  const payload = await response.json();
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.chartPreviousClose);
  const previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
  if (!Number.isFinite(price)) throw new Error(`${label} invalid price`);
  return {
    symbol,
    label,
    price,
    changePercent: Number.isFinite(previous) && previous !== 0 ? ((price - previous) / previous) * 100 : null,
  };
}

export async function GET() {
  const results = await Promise.allSettled(SYMBOLS.map(([symbol, label]) => fetchQuote(symbol, label)));
  const quotes = results
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchQuote>>> => result.status === "fulfilled")
    .map((result) => result.value);

  return NextResponse.json(
    { quotes, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}
