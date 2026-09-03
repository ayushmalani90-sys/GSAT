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

type XausMetals = {
  gold: Quote;
  silver: Quote;
  updatedAt: string;
  state?: {
    status?: "fresh" | "stale" | "unavailable";
    as_of?: string;
    source?: string;
    age_seconds?: number;
  };
};

type MetalsResult =
  | { metals: XausMetals }
  | { error: string };

type YahooResult =
  | { quote: Quote }
  | { error: string };

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

async function fetchXaus(): Promise<XausMetals> {
  const response = await fetch("https://xaus.com/api/v1/spot", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`XAUS spot feed unavailable (${response.status})`);
  const data = (await response.json()) as {
    spot_usd_oz?: number | string;
    silver_usd_oz?: number | string;
    updated_at?: string;
    timestamp?: string;
    state?: XausMetals["state"];
  };

  const gold = Number(data.spot_usd_oz);
  const silver = Number(data.silver_usd_oz);
  if (!Number.isFinite(gold) || !Number.isFinite(silver)) {
    throw new Error("XAUS returned invalid Gold/Silver spot prices");
  }

  const updatedAt = data.updated_at ?? data.timestamp ?? new Date().toISOString();
  const parsedUpdatedAt = Date.parse(updatedAt);
  const timestamp = Number.isFinite(parsedUpdatedAt) ? new Date(parsedUpdatedAt).toISOString() : new Date().toISOString();

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
    updatedAt: timestamp,
    state: data.state,
  };
}

export async function GET() {
  const [metalsResult, yahooResults] = await Promise.all([
    fetchXaus()
      .then((metals): MetalsResult => ({ metals }))
      .catch((error): MetalsResult => ({ error: error instanceof Error ? error.message : "Gold/Silver unavailable" })),
    Promise.all(
      YAHOO_SYMBOLS.map(([symbol, label]) =>
        fetchYahoo(symbol, label)
          .then((quote): YahooResult => ({ quote }))
          .catch((error): YahooResult => ({ error: error instanceof Error ? error.message : `${label} unavailable` })),
      ),
    ),
  ]);

  const quotes = [
    ...("metals" in metalsResult ? [metalsResult.metals.gold, metalsResult.metals.silver] : []),
    ...yahooResults.flatMap((item) => ("quote" in item ? [item.quote] : [])),
  ];
  const errors = [
    ...("error" in metalsResult ? [metalsResult.error] : []),
    ...yahooResults.flatMap((item) => ("error" in item ? [item.error] : [])),
  ];
  const metalsState = "metals" in metalsResult ? metalsResult.metals.state ?? null : null;
  const spotError = "error" in metalsResult ? metalsResult.error : null;

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      spotSource: "XAUS",
      macroSource: "Yahoo Finance",
      spotState: metalsState,
      spotError,
      errors,
    },
    { headers: { "Cache-Control": "s-maxage=55, stale-while-revalidate=5" } },
  );
}
