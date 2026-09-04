import { NextResponse } from "next/server";

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
  const result = await fetchXaus()
    .then((metals): MetalsResult => ({ metals }))
    .catch((error): MetalsResult => ({
      error: error instanceof Error ? error.message : "Gold/Silver unavailable",
    }));

  const quotes = "metals" in result ? [result.metals.gold, result.metals.silver] : [];
  const errors = "error" in result ? [result.error] : [];
  const metalsState = "metals" in result ? result.metals.state ?? null : null;
  const spotError = "error" in result ? result.error : null;

  return NextResponse.json(
    {
      quotes,
      updatedAt: new Date().toISOString(),
      spotSource: "XAUS",
      spotState: metalsState,
      spotError,
      errors,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
