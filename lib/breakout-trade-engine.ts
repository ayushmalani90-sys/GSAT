import { atr, macd, rsi } from "./technical-reference";

export type TradeCandle = {
  t: string; o: number; h: number; l: number; c: number;
  volume?: number; tickVolume?: number;
};
export type TradeSetup = {
  status: "CONFIRMED" | "WAIT_FOR_BREAKOUT" | "WAIT_FOR_MOMENTUM" | "EXTENDED_NO_CHASE" | "INSUFFICIENT_DATA" | "NO_VALID_RISK" | "STALE_DATA";
  direction: "LONG" | "SHORT" | "NONE";
  breakoutLevel: number | null;
  breakoutClose: number | null;
  momentum: { aligned: boolean; rsi: number | null; rsiPrevious: number | null; macd: number | null; histogram: number | null; histogramPrevious: number | null; tickVolumeRatio: number | null; note: string };
  entry: { type: "STOP" | "NONE"; price: number | null; instruction: string };
  stopLoss: number | null;
  targets: Array<{ label: string; price: number; rewardRisk: number }>;
  riskPerUnit: number | null;
  rewardRiskAtTarget1: number | null;
  exitRules: string[];
  rationale: string[];
  asOf: string | null;
  methodology: string;
};

const round = (v: number, d = 4) => Number(v.toFixed(d));
const empty = (status: TradeSetup["status"], note: string): TradeSetup => ({
  status, direction: "NONE", breakoutLevel: null, breakoutClose: null,
  momentum: { aligned: false, rsi: null, rsiPrevious: null, macd: null, histogram: null, histogramPrevious: null, tickVolumeRatio: null, note },
  entry: { type: "NONE", price: null, instruction: "No entry. Wait for a confirmed setup." },
  stopLoss: null, targets: [], riskPerUnit: null, rewardRiskAtTarget1: null,
  exitRules: ["Do not enter without a confirmed breakout and aligned momentum."],
  rationale: [note], asOf: null,
  methodology: "Completed BiQuote candles only. This is a rule-based setup, not a forecast or guaranteed signal.",
});

/**
 * Breakout uses the prior 20 completed bars as the range and the latest completed
 * bar as the confirmation bar. Tick count is a broker activity proxy, never
 * represented as centralized traded volume.
 */
