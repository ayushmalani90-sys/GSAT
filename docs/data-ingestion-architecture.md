# GSAT persistent market-data architecture

**Status:** Validation-only implementation deployed and scheduled. Production remains untouched.  
**Database target:** Supabase Free (initial validation environment).  
**Retention target:** 2 years, subject to verified storage capacity and BiQuote historical availability.  
**Collection cadence:** 1-minute scheduler.  
**Market-data authority:** BiQuote only.  
**Chart display:** Existing TradingView OANDA widgets remain unchanged and display-only.

## 1. Non-negotiable boundaries

- BiQuote remains the only source of OHLC candles used by GSAT indicators.
- BiQuote remains the only source of live spot quotes.
- TradingView charts remain unchanged and are not read by the calculation engine.
- No OANDA or other provider data may be blended into GSAT calculations.
- No production environment variables, database connection, ingestion schedule, or analysis-route behavior is changed by this preparation.
- Store completed candles only. A BiQuote bar marked `isOpen: true` must be rejected from historical storage and indicator input.
- The unique key `(symbol, timeframe, candle_open)` makes retries idempotent. Re-fetching a candle may update that candle if BiQuote corrects its OHLC values.

## 2. Storage model

The migration creates three tables:

| Table | Purpose |
|---|---|
| `gsat_market_candles` | Completed native BiQuote OHLC bars for XAUUSD and XAGUSD at 1m, 15m, 1h, 4h and 1d |
| `gsat_market_data_ingestion_runs` | One record per scheduled run, with API counts, insert/update/reject counts, gaps and errors |
| `gsat_market_data_health` | Latest collector status and last successful completed 1m candle |

Server-only RPCs provide atomic candle upserts with insert/update counts, Vault-backed scheduler authentication, and separate retention cleanup for candle data and diagnostic runs.

Candles are stored as native BiQuote timeframes, not synthesized from another interval. This avoids silently changing candle boundaries or indicator inputs during the first migration. The primary key supports per-symbol/per-timeframe time-range queries; a BRIN index supports compact retention scans.

Prices use `double precision` to keep the candle table compact and align with the current JavaScript number-based indicator engine. The original source response should be retained in short-lived diagnostic logs only when needed; do not store full JSON payloads for every candle.

### Retention

The target is a rolling two years by `candle_open`. A daily retention job prunes candles older than two years. Ingestion-run diagnostics are retained for 7 days and pruned separately; keeping one run per minute for two years would create roughly 1.05 million log rows and waste the Free database quota. Retention jobs are active only in the validation project at this stage.

## 3. One-minute ingestion design

**Scheduler:** Supabase Cron, every minute, invoking the dedicated Supabase Edge Function `gsat-ingest`. The function uses a Vault-backed shared secret in addition to the project API key. The one-minute schedule is active in the validation project only. Do not use Vercel Hobby Cron for a one-minute schedule.

**Collector sequence:**

1. Start an ingestion-run record.
2. Fetch the latest completed BiQuote 1m bars for XAUUSD and XAGUSD using a bounded overlap window (initially 5–10 minutes).
3. Fetch native 15m, 1h, 4h and 1d bars only when a bar boundary has closed, and always allow a small overlap for late publication/correction.
4. Use BiQuote's documented `from` and `to` time-range parameters and respect its 1,000-bar maximum per response. Do not depend on undocumented cursor pagination.
5. Normalize timestamps to UTC; validate finite positive OHLC values and OHLC ordering; reject open/incomplete bars.
6. Upsert by `(symbol, timeframe, candle_open)`. Preserve `first_ingested_at`; refresh OHLC, volume fields and `last_ingested_at` on a source correction.
7. Check sequence continuity and expected candle boundaries. Record gaps and rejected rows; do not fabricate missing candles.
8. Update feed-health state and finish the run record.
9. A separate daily task prunes rows older than two years only after successful validation.

**Failure handling:** use bounded retries with backoff for transient HTTP failures; never mark a run successful if one symbol/timeframe silently failed. A partial result is recorded as `partial`. A subsequent run overlaps recent time ranges to repair delayed or missed bars.

**Secrets:** BiQuote's documented read-only endpoints do not require a key. Keep the Supabase service-role key only in the Edge Function secret store; never put it in browser code, Git, SQL migrations, or public Vercel variables.

## 4. Historical backfill

The schema can hold two years, but that does not prove BiQuote exposes two years of 1m history. Its documented OHLC endpoint caps each response at 1,000 bars and documents `from`/`to` range parameters; the backfill must therefore advance through explicit time windows, not assume cursor pagination.

