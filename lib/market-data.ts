export type MarketQuote = {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
  source: string;
};

// Free/public Yahoo Finance chart endpoint. This is intentionally isolated so
// the source can be replaced later without changing the War Room UI.
export async function getYahooQuote(symbol: string, label: string): Promise<MarketQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Market data request failed for ${symbol}`);

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.chartPreviousClose);
  const previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
  if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) {
    throw new Error(`Invalid market data for ${symbol}`);
  }

  return {
    symbol,
    label,
    price,
    changePercent: ((price - previous) / previous) * 100,
    source: "Yahoo Finance",
  };
}
