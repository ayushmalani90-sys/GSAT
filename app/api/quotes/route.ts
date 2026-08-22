import { NextResponse } from "next/server";

const SYMBOLS = [
  ["DX-Y.NYB", "DXY"],
  ["USDINR=X", "USD/INR"],
  ["BZ=F", "Brent"],
  ["^VIX", "VIX"],
] as const;

type YahooQuote = {
  symbol: string;
  label: string;
  price: number;
  currency: string;
  changePercent: number | null;
  marketState: string;
  providerUpdatedAt: string | null;
};

async function fetchYahoo(symbol: string, label: string): Promise<YahooQuote> {
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
  };
}

async function fetchSpotMetals() {
  const response = await fetch("https://xaus.com/api/v1/spot?compact=1", {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!response.ok) throw new Error("Spot metals unavailable");
  const data = await response.json();
  const gold = Number(data?.spot_usd_oz);
  const silver = Number(data?.silver_usd_oz);
  if (!Number.isFinite(gold) || !Number.isFinite(silver)) throw new Error("Spot metals invalid");

  return {
    quotes: [
      {
        symbol: "XAU/USD",
        label: "Gold",
        price: gold,
        currency: "USD",
        changePercent: null,
        marketState: "SPOT",
        providerUpdatedAt: data?.updated_at ?? data?.data_state?.as_of ?? null,
      },
      {
        symbol: "XAG/USD",
        label: "Silver",
        price: silver,
        currency: "USD",
        changePercent: null,
        marketState: "SPOT",
        providerUpdatedAt: data?.updated_at ?? data?.data_state?.as_of ?? null,
      },
    ] satisfies YahooQuote[],
    source: "XAUS spot API",
    dataState: data?.data_state ?? null,
  };
}

function marketSession(now = new Date()) {
  const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istString);
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const weekend = day === 0 || day === 6;
  return {
    status: weekend ? "CLOSED" : "OPEN",
    weekend,
    asOf: now.toISOString(),
    ist: ist.toISOString(),
    minutes,
  } as const;
}

export async function GET() {
  const [spotResult, yahooResults] = await Promise.all([
    fetchSpotMetals().catch((error) => ({ error: error instanceof Error ? error.message : "Spot metals unavailable" })),
    Promise.allSettled(SYMBOLS.map(([symbol, label]) => fetchYahoo(symbol, label))),
  ]);

  const yahooQuotes = yahooResults
    .filter((result): result is PromiseFulfilledResult<YahooQuote> => result.status === "fulfilled")
    .map((result) => result.value);

  const spotQuotes = "quotes" in spotResult ? spotResult.quotes : [];
  const quotes = [...spotQuotes, ...yahooQuotes];

  return NextResponse.json(
    {
      quotes,
      session: marketSession(),
      updatedAt: new Date().toISOString(),
      spotSource: "XAUS",
      macroSource: "Yahoo Finance public chart endpoint",
      spotState: "dataState" in spotResult ? spotResult.dataState : null,
      spotError: "error" in spotResult ? spotResult.error : null,
    },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}
