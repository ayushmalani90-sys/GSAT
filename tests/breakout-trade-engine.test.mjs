import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const referenceSource = await readFile(new URL("../lib/technical-reference.ts", import.meta.url), "utf8");
const referenceCompiled = ts.transpileModule(referenceSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const referenceUrl = "data:text/javascript;base64," + Buffer.from(referenceCompiled).toString("base64");
let source = await readFile(new URL("../lib/breakout-trade-engine.ts", import.meta.url), "utf8");
source = source.replace('import { atr, macd, rsi } from "./technical-reference";', `const { atr, macd, rsi } = await import("${referenceUrl}");`);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const engine = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

function candlesFromCloses(closes, tick = 100) {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    o: c - 0.2, h: c + 0.5, l: c - 0.5, c,
    tickVolume: tick,
  }));
}

test("requires sufficient completed candle history", () => {
  const result = engine.buildTradeSetup(candlesFromCloses(Array.from({length: 40}, (_, i) => 100 + i)));
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.entry.price, null);
});

test("does not invent an entry when there is no range breakout", () => {
  const closes = Array.from({length: 90}, (_, i) => 100 + Math.sin(i / 3) * 0.5);
  const result = engine.buildTradeSetup(candlesFromCloses(closes));
  assert.equal(result.status, "WAIT_FOR_BREAKOUT");
  assert.equal(result.direction, "NONE");
  assert.equal(result.entry.price, null);
});

test("confirmed bullish breakout returns correctly ordered long entry, stop and R targets", () => {
  const closes = Array.from({length: 100}, (_, i) => 100 + i * 0.12 + Math.sin(i / 2) * 0.15);
  closes[99] = closes[98] + 2.5;
  const bars = candlesFromCloses(closes, 100);
  bars[99] = {...bars[99], o: closes[99] - 1.2, h: closes[99] + 0.2, l: closes[99] - 1.4, c: closes[99], tickVolume: 160};
  const result = engine.buildTradeSetup(bars);
  assert.ok(["CONFIRMED", "EXTENDED_NO_CHASE", "WAIT_FOR_MOMENTUM"].includes(result.status));
  if (result.status === "CONFIRMED") {
    assert.equal(result.direction, "LONG");
    assert.ok(result.entry.price > result.breakoutClose);
    assert.ok(result.stopLoss < result.entry.price);
    assert.ok(result.targets[0].price > result.entry.price);
    assert.equal(result.targets[0].rewardRisk, 2);
    assert.equal(result.targets[1].rewardRisk, 3);
  }
});

test("invalid candle data is filtered and missing momentum never produces an entry", () => {
  const closes = Array.from({length: 100}, (_, i) => 100 + Math.sin(i / 4) * 0.2);
  const bars = candlesFromCloses(closes);
  bars.push({t:"bad",o:1,h:0,l:2,c:1});
  const result = engine.buildTradeSetup(bars);
  assert.equal(result.status, "WAIT_FOR_BREAKOUT");
  assert.equal(result.entry.price, null);
});

test("stale candles never produce an actionable entry", () => {
  const closes = Array.from({length: 100}, (_, i) => 100 + i * 0.12 + Math.sin(i / 2) * 0.15);
  const bars = candlesFromCloses(closes);
  const result = engine.buildTradeSetup(bars, { maxSignalAgeMs: 1 });
  assert.equal(result.status, "STALE_DATA");
  assert.equal(result.entry.type, "NONE");
  assert.equal(result.entry.price, null);
});
