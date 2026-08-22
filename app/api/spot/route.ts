import { NextResponse } from "next/server";

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Spot feed failed: ${response.status}`);
  return response.json();
}

export async function GET() {
  const [gold, silver] = await Promise.all([
    fetchJson("https://www.investing.com/currencies/xau-usd-historical-data"),
    fetchJson("https://www.investing.com/currencies/xag-usd-historical-data"),
  ]);

  return NextResponse.json({ gold, silver, source: "Investing.com", updatedAt: new Date().toISOString() });
}
