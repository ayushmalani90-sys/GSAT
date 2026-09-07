import type { TechnicalCandle } from "../technical-reference";

export const INDICATOR_HISTORY_TARGET = 1000;

export function closedCandles(candles: TechnicalCandle[]): TechnicalCandle[] {
  return [...candles]
    .filter((c) => Number.isFinite(Date.parse(c.t)))
    .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export type HistoryBudget = {
  requested: number;
  received: number;
  usable: number;
  enoughForEma200: boolean;
  enoughForMacd: boolean;
  enoughForRsi: boolean;
};

export function historyBudget(candles: TechnicalCandle[], requested = INDICATOR_HISTORY_TARGET): HistoryBudget {
  const usable = closedCandles(candles).length;
  return {
    requested,
    received: candles.length,
    usable,
    enoughForEma200: usable >= 200,
    enoughForMacd: usable >= 34,
    enoughForRsi: usable >= 15,
  };
}
