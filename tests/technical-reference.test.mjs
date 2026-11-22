import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/technical-reference.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const indicators = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("EMA uses an SMA seed and recursive smoothing", () => {
  assert.equal(indicators.ema([1, 2, 3, 4, 5], 3), 4);
  assert.equal(indicators.ema([1, 2], 3), null);
});

test("Wilder RMA uses an SMA seed and Wilder recursion", () => {
  assert.ok(Math.abs(indicators.rma([1, 2, 3, 4, 5], 3) - 3.444444444444444) < 1e-12);
  assert.equal(indicators.rma([1, 2], 3), null);
});

test("RSI handles rising, falling, flat and insufficient series", () => {
  assert.equal(indicators.rsi(Array.from({ length: 15 }, (_, i) => i + 1), 14), 100);
  assert.equal(indicators.rsi(Array.from({ length: 15 }, (_, i) => 15 - i), 14), 0);
  assert.equal(indicators.rsi(Array(15).fill(10), 14), 50);
  assert.equal(indicators.rsi(Array(14).fill(10), 14), null);
});

test("MACD returns zero line, signal and histogram for a flat market", () => {
  const result = indicators.macd(Array(50).fill(123.45), 12, 26, 9);
  assert.ok(Math.abs(result.line) < 1e-10);
  assert.ok(Math.abs(result.signal) < 1e-10);
  assert.ok(Math.abs(result.histogram) < 1e-10);
});

test("MACD uses 12/26 EMA line and 9-period EMA signal on a varying series", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.7 + Math.sin(i / 3) * 2);
  const result = indicators.macd(closes, 12, 26, 9);
  assert.ok(Math.abs(result.line - 4.944611967270987) < 1e-10);
  assert.ok(Math.abs(result.signal - 4.723933079722459) < 1e-10);
  assert.ok(Math.abs(result.histogram - 0.22067888754852838) < 1e-10);
});

test("ATR uses True Range and Wilder smoothing", () => {
  const candles = Array.from({ length: 15 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    o: 10, h: 11, l: 9, c: 10,
  }));
  assert.equal(indicators.atr(candles, 14), 2);
});

test("ATR includes prior-close gaps in True Range", () => {
  const candles = [
    { t: "2026-01-01T00:00:00.000Z", o: 10, h: 11, l: 9, c: 10 },
    { t: "2026-01-01T01:00:00.000Z", o: 13, h: 14, l: 12, c: 13 },
  ];
  assert.deepEqual(indicators.trueRanges(candles), [2, 4]);
});
