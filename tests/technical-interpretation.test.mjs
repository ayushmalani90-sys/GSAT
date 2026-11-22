import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/technical-interpretation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const interpretation = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("EMA warm-up threshold keeps the SMA seed below 1% residual influence", () => {
  assert.equal(interpretation.emaWarmupSamples(200), 661);
  assert.equal(interpretation.hasEmaWarmup(660, 200), false);
  assert.equal(interpretation.hasEmaWarmup(661, 200), true);
  assert.equal(interpretation.hasEmaWarmup(212, 200), false);
  assert.equal(interpretation.hasEmaWarmup(288, 200), false);
  assert.equal(interpretation.hasEmaWarmup(673, 200), true);
});

test("MACD state distinguishes trend from signal-line momentum", () => {
  assert.match(interpretation.classifyMacdState(2, 1), /above zero and signal/);
  assert.match(interpretation.classifyMacdState(2, -1), /upside momentum easing/);
  assert.match(interpretation.classifyMacdState(-2, 1), /downside momentum easing/);
  assert.match(interpretation.classifyMacdState(-2, -1), /negative trend and momentum/);
  assert.equal(interpretation.classifyMacdState(null, 1), "MACD unavailable");
});

test("MACD confluence is neutral when zero-line trend and signal-line state disagree", () => {
  assert.equal(interpretation.scoreMacdState(2, 1), 100);
  assert.equal(interpretation.scoreMacdState(-2, -1), 0);
  assert.equal(interpretation.scoreMacdState(-2, 1), 50);
  assert.equal(interpretation.scoreMacdState(2, -1), 50);
  assert.equal(interpretation.scoreMacdState(null, 1), null);
});
