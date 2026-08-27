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
    currency: String(meta?.currency ?? "USD"),
    changePercent: Number.isFinite(previous) && previous !== 0 ? ((price - previous) / previous) * 100 : null,
    marketState: String(meta?.marketState ?? "UNKNOWN"),
    providerUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    source: "Yahoo Finance",
  };
}

async function fetchSpotMetals(): Promise<{ quotes: Quote[]; source: string; updatedAt: string | null }> {
  const response = await fetch("https://xaus.com/api/v1/spot?compact=1", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Spot metals unavailable");

  const data = await response.json();
  const gold = Number(data?.spot_usd_oz);
  const silver = Number(data?.silver_usd_oz);
  if (!Number.isFinite(gold) || !Number.isFinite(silver)) throw new Error("Spot metals invalid");

  const updatedAt = data?.updated_at ?? data?.data_state?.as_of ?? null;
  return {
    source: "XAUS Spot Metals",
    updatedAt,
    quotes: [
      {
        symbol: "XAU/USD",
        label: "Gold",
        price: gold,
        currency: "USD",
        changePercent: null,
        marketState: "SPOT",
        providerUpdatedAt: updatedAt,
        source: "XAUS Spot Metals",
      },
      {
        symbol: "XAG/USD",
        label: "Silver",
        price: silver,
        currency: "USD",
        changePercent: null,
        marketState: "SPOT",
        providerUpdatedAt: updatedAt,
        source: "XAUS Spot Metals",
      },
    ],
  };
}

function spotMarketStatus(updatedAt: string | null) {
  if (!updatedAt) return "UNKNOWN";
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ageMs)) return "UNKNOWN";
  return ageMs <= 10 * 60 * 1000 ? "OPEN" : "CLOSED";
}

export async function GET() {
  const [spotResult, yahooResults] = await Promise.all([
    fetchSpotMetals().catch((error) => ({
      error: error instanceof Error ? error.message : "Spot metals unavailable",
      quotes: [] as Quote[],
      source: "XAUS Spot Metals",
      updatedAt: null,
    })),
    Promise.allSettled(YAHOO_SYMBOLS.map(([symbol, label]) => fetchYahoo(symbol, label))),
  ]);

  const yahooQuotes = yahooResults
    .filter((result): result is PromiseFulfilledResult<Quote> => result.status === "fulfilled")
    .map((result) => result.value);

  const quotes = [...spotResult.quotes, ...yahooQuotes];
  const spotUpdatedAt = spotResult.updatedAt;

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      market: {
        spot: spotMarketStatus(spotUpdatedAt),
        spotUpdatedAt,
      },
      errors: "error" in spotResult ? { spot: spotResult.error } : {},
    },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}
