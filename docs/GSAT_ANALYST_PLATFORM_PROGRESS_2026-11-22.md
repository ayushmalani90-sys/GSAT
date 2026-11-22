# GSAT analyst platform — engineering progress, 22 November 2026

## New workstream
Branch: `gsat-analyst-platform`
Production branch remains `main`; no changes from this branch have been promoted to production.

## Findings from source audit
1. The production analysis route was fetching historical OHLC directly from BiQuote at request time instead of using the locally stored candle table. This bypassed the historical store and made Supabase persistence irrelevant to indicator calculations.
2. The main-branch copy of the ingestion source was stale and still contained 1m references. The deployed Supabase Edge Function v12 was already correct and only allowed 15m, 1h, 4h, 1d. The branch now synchronizes the source file with deployed v12.
3. The dashboard coupled spot quote refresh (30 seconds) and full multi-timeframe technical recomputation. This caused repeated history fetches and duplicate work. The branch separates spot refresh from analysis refresh.
4. Vercel production domain is `gsat-chi.vercel.app`; the latest production deployment was READY at the time of audit. Production environment did not have the two GSAT Supabase history variables; existing variables were scoped to a previous preview branch.
5. The production candle table has a public read-only SELECT policy for anon/authenticated. Operational tables remain denied. External research schema tables are service-role-only.

## Branch changes
- Sync `supabase/functions/gsat-ingest/index.ts` to deployed Supabase function v12 (four timeframes only).
- Update `app/api/analysis/route.ts` to calculate from stored BiQuote candles in Supabase; no direct OHLC fetch to BiQuote in the analysis endpoint.
- Return per-symbol/per-timeframe history counts, oldest/newest timestamps and rejected-row counts.
- Decouple quote refresh (30s) from analysis refresh (5m).
- Refactor MetalCharts importer to use Supabase built-in Edge Function server credentials plus restricted RPC; removes the incorrect assumption that `SUPABASE_DB_URL` is available in the Edge Function runtime.
- Add a restricted SECURITY DEFINER RPC for external research imports. Execution is granted only to service_role.
- Preserve production source policy: BiQuote spot and OHLC calculations, TradingView OANDA display-only, existing dashboard theme/layout, and 15m/1h/4h/1d.

## Additional verification
- The restricted import RPC passed a synthetic one-row OHLC smoke test (1 inserted, 0 updated, 0 rejected). The synthetic 1900-01-01 row and its audit record were deleted immediately after the test.
- Post-test verification confirmed 0 external research candles, 0 external import runs, and 0 non-BiQuote production candles.
- Preview-only Vercel environment variables for the Supabase project URL and public read-only key were added to branch `gsat-analyst-platform`; no production environment variables were changed.

## Not yet completed
- Preview build/runtime validation is pending.
- MetalCharts API key and import shared secret have not been supplied/configured. No external data rows have been imported.
- Stored-history analysis may return 502 if a symbol/timeframe has no valid stored rows; it intentionally does not silently fall back to a live unpersisted feed.
- Current database coverage remains limited, especially intraday; deeper backtesting needs a longer licensed dataset.
- No predictive model or signal should be called validated until walk-forward/out-of-sample backtests, fees/slippage, drawdowns, and baselines are documented.

## Acceptance gates before production promotion
- Preview build passes.
- Stored-candle endpoint returns correct BiQuote-only history for both metals and all four timeframes.
- EMA/RSI/MACD/ATR outputs are checked against independent calculations and selected reference points.
- Data freshness, gaps, duplicates, candle alignment and stale-feed detection are visible.
- MetalCharts import idempotency and data-source difference report pass.
- No UI redesign or production indicator-source change without approval.
