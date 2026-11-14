import { NextResponse } from "next/server";
import { runIndicatorSelfTests } from "../../../../lib/technical-tests";
import { runAdvancedIndicatorTests } from "../../../../lib/technical-advanced-tests";
import { runMasterOhlcSelfTests } from "../../../../lib/market-data/master-ohlc-test";
import { runBiquoteIndicatorTests } from "../../../../lib/biquote-indicator-tests";
import { runIndicatorQualityTests } from "../../../../lib/indicator-quality-tests";
import { runIndependentBenchmarkTests } from "../../../../lib/indicator-benchmark-tests";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const masterOhlc = runMasterOhlcSelfTests();
    const indicators = runIndicatorSelfTests();
    const advanced = runAdvancedIndicatorTests();
    const biquote = runBiquoteIndicatorTests();
    const historyQuality = runIndicatorQualityTests();
    const independentBenchmark = runIndependentBenchmarkTests();
    return NextResponse.json(
      { ok: true, masterOhlc, indicators, advanced, biquote, historyQuality, independentBenchmark },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "GSAT self-test failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
