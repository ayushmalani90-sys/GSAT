const OANDA_HOST = "https://api-fxpractice.oanda.com";

export type OandaCandle = {
  time: string;
  complete: boolean;
  volume: number;
  mid?: { o: string; h: string; l: string; c: string };
};

export type OandaGranularity = "M15" | "H1" | "H4" | "D";

const INSTRUMENTS = {
  XAUUSD: "XAU_USD",
  XAGUSD: "XAG_USD",
} as const;

const GRANULARITIES: Record<string, OandaGranularity> = {
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function fetchOandaCandles(symbol: keyof typeof INSTRUMENTS, timeframe: string, count = 2000): Promise<OandaCandle[]> {
  const granularity = GRANULARITIES[timeframe];
  if (!granularity) throw new Error(`Unsupported OANDA timeframe: ${timeframe}`);

  const token = requireEnv("OANDA_API_KEY");
  const instrument = INSTRUMENTS[symbol];
  const url = new URL(`/v3/instruments/${instrument}/candles`, OANDA_HOST);
  url.searchParams.set("granularity", granularity);
  url.searchParams.set("price", "M");
  url.searchParams.set("count", String(Math.min(Math.max(count, 200), 5000)));

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`OANDA ${instrument} candles unavailable (${response.status})`);

  const data = (await response.json()) as { candles?: OandaCandle[]; errorMessage?: string };
  if (!Array.isArray(data.candles)) throw new Error(data.errorMessage ?? `OANDA returned no ${instrument} candles`);
  return data.candles.filter((c) => c.complete && Boolean(c.mid));
}
