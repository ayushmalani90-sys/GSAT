# GSAT persistent market-data architecture

**Status:** Design and schema preparation only. Not active in production.  
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

Candles are stored as native BiQuote timeframes, not synthesized from another interval. This avoids silently changing candle boundaries or indicator inputs during the first migration. The primary key supports per-symbol/per-timeframe time-range queries; a BRIN index supports compact retention scans.

Prices use `double precision` to keep the candle table compact and align with the current JavaScript number-based indicator engine. The original source response should be retained in short-lived diagnostic logs only when needed; do not store full JSON payloads for every candle.

### Retention

The target is a rolling two years by `candle_open`. The migration installs a pruning function but deliberately does not schedule it. A daily retention job is configured only after database validation. Retention must never run before the collector's backfill and gap-repair logic is proven.

## 3. One-minute ingestion design

**Scheduler:** Supabase Cron, every minute, invoking a dedicated Supabase Edge Function named `gsat-ingest`. Do not use Vercel Hobby Cron for a one-minute schedule.

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

## 5. Free-tier capacity gate

Two symbols × 1,051,200 minutes per two-year period = **2,102,400 potential 1m rows**, before adding the smaller native 15m/1h/4h/1d series, ingestion logs and indexes. Actual market closures reduce this count, but the free-tier database quota is still a constraint.

Before full backfill:
- Load a representative sample covering both symbols and all timeframes.
- Measure actual table plus index size with PostgreSQL relation-size functions.
- Extrapolate to the observed two-year row count.
- Keep at least 20% of the database quota free for indexes, updates, operational tables and growth.
- If the projection exceeds that headroom, stop. Do not silently shorten retention or drop the 1m series. Revisit the storage plan or retention decision with the owner first.

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
- ATR is volatility, not directional evidence. The confluence weighting should be reviewed separately before any accuracy claim.
- EMA200 must be marked unavailable when sufficient validated history is missing; missing data must not be treated as bullish or bearish evidence.
- Live spot price and completed candle close are different measurements and must not be presented as if they are the same timestamp.

## 9. Activation checklist

- [ ] Create a Supabase project in the intended region.
- [ ] Apply the migration to the validation project only.
- [ ] Store the service-role key in Edge Function secrets (not in Git).
- [ ] Deploy the collector to the validation project.
- [ ] Run sample backfill and measure storage.
- [ ] Run parity, continuity, idempotency and recovery tests.
- [ ] Obtain explicit approval before connecting production or changing the production analysis route.
