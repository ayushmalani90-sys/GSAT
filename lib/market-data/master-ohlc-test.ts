import { aggregate1mCandles, normalizeMasterCandles } from "./master-ohlc";

export function runMasterOhlcSelfTests() {
  const raw = [
    { openTime: "2026-01-01T00:00:00.000Z", open: 100, high: 101, low: 99, close: 100.5, tickVolume: 3, isOpen: false },
    { openTime: "2026-01-01T00:01:00.000Z", open: 100.5, high: 102, low: 100, close: 101.5, tickVolume: 4, isOpen: false },
    { openTime: "2026-01-01T00:02:00.000Z", open: 101.5, high: 103, low: 101, close: 102.5, tickVolume: 5, isOpen: false },
    { openTime: "2026-01-01T00:03:00.000Z", open: 102.5, high: 104, low: 102, close: 103.5, tickVolume: 6, isOpen: false },
    { openTime: "2026-01-01T00:04:00.000Z", open: 103.5, high: 105, low: 103, close: 104.5, tickVolume: 7, isOpen: false },
    { openTime: "2026-01-01T00:05:00.000Z", open: 104.5, high: 106, low: 104, close: 105.5, tickVolume: 8, isOpen: false },
    { openTime: "2026-01-01T00:06:00.000Z", open: 105.5, high: 107, low: 105, close: 106.5, tickVolume: 9, isOpen: false },
    { openTime: "2026-01-01T00:07:00.000Z", open: 106.5, high: 108, low: 106, close: 107.5, tickVolume: 10, isOpen: false },
    { openTime: "2026-01-01T00:08:00.000Z", open: 107.5, high: 109, low: 107, close: 108.5, tickVolume: 11, isOpen: false },
    { openTime: "2026-01-01T00:09:00.000Z", open: 108.5, high: 110, low: 108, close: 109.5, tickVolume: 12, isOpen: false },
    { openTime: "2026-01-01T00:10:00.000Z", open: 109.5, high: 111, low: 109, close: 110.5, tickVolume: 13, isOpen: false },
    { openTime: "2026-01-01T00:11:00.000Z", open: 110.5, high: 112, low: 110, close: 111.5, tickVolume: 14, isOpen: false },
    { openTime: "2026-01-01T00:12:00.000Z", open: 111.5, high: 113, low: 111, close: 112.5, tickVolume: 15, isOpen: false },
    { openTime: "2026-01-01T00:13:00.000Z", open: 112.5, high: 114, low: 112, close: 113.5, tickVolume: 16, isOpen: false },
    { openTime: "2026-01-01T00:14:00.000Z", open: 113.5, high: 115, low: 113, close: 114.5, tickVolume: 17, isOpen: false },
    { openTime: "2026-01-01T00:15:00.000Z", open: 114.5, high: 116, low: 114, close: 115.5, tickVolume: 18, isOpen: false },
  ];

  const candles = normalizeMasterCandles(raw, "XAUUSD");
  if (candles.length !== 16) throw new Error(`Expected 16 normalized candles, got ${candles.length}`);

  const aggregated = aggregate1mCandles(candles, "15m");
  if (aggregated.length !== 2) throw new Error(`Expected 2 aggregated candles, got ${aggregated.length}`);
  if (aggregated[0].o !== 100 || aggregated[0].h !== 115 || aggregated[0].l !== 99 || aggregated[0].c !== 114.5) {
    throw new Error("15m OHLC aggregation failed");
  }
  if (aggregated[0].tickVolume !== 153) throw new Error(`Expected tick volume 153, got ${aggregated[0].tickVolume}`);

  return { passed: true, cases: 4 };
}
