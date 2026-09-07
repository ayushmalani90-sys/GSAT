import { NextResponse } from "next/server";
import { runIndicatorSelfTests } from "../../../../lib/technical-tests";
import { runMasterOhlcSelfTests } from "../../../../lib/market-data/master-ohlc-test";
import { runBiquoteIndicatorTests } from "../../../../lib/biquote-indicator-tests";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const masterOhlc = runMasterOhlcSelfTests();
    const indicators = runIndicatorSelfTests();
    const biquote = runBiquoteIndicatorTests();
    return NextResponse.json({ ok: true, masterOhlc, indicators, biquote }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "GSAT self-test failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