export function buildTradeSetup(input: TradeCandle[], options: { lookback?: number; rewardRisk?: number; extensionAtr?: number; maxSignalAgeMs?: number } = {}): TradeSetup {
  const lookback = options.lookback ?? 20;
  const rr1 = options.rewardRisk ?? 2;
  const extensionAtr = options.extensionAtr ?? 1.25;
  const candles = [...input]
    .filter(c => [c.o, c.h, c.l, c.c].every(Number.isFinite) && Date.parse(c.t) > 0 && c.h >= Math.max(c.o, c.c, c.l) && c.l <= Math.min(c.o, c.c, c.h))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (candles.length < Math.max(lookback + 30, 60)) return empty("INSUFFICIENT_DATA", "At least 60 valid completed candles are required.");

  const last = candles[candles.length - 1];
  const prior = candles.slice(-(lookback + 1), -1);
  const priorHigh = Math.max(...prior.map(c => c.h));
  const priorLow = Math.min(...prior.map(c => c.l));
  const atrNow = atr(candles, 14);
  if (atrNow == null || !(atrNow > 0)) return empty("INSUFFICIENT_DATA", "ATR14 is unavailable; risk levels cannot be calculated safely.");

  const closes = candles.map(c => c.c);
  const rsiNow = rsi(closes, 14);
  const rsiPrev = rsi(closes.slice(0, -1), 14);
  const macdNow = macd(closes, 12, 26, 9);
  const macdPrev = macd(closes.slice(0, -1), 12, 26, 9);
  const tickSeries = candles.slice(-(lookback + 1), -1).map(c => c.tickVolume ?? c.volume).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const lastTick = last.tickVolume ?? last.volume;
  const tickRatio = lastTick != null && tickSeries.length >= Math.ceil(lookback * 0.8)
    ? lastTick / (tickSeries.reduce((a, b) => a + b, 0) / tickSeries.length)
    : null;

  const buffer = atrNow * 0.1;
  const longBreak = last.c > priorHigh + buffer;
  const shortBreak = last.c < priorLow - buffer;
  const longMomentum = rsiNow != null && rsiPrev != null && rsiNow >= 52 && rsiNow > rsiPrev &&
    macdNow.line != null && macdNow.histogram != null && macdPrev.histogram != null &&
    macdNow.line > 0 && macdNow.histogram > 0 && macdNow.histogram > macdPrev.histogram;
  const shortMomentum = rsiNow != null && rsiPrev != null && rsiNow <= 48 && rsiNow < rsiPrev &&
    macdNow.line != null && macdNow.histogram != null && macdPrev.histogram != null &&
    macdNow.line < 0 && macdNow.histogram < 0 && macdNow.histogram < macdPrev.histogram;

  const direction = longBreak ? "LONG" : shortBreak ? "SHORT" : "NONE";
  const breakout = direction !== "NONE";
  const aligned = direction === "LONG" ? longMomentum : direction === "SHORT" ? shortMomentum : longMomentum || shortMomentum;
  const breakoutLevel = direction === "LONG" ? priorHigh : direction === "SHORT" ? priorLow : null;
  const distance = breakoutLevel == null ? 0 : Math.abs(last.c - breakoutLevel);
  const extended = breakout && distance > atrNow * extensionAtr;
  const momentumNote = tickRatio == null
    ? "Momentum is evaluated with RSI and MACD; tick-activity confirmation is unavailable."
    : tickRatio >= 1.2
      ? "RSI/MACD momentum aligned; broker tick activity is above its recent average."
      : "RSI/MACD momentum evaluated; broker tick activity is not elevated (supporting evidence is weak).";

  const common = {
    momentum: { aligned, rsi: rsiNow, rsiPrevious: rsiPrev, macd: macdNow.line, histogram: macdNow.histogram, histogramPrevious: macdPrev.histogram, tickVolumeRatio: tickRatio, note: momentumNote },
    breakoutLevel: breakoutLevel == null ? null : round(breakoutLevel),
    breakoutClose: round(last.c),
    asOf: last.t,
    methodology: "20-bar prior range; breakout close must clear the range by 0.10 ATR; momentum requires RSI direction/threshold plus MACD zero-line and rising/falling histogram alignment. Tick volume is optional broker activity context. Entry is a stop trigger beyond the confirmation candle; targets are fixed R multiples. Not a probability or forecast.",
  };
  if (!breakout) return {
    ...empty("WAIT_FOR_BREAKOUT", aligned ? "Momentum is aligned, but price has not closed beyond the prior range." : "No confirmed range breakout. Wait; do not anticipate the move."),
    ...common,
    momentum: { ...common.momentum, note: momentumNote },
    rationale: ["No completed candle close beyond the prior 20-bar high/low plus the ATR buffer.", aligned ? "Momentum is aligned, but there is no breakout trigger." : "RSI/MACD do not currently meet the directional momentum rules."],
  };
  const maxSignalAgeMs = options.maxSignalAgeMs ?? Number.POSITIVE_INFINITY;
  const ageMs = Date.now() - Date.parse(last.t);
  if (Number.isFinite(maxSignalAgeMs) && ageMs > maxSignalAgeMs) {
    return {
      ...empty("STALE_DATA", "Latest completed candle is too old for a fresh trade setup."),
      ...common,
      direction,
      entry: { type: "NONE", price: null, instruction: "No entry. Wait for a fresh completed candle and a new confirmation." },
      rationale: ["Signal data is stale (" + Math.round(ageMs / 3_600_000) + " hours since the latest completed candle).", "Historical breakout conditions are not a current entry instruction."],
    };
  }
  if (!aligned) return {
    ...empty("WAIT_FOR_MOMENTUM", "Price broke the range, but RSI and MACD do not confirm direction."),
    ...common,
    momentum: { ...common.momentum, note: momentumNote },
    direction,
    rationale: ["Price closed beyond the prior 20-bar range.", "Momentum confirmation is absent; avoid chasing a price-only breakout."],
  };
  if (extended) return {
    ...empty("EXTENDED_NO_CHASE", "Breakout close is more than the allowed ATR extension from its range boundary."),
    ...common,
    momentum: { ...common.momentum, note: momentumNote },
    direction,
    rationale: ["Breakout and momentum conditions are present.", "Price has already travelled more than " + extensionAtr + " ATR beyond the breakout level; wait for a retest or a fresh base."],
  };

  const entry = direction === "LONG" ? last.h + buffer : last.l - buffer;
  const structuralStop = direction === "LONG" ? last.l - buffer : last.h + buffer;
  const atrStop = direction === "LONG" ? entry - 1.5 * atrNow : entry + 1.5 * atrNow;
  const stop = direction === "LONG" ? Math.min(structuralStop, atrStop) : Math.max(structuralStop, atrStop);
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !Number.isFinite(risk)) return { ...empty("NO_VALID_RISK", "Could not calculate a positive risk distance."), ...common, direction };
  const target = (multiple: number) => round(direction === "LONG" ? entry + risk * multiple : entry - risk * multiple);
  const stopRounded = round(stop);
  const entryRounded = round(entry);
  return {
    ...common,
    status: "CONFIRMED",
    direction,
    entry: { type: "STOP", price: entryRounded, instruction: direction === "LONG" ? "Buy-stop only if price trades at or above this trigger; cancel if the setup invalidates before entry." : "Sell-stop only if price trades at or below this trigger; cancel if the setup invalidates before entry." },
    stopLoss: stopRounded,
    targets: [{ label: "T1", price: target(rr1), rewardRisk: rr1 }, { label: "T2", price: target(3), rewardRisk: 3 }],
    riskPerUnit: round(risk),
    rewardRiskAtTarget1: rr1,
    exitRules: [
      "Initial stop-loss is mandatory; never widen it after entry.",
      "Exit at T1 or use a pre-defined partial exit; trail the remainder only after a completed candle confirms continuation.",
      "Exit early if a completed candle closes back inside the broken range (failed breakout).",
      "Cancel the pending entry if price reaches T1 before the entry trigger fills.",
    ],
    rationale: [
      (direction === "LONG" ? "Bullish" : "Bearish") + " close beyond the prior 20-bar range by at least 0.10 ATR.",
      "RSI and MACD zero-line/histogram momentum agree with the breakout.",
      tickRatio == null ? "Tick-activity confirmation unavailable; no volume claim is made." : "Latest broker tick activity is " + round(tickRatio, 2) + "× its recent average; this is not exchange volume.",
    ],
  };
}
