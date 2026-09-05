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

type BiquoteTick = {
  symbol?: string;
  mid?: number;
  bid?: number;
  ask?: number;
  dayDiffPercent?: number;
  timestamp?: string;
  stale?: boolean;
  marketState?: string;
  quoteAgeSeconds?: number;
};

async function fetchBiquote(symbol: "XAUUSD" | "XAGUSD"): Promise<Quote> {
  const response = await fetch(`https://biquote.io/api/${symbol}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`BiQuote ${symbol} unavailable (${response.status})`);

  const data = (await response.json()) as BiquoteTick;
  const price = Number(data.mid);
  if (!Number.isFinite(price)) throw new Error(`BiQuote returned invalid ${symbol} spot price`);

  const parsedTimestamp = data.timestamp ? Date.parse(data.timestamp) : NaN;
  const providerUpdatedAt = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString() : null;

  return {
    symbol: symbol === "XAUUSD" ? "XAU/USD" : "XAG/USD",
    label: symbol === "XAUUSD" ? "Gold" : "Silver",
    price,
    currency: "USD",
    changePercent: Number.isFinite(Number(data.dayDiffPercent)) ? Number(data.dayDiffPercent) : null,
    marketState: data.marketState ?? (data.stale ? "STALE" : "OPEN"),
    providerUpdatedAt,
    provider: "BiQuote",
  };
}

export async function GET() {
  try {
    const [gold, silver] = await Promise.all([fetchBiquote("XAUUSD"), fetchBiquote("XAGUSD")]);
    return NextResponse.json(
      {
        quotes: [gold, silver],
        updatedAt: new Date().toISOString(),
        spotSource: "BiQuote",
        spotState: null,
        spotError: null,
        errors: [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gold/Silver unavailable";
    return NextResponse.json(
      { quotes: [], updatedAt: new Date().toISOString(), spotSource: "BiQuote", spotState: null, spotError: message, errors: [message] },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
