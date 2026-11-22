# GSAT progress log — 22 November 2026

This log records work performed after the immutable baseline checkpoint in `docs/GSAT_CHECKPOINT_2026-11-22.md`.

## Decisions
- Dukascopy is not selected for business use because its published download licence is described as personal/non-commercial. Do not import its data into GSAT's business research workflow unless written permission is obtained.
- Selected initial free route: MetalCharts API Free tier, XAG daily history. Provider documentation states commercial use is permitted on every plan, including Free, with visible attribution for public display. Free tier has 200 request-weight/month and 30 days of daily history; one history request costs 2 weight.
- No paid plan has been purchased.
- BiQuote remains the only source for production calculations.

## Implemented
- Created private `research` schema.
- Created `research.gsat_external_candles` for isolated external OHLC research data with source, symbol, timeframe, timestamp, USD/troy-ounce units, raw payload, idempotent primary key and OHLC validation.
- Created `research.gsat_external_ingestion_runs` for audit logging.
- Enabled RLS on both tables and added service-role-only policies/grants. No anon/authenticated access was granted.
- Added explicit metadata warning that provider-reported volume is not MCX or verified exchange-traded volume.
- Deployed Edge Function `gsat-import-metalcharts-research` version 1. It fetches XAG 1d candles only and writes only to the research schema; production BiQuote candles are not touched.
- Added the Edge Function source and migration files to this repository.
- Added setup documentation at `docs/FREE_HISTORICAL_SILVER_DATA_SETUP.md`.
- Ran Supabase security advisors after the table changes. The two new RLS-without-policy findings were cleared by adding service-role-only policies. Remaining warning is pre-existing `pg_net` extension in public schema.

## Not yet completed
- No MetalCharts candles have been imported. Research tables currently contain 0 candles and 0 import runs.
- User must create a free MetalCharts API key and set two Supabase Edge Function secrets:
  - `METALCHARTS_API_KEY`
  - `GSAT_RESEARCH_IMPORT_SECRET`
- After secrets are configured, invoke the importer once and verify returned row counts, timestamps, OHLC quality, and overlap against BiQuote daily XAG candles.
- Do not use this 30-day daily dataset to claim a reliable short-term predictive edge. Intraday history remains unavailable on the free plan.

## Production safety
- No edits to `public.gsat_market_candles`.
- No changes to BiQuote spot/OHLC source, existing indicators, timeframes, TradingView charts, theme, or dashboard layout.
- No automatic deployment to the public GSAT frontend was performed.
