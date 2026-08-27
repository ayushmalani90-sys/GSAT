import { NextResponse } from "next/server";

const YAHOO_SYMBOLS = [
  ["DX-Y.NYB", "DXY"],
  ["USDINR=X", "USD/INR"],
  ["BZ=F", "Brent"],
  ["^VIX", "VIX"],
] as const;

type Quote = {
  symbol: string;
  label: string;
  price: number;
  currency: string;
  changePercent: number | null;
  marketState: string;
  providerUpdatedAt: string | null;
  source: string;
};

async function fetchYahoo(symbol: string, label: string): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
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
    currency: String(meta?.currency ?? "USD"),
    changePercent: Number.isFinite(previous) && previous !== 0 ? ((price - previous) / previous) * 100 : null,
    marketState: String(meta?.marketState ?? "UNKNOWN"),
    providerUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    source: "Yahoo Finance",
  };
}

async function fetchTwelveData(symbol: "XAU/USD" | "XAG/USD", label: string): Promise<Quote> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("Twelve Data API key is not configured");

  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1min");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data?.status === "error" || data?.code) {
    throw new Error(data?.message ?? `${label} unavailable`);
  }

  const price = Number(data?.close ?? data?.price);
  if (!Number.isFinite(price)) throw new Error(`${label} invalid price`);

  const timestamp = Number(data?.timestamp);
  return {
    symbol,
    label,
    price,
    currency: String(data?.currency ?? "USD"),
    changePercent: Number.isFinite(Number(data?.percent_change)) ? Number(data.percent_change) : null,
    marketState: String(data?.market_state ?? "UNKNOWN"),
    providerUpdatedAt: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null,
    source: "Twelve Data",
  };
}

export async function GET() {
  const [goldResult, silverResult, yahooResults] = await Promise.all([
    fetchTwelveData("XAU/USD", "Gold")
      .then((quote) => ({ quote }))
      .catch((error) => ({ error: error instanceof Error ? error.message : "Gold unavailable" })),
    fetchTwelveData("XAG/USD", "Silver")
      .then((quote) => ({ quote }))
      .catch((error) => ({ error: error instanceof Error ? error.message : "Silver unavailable" })),
    Promise.all(
      YAHOO_SYMBOLS.map(([symbol, label]) =>
        fetchYahoo(symbol, label)
          .then((quote) => ({ quote }))
          .catch((error) => ({ error: error instanceof Error ? error.message : `${label} unavailable` })),
      ),
    ),
  ]);

  const items = [goldResult, silverResult, ...yahooResults];
  const quotes = items.flatMap((item) => ("quote" in item ? [item.quote] : []));
  const errors = items.flatMap((item) => ("error" in item ? [item.error] : []));

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      sources: { metals: "Twelve Data", macro: "Yahoo Finance" },
      errors,
    },
    { headers: { "Cache-Control": "s-maxage=55, stale-while-revalidate=5" } },
  );
}
