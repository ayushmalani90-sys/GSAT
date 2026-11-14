# GSAT Production Provisioning

This runbook keeps the production database separate from the validation database.

## Current state

- The only connected Supabase project is `GSAT-Validation` (`vzwzopepgmfjylxvnltl`).
- The connected Supabase organization is on the Free plan.
- The validation preview uses this project only through preview-scoped Vercel variables on branch `gsat-indicator-accuracy-audit`.
- Production Vercel currently has no GSAT Supabase history variables. Do not point production at the validation project.
- Production deployment and production database have not been changed by this audit.

A separate production Supabase project is required before the persisted-history path can be enabled on the production deployment.

## Database migrations

Apply the checked-in migrations in timestamp order:

1. `20261113160503_gsat_market_data_foundation.sql`
2. `20261113160702_gsat_candle_upsert_rpc.sql`
3. `20261113160917_gsat_cron_auth.sql`
4. `20261113161300_gsat_ingestion_log_retention.sql`
5. `20261113161830_gsat_storage_guard.sql`
6. `20261114133925_revoke_public_candle_prune_execute.sql`
7. `20261114142258_gsat_remove_one_minute_candles_and_track_15m.sql`
8. `20261114153712_gsat_readonly_candle_api_and_remove_legacy_1m_metadata.sql`
9. `20261114154003_rename_gsat_ingestion_cron_job_to_15_minutes.sql`
10. `20261114154025_explicitly_deny_public_access_to_gsat_operations_tables.sql`

The final schema stores only XAUUSD/XAGUSD BiQuote candles for 15m, 1h, 4h and 1d. The retention job deletes candles older than two years. Ingestion-run logs are retained for seven days.

## Supabase Edge Function configuration

Deploy `supabase/functions/gsat-ingest/index.ts` as the `gsat-ingest` Edge Function.

Configure these Edge Function secrets using the new production project's values:

- `SUPABASE_URL`: production project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: production service-role key, or `SUPABASE_SECRET_KEYS` containing JSON with a `default` secret key.

Never put a service-role or secret key in GitHub, browser code or Vercel environment variables.

## Supabase Vault values

The cron job and `gsat_get_ingestion_cron_secret()` function read these Vault secret names:

- `gsat_validation_project_url`: production project URL.
- `gsat_validation_publishable_key`: production publishable key.
- `gsat_validation_cron_secret`: a newly generated high-entropy secret.

The `validation` prefix is a legacy name from the validation project's first migration. In a separate production project, store the production values under these names; the names do not point to the validation project by themselves.

## Vercel production environment

Add only these two production environment variables:

- `GSAT_HISTORY_SUPABASE_URL`: production project URL.
- `GSAT_HISTORY_SUPABASE_PUBLISHABLE_KEY`: production publishable key.

The analysis API uses the publishable key with a read-only RLS policy on `gsat_market_candles`. It does not need a service-role key. Health and ingestion-run tables remain private.

Do not copy the validation project's URL or key into Vercel production.

## Go-live gates

Before switching production to the persisted-history path:

1. Confirm the Edge Function is deployed and cron authentication succeeds.
2. Confirm the active ingestion cron is `*/15 * * * *` and the two daily pruning jobs are active.
3. Confirm 1m candle rows are absent and the allowed timeframe constraint is 15m/1h/4h/1d only.
4. Confirm both metals are being ingested on all four timeframes.
5. Confirm no rejected OHLC rows, no unexpected gaps, and no consecutive collector failures.
6. Confirm `/api/validation/self-test` passes and the production API reports `supabase-persisted-biquote-candles`.
7. Confirm each timeframe reports its actual history count, freshness and EMA200 availability. Never fabricate missing history or mix EV/Dukascopy candles into BiQuote calculations.
8. Keep the production dashboard and TradingView widgets unchanged.

A correct formula result is not a claim of trading prediction accuracy. Signal performance requires a separate out-of-sample backtest with transaction costs and slippage.