Backfill procedure:

1. Probe each symbol/timeframe for the oldest available timestamp and response shape.
2. Estimate the number of pages and request rate before running a full backfill.
3. Backfill oldest-to-newest in bounded chunks, with a checkpoint per symbol/timeframe.
4. Validate duplicate count, malformed OHLC count, timestamp ordering, expected gaps, and continuity at chunk boundaries.
5. Re-fetch the most recent overlap window after the historical load to catch late corrections.
6. Report actual coverage dates. Never label a timeframe as having two years of history unless the stored data proves it.

If BiQuote cannot supply two years for a particular interval, keep the database retention policy at two years but disclose the shorter source-available history. Do not fill the gap from another provider.

**Observed BiQuote default-history snapshot (validation, 2026-11-13):** requests using the documented default-history form `/api/{symbol}/ohlc?interval=...&limit=1000` returned the following completed bars per symbol after excluding the current open bar: 1m 300 (oldest 2026-11-13 11:15 UTC), 15m 192 (2026-11-11 14:30 UTC), 1h 168 (2026-11-04 09:00 UTC), 4h 180 (2026-10-05 12:00 UTC), and 1d 499 (2025-04-06 00:00 UTC). These are observed source depths, not a guarantee of maximum historical coverage. A prior set of explicit `from`/`to` range probes returned empty arrays for older test windows; because the default native-timeframe requests do return history, those range-probe results must not be interpreted as proof that all older BiQuote history is absent. The validation collector now supports a one-time bootstrap using the provider's default latest-history response. Two years of 1m history are not currently available in the observed response; two years of 1d history are also not yet established.

## 5. Free-tier capacity gate

Two symbols × 1,051,200 minutes per two-year period = **2,102,400 potential 1m rows**, before adding the smaller native 15m/1h/4h/1d series, ingestion logs and indexes. Actual market closures reduce this count, but the free-tier database quota is still a constraint.

Before full backfill:
- Load a representative sample covering both symbols and all timeframes.
- Measure actual table plus index size with PostgreSQL relation-size functions.
- Extrapolate to the observed two-year row count.
- Keep at least 20% of the database quota free for indexes, updates, operational tables and growth.
- A server-side storage guard pauses ingestion at 400,000,000 database bytes (80% of the 500 MB Free quota). If the guard trips, stop and revisit storage/index design or the Supabase plan with the owner; do not silently shorten candle retention or drop the 1m series.

The collector should expose row counts, bytes used, oldest candle, newest candle and retention horizon. Supabase Free has no production-grade automatic backup guarantee; arrange and test manual exports before treating this database as the sole historical store.

## 6. Calculation cutover plan (not part of this change)

After ingestion is stable, the analysis route can be changed in a separate reviewed change:

- Read candles from Supabase for the requested symbol/timeframe.
- Continue to calculate EMA, RSI, MACD, ATR, support/resistance, Fibonacci, volume approximation, patterns and confluence in GSAT code.
- Preserve the current indicator definitions until each has passed independent tests.
- Keep live BiQuote spot quote separate from the last completed candle close, and expose both timestamps.
- Keep TradingView OANDA widgets untouched.

No calculation cutover occurs in this schema/architecture PR.

## 7. Validation gates before production

All gates must pass before merge to the production branch or production secrets/schedules are enabled:

1. **Schema:** migration applies cleanly to a disposable Supabase project; RLS blocks anon/authenticated access; service-role access works.
2. **Collector:** repeat runs are idempotent; overlapping windows update corrections without duplicate rows; one failed symbol produces a partial/failed run, not a false success.
3. **Source integrity:** every stored row has `source = BiQuote`; open candles are excluded; OHLC constraints pass.
4. **Coverage:** no fabricated bars; gaps are measured and explained; source availability is documented by symbol/timeframe.
5. **Native timeframe parity:** compare stored candles to fresh BiQuote responses for all five intervals, including timestamps and OHLC values.
6. **Storage:** measured two-year projection fits within 80% of the Supabase Free database quota.
7. **Indicator accuracy:** use independent, fixed golden test vectors and hand-calculated cases. Re-running the same implementation twice is not an accuracy test.
8. **Regression:** existing dashboard response shape, dark theme, timeframes (15m/1H/4H/1D), and TradingView widgets remain unchanged.
9. **Operational recovery:** simulate missed runs, API errors, delayed candles and a restart; confirm overlap backfill repairs data without duplicates.

## 8. Known analytical caveats to address in the later validation phase

