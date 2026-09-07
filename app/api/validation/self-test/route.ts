import { NextResponse } from "next/server";
import { runIndicatorSelfTests } from "../../../../lib/technical-tests";
import { runMasterOhlcSelfTests } from "../../../../lib/market-data/master-ohlc-test";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      masterOhlc: runMasterOhlcSelfTests(),
      indicators: runIndicatorSelfTests(),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "GSAT self-test failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
