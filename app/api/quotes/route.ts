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

type XausResponse = {
  spot_usd_oz?: number | string;
  silver_usd_oz?: number | string;
  updated_at?: string;
  timestamp?: string;
  state?: {
    status?: string;
    as_of?: string;
    source?: string;
    age_seconds?: number;
  };
};

async function fetchXaus(): Promise<{ gold: Quote; silver: Quote; updatedAt: string; state?: XausResponse["state"] }> {
  const response = await fetch("https://xaus.com/api/v1/spot", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`XAUS spot feed unavailable (${response.status})`);

  const data = (await response.json()) as XausResponse;
  const gold = Number(data.spot_usd_oz);
  const silver = Number(data.silver_usd_oz);
  if (!Number.isFinite(gold) || !Number.isFinite(silver)) {
    throw new Error("XAUS returned invalid Gold/Silver spot prices");
  }

  const sourceTimestamp = data.updated_at ?? data.timestamp ?? data.state?.as_of ?? new Date().toISOString();
  const parsed = Date.parse(sourceTimestamp);
  const updatedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

  return {
    gold: { symbol: "XAU/USD", label: "Gold", price: gold, currency: "USD", changePercent: null, marketState: "OPEN", providerUpdatedAt: updatedAt, provider: "XAUS" },
    silver: { symbol: "XAG/USD", label: "Silver", price: silver, currency: "USD", changePercent: null, marketState: "OPEN", providerUpdatedAt: updatedAt, provider: "XAUS" },
    updatedAt,
    state: data.state,
  };
}

export async function GET() {
  try {
    const result = await fetchXaus();
    return NextResponse.json(
      {
        quotes: [result.gold, result.silver],
        updatedAt: new Date().toISOString(),
        spotSource: "XAUS",
        spotState: result.state ?? null,
        spotError: null,
        errors: [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gold/Silver unavailable";
    return NextResponse.json(
      { quotes: [], updatedAt: new Date().toISOString(), spotSource: "XAUS", spotState: null, spotError: message, errors: [message] },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