- BiQuote tick volume is a tick count, not exchange-traded volume. The existing volume profile must remain explicitly labelled an approximation, not true exchange volume-at-price.
- ATR is volatility, not directional evidence. The validation branch now excludes ATR from directional confluence; ATR remains a separate volatility measure. A regression test verifies that changing only candle range does not change the directional score.
- EMA200 must be marked unavailable when sufficient validated history is missing; missing data must not be treated as bullish or bearish evidence.
- Live spot price and completed candle close are different measurements and must not be presented as if they are the same timestamp.

## 9. Activation checklist

- [x] Create a separate Supabase Free validation project in the Mumbai region.
- [x] Apply the schema and server-only RPC migrations to the validation project only.
- [x] Deploy the `gsat-ingest` Edge Function to the validation project.
- [x] Store the scheduler shared secret and publishable key in Supabase Vault; no secret is committed to Git.
- [x] Activate the one-minute Cron schedule in the validation project only.
- [x] Test live ingestion for both symbols and all five stored native timeframes.
- [x] Verify repeat runs upsert existing candles without duplicates.
- [x] Test the two-year candle retention and 7-day ingestion-log retention functions.
- [ ] Run a representative historical sample/backfill and measure actual storage growth.
- [ ] Run parity, continuity, idempotency and recovery tests.
- [ ] Obtain explicit approval before connecting production or changing the production analysis route.


## 10. Validation deployment record (2026-11-13)

The separate Supabase Free validation project is active in the Mumbai region. The migrations and collector are deployed there only; no production database, production secrets, Vercel environment variables, live analysis route, or TradingView UI have been changed.

The first live ingestion run stored 18 completed 1m candles from 20 returned BiQuote bars across XAUUSD and XAGUSD. The two open bars were excluded. A repeated run updated the same 18 rows and inserted zero duplicates. A forced all-timeframe validation run then ingested 1m, 15m, 1h, 4h and 1d data for both symbols with zero rejected bars and zero small gaps. A repeat run updated existing rows rather than duplicating them.

The one-minute validation Cron is active. Daily candle pruning and 7-day ingestion-log pruning are also scheduled in the validation project. This does not constitute production approval.

After the default-history bootstrap, the live table contains 2,722 unique candles. A separate temporary sizing test (not written to the real candle table) inserted 100,000 representative candle rows and 43,200 representative ingestion-run rows. It measured approximately 196.5 total bytes per candle row including heap and indexes, and approximately 791 bytes per diagnostic-run row. At the theoretical maximum of 2,287,820 candle rows across all five native intervals, candle storage alone projects to about 449.6 MB. Seven days of run logs project to about 8.0 MB; adding the current database baseline gives a worst-case continuous-minute estimate of roughly 469.5 MB, which exceeds the 400 MB headroom target. Real metal-market closures reduce that row count, but the active-session fraction has not yet been proven over a long sample. A server-side guard now pauses ingestion at 400 MB to protect the 500 MB Free quota. Current database size after bootstrap is approximately 12.6 MB.

A one-time default-history bootstrap fetched 2,688 bars across both symbols and five native timeframes (including 10 current open bars, which were excluded). It inserted 2,056 candles and updated 622 existing rows, with zero rejected bars. The resulting table contains 2,722 unique candles. A fresh source parity check compared the latest five completed bars for every symbol/timeframe pair (50 bars total): zero were missing and zero OHLC, volume or tick-volume fields mismatched. The observed source depths are 300 1m, 192 15m, 168 1h, 180 4h and 499 1d bars per symbol. The 499 daily bars span 2025-04-06 through 2026-11-12, still short of two full years; the 1m source history is only about five hours. Therefore the two-year retention policy is configured, but two years of source history is not available in the observed default response.


**Native-timeframe gap classification:** the 202 interval gaps counted during bootstrap are consistent with the observed precious-metals session schedule, not 202 missing bars: daily series have recurring 48–72 hour weekend gaps; hourly series have recurring two-hour daily session breaks; 15m series have corresponding 75-minute breaks. The current gap counter is intentionally conservative and records these intervals; schedule-aware classification remains a separate validation improvement.


**Incremental recovery test (validation, 2026-11-13):** one recent XAUUSD 1m candle was deliberately corrupted and one matching XAGUSD 1m candle was deleted in the validation database. The normal 1m collector was then invoked within its 12-minute overlap window. It corrected the XAUUSD row and reinserted the XAGUSD row. A fresh BiQuote request confirmed exact OHLC and tick-volume parity for both restored rows. No production data was touched.
