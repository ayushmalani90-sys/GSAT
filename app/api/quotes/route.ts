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
  provider: string;
};

type XausPayload = {
  spot_usd_oz?: number | string;
  silver_usd_oz?: number | string;
  updated_at?: string;
  timestamp?: string;
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
    provider: "Yahoo Finance",
  };
}

async function fetchXaus(): Promise<{ gold: Quote; silver: Quote }> {
  const response = await fetch("https://xaus.com/api/spot", { cache: "no-store" });
  if (!response.ok) throw new Error(`XAUS spot feed unavailable (${response.status})`);
  const data = (await response.json()) as XausPayload;
  const gold = Number(data.spot_usd_oz);
  const silver = Number(data.silver_usd_oz);
  if (!Number.isFinite(gold) || !Number.isFinite(silver)) throw new Error("XAUS returned invalid Gold/Silver spot prices");
  const updatedAt = data.updated_at ?? data.timestamp ?? new Date().toISOString();
  const timestamp = Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt).toISOString() : new Date().toISOString();
  return {
    gold: {
      symbol: "XAU/USD",
      label: "Gold",
      price: gold,
      currency: "USD",
      changePercent: null,
      marketState: "OPEN",
      providerUpdatedAt: timestamp,
      provider: "XAUS",
    },
    silver: {
      symbol: "XAG/USD",
      label: "Silver",
      price: silver,
      currency: "USD",
      changePercent: null,
      marketState: "OPEN",
      providerUpdatedAt: timestamp,
      provider: "XAUS",
    },
  };
}

export async function GET() {
  const [metalsResult, yahooResults] = await Promise.all([
    fetchXaus()
      .then((metals) => ({ metals }))
      .catch((error) => ({ error: error instanceof Error ? error.message : "Gold/Silver unavailable" })),
    Promise.all(
      YAHOO_SYMBOLS.map(([symbol, label]) =>
        fetchYahoo(symbol, label)
          .then((quote) => ({ quote }))
          .catch((error) => ({ error: error instanceof Error ? error.message : `${label} unavailable` })),
      ),
    ),
  ]);

  const quotes = [
    ...(metalsResult.metals ? [metalsResult.metals.gold, metalsResult.metals.silver] : []),
    ...yahooResults.flatMap((item) => ("quote" in item ? [item.quote] : [])),
  ];
  const errors = [
    ...(metalsResult.error ? [metalsResult.error] : []),
    ...yahooResults.flatMap((item) => ("error" in item ? [item.error] : [])),
  ];

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      spotSource: "XAUS",
      macroSource: "Yahoo Finance",
      spotError: metalsResult.error ?? null,
      errors,
    },
    { headers: { "Cache-Control": "s-maxage=55, stale-while-revalidate=5" } },
  );
}
