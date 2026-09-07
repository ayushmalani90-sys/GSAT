export type MasterCandle = {
  symbol: "XAUUSD" | "XAGUSD";
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  volume?: number;
  tickVolume?: number;
};

export type AggregatedCandle = MasterCandle & { sourceInterval: "1m" | "15m" | "1h" | "4h" | "1d" };

const TIMEFRAME_MS: Record<"15m" | "1h" | "4h" | "1d", number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function normalizeMasterCandles(bars: Array<Record<string, unknown>>, symbol: MasterCandle["symbol"]): MasterCandle[] {
  return bars
    .map((bar) => ({
      symbol,
      t: String(bar.openTime ?? bar.t ?? ""),
      o: Number(bar.open ?? bar.o),
      h: Number(bar.high ?? bar.h),
      l: Number(bar.low ?? bar.l),
      c: Number(bar.close ?? bar.c),
      volume: finite(Number(bar.volume)) ? Number(bar.volume) : undefined,
      tickVolume: finite(Number(bar.tickVolume)) ? Number(bar.tickVolume) : undefined,
      isOpen: bar.isOpen === true,
    }))
    .filter((x) => x.isOpen !== true && Boolean(x.t) && [x.o, x.h, x.l, x.c].every(Number.isFinite))
    .map(({ isOpen: _isOpen, ...candle }) => candle)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

function bucketStart(timestamp: number, intervalMs: number): number {
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

export function aggregate1mCandles(candles: MasterCandle[], target: "15m" | "1h" | "4h" | "1d"): AggregatedCandle[] {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const intervalMs = TIMEFRAME_MS[target];
  const groups = new Map<number, MasterCandle[]>();

  for (const candle of sorted) {
    const ts = Date.parse(candle.t);
    if (!Number.isFinite(ts)) continue;
    const key = bucketStart(ts, intervalMs);
    const group = groups.get(key);
    if (group) group.push(candle);
    else groups.set(key, [candle]);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, group]) => {
      const first = group[0];
      const last = group[group.length - 1];
      const volumes = group.map((x) => x.volume).filter(finite);
      const tickVolumes = group.map((x) => x.tickVolume).filter(finite);
      return {
        symbol: first.symbol,
        t: new Date(key).toISOString(),
        o: first.o,
        h: Math.max(...group.map((x) => x.h)),
        l: Math.min(...group.map((x) => x.l)),
        c: last.c,
        volume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : undefined,
        tickVolume: tickVolumes.length ? tickVolumes.reduce((a, b) => a + b, 0) : undefined,
        sourceInterval: target,
      };
    });
}

export function validateMasterCandleSequence(candles: MasterCandle[]): { valid: boolean; duplicates: number; gaps: number; invalid: number } {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  let duplicates = 0;
  let gaps = 0;
  let invalid = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const ts = Date.parse(current.t);
    if (!Number.isFinite(ts) || !(current.h >= current.o && current.h >= current.c && current.h >= current.l) || !(current.l <= current.o && current.l <= current.c && current.l <= current.h)) invalid += 1;
    if (i === 0) continue;
    const previousTs = Date.parse(sorted[i - 1].t);
    const delta = ts - previousTs;
    if (delta === 0) duplicates += 1;
    else if (delta > 60 * 1000) gaps += 1;
  }
  return { valid: duplicates === 0 && invalid === 0, duplicates, gaps, invalid };
}

export function toTechnicalCandles(candles: MasterCandle[]): Array<{ t: string; o: number; h: number; l: number; c: number; volume?: number; tickVolume?: number }> {
  return candles.map(({ t, o, h, l, c, volume, tickVolume }) => ({ t, o, h, l, c, volume, tickVolume }));
}
