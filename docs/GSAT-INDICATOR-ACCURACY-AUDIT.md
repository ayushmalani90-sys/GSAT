# GSAT Indicator Accuracy Audit

**Audit date:** 2026-11-14  
**Environment:** GSAT Vercel preview + isolated Supabase validation project  
**Production:** Not changed  
**Market-data source:** BiQuote only for calculations  
**TradingView/OANDA:** Existing charts remain visual-only

## Scope

- XAUUSD and XAGUSD
- 15m, 1H, 4H and 1D
- EMA 20/50/200, RSI 14, MACD 12/26/9 and ATR 14
- Candle validity, history depth and calculation parity
- Existing deterministic tests for support/resistance, Fibonacci, Volume Profile, patterns and confluence

## Results

### 1. Preview regression suite

The latest preview self-test endpoint returned HTTP 200 and passed 54 deterministic checks:
- Master OHLC normalization and malformed-candle guards: 7
- Core indicator regressions: 11
- Advanced indicator regressions: 10
- Independent BiQuote indicator golden vectors: 8
- Timeframe-aware history-readiness boundaries: 10
- Independent benchmark golden cases: 8

These are deterministic regression tests, not market-prediction accuracy tests.

### 2. Persisted candle quality

The validation database contained, per metal:
- 15m: 213 rows
- 1H: 173 rows
- 4H: 181 rows
- 1D: 499 rows

The inspected candle rows had zero null OHLC values, zero invalid OHLC ordering and zero non-positive prices.

Observed validation coverage:
- 15m: 2026-11-11 through 2026-11-13
- 1H: 2026-11-04 through 2026-11-13
- 4H: 2026-10-05 through 2026-11-13
- 1D: 2025-04-06 through 2026-11-12

These are actual observed dates, not the desired retention policy.

### 3. Persisted history is now the analysis input

The validation preview's `/api/analysis` route now reads the latest 1,000 completed BiQuote candles per metal/timeframe from the validation Supabase database. It no longer calculates preview indicators from a separate short-lived live history request when the validation database is configured. Live BiQuote remains the spot quote source.

At the latest validation snapshot, both metals had:

| Timeframe | Persisted bars | EMA200 | Recommended warm-up |
|---|---:|---|---|
| 15m | 213 | Calculable | Short: 213 / 1,000 |
| 1H | 173 | Unavailable (<200) | Short: 173 / 1,000 |
| 4H | 181 | Unavailable (<200) | Short: 181 / 1,000 |
| 1D | 499 | Calculable | Short: 499 / 500 |

The API reports the source, first and latest candle timestamps, latest ingestion timestamp, age, freshness and rejected-row count for each symbol/timeframe. The current snapshot had zero rejected rows. The market was closed when this test ran, so old candle age was reported as `market_closed`, not as a live-feed failure.

This is a real storage-to-analysis integration. It does not manufacture missing history: 1H and 4H EMA200 remain unavailable until at least 200 completed candles exist.

### 4. Independent calculation parity against persisted validation candles

The independent calculation audit now runs inside the preview API against the actual persisted BiQuote candle inputs.

Across the eight metal/timeframe combinations:
- Zero formula mismatches.
- 15m and 1D audits pass for all eight core metrics.
- 1H and 4H audits are marked incomplete only because EMA200 is unavailable below 200 bars.
- Maximum observed absolute difference is approximately 2.36e-11 for gold and 3.06e-13 for silver, well inside the 1e-8 tolerance.

This is strong evidence that the formula implementation and persisted candle calculations agree for the tested snapshot. It does not prove future feed integrity, full historical continuity, parity with another broker's different price feed, or profitable signals.

### 5. Live independent calculation audit

The analysis API now exposes `calculationAudit` for both metals and all four timeframes. It calculates a second set of EMA, RSI, MACD and ATR values with a separate implementation on the same normalized BiQuote candle input, then reports:
- actual and reference values;
- absolute differences;
- matched, mismatched and unavailable counts;
- maximum absolute difference;
- pass/incomplete/fail status.

The audit does not treat an indicator unavailable on both implementations as a formula mismatch. The history-readiness report separately flags the missing history.

## Accuracy interpretation

GSAT must not display a single "99.99% accuracy" claim. Use separate, measurable gates:

1. **Formula parity:** Same candle inputs and documented formula must produce the same values within numerical tolerance.
2. **Source integrity:** Completed candles must be valid, correctly timestamped, and free of unexplained gaps or duplicates.
3. **History readiness:** Show whether each indicator is unavailable, calculable, or below its recommended warm-up.
4. **External-site comparison:** Compare only after matching instrument, provider/feed, candle boundaries, timezone, price basis, closed-candle status and indicator settings. TradingView OANDA charts are not the calculation source and cannot be treated as exact BiQuote parity unless their underlying candle sets match.
5. **Signal performance:** Any claim about directional or trading accuracy requires a separate out-of-sample backtest with costs, slippage and no look-ahead bias.

## Warm-up policy added in this audit

The diagnostic distinguishes minimum mathematical requirements from conservative warm-up targets:

| Indicator | Minimum bars | Recommended warm-up |
|---|---:|---:|
| EMA20 | 20 | 100 |
| EMA50 | 50 | 250 |
| EMA200 (15m / 1H / 4H) | 200 | 1,000 |
| EMA200 (1D) | 200 | 500 |
| RSI14 | 15 closes | 100 |
| MACD 12/26/9 | 34 | 200 |
| ATR14 | 14 | 100 |

These recommendations are engineering guidance, not hard mathematical requirements or guarantees of prediction accuracy.

## BiQuote historical range probes

BiQuote's public OHLC documentation supports `from`/`to` date ranges and a maximum of 1,000 bars per response. Actual bounded-range probes for XAUUSD and XAGUSD returned:

| Requested UTC range | 15m | 1H | 4H | 1D |
|---|---:|---:|---:|---:|
| 2026-10-01 to 2026-10-08 | 0 | 0 | 15 per metal | 7 per metal |
| 2026-11-04 to 2026-11-08 | 0 | 54 per metal | — | — |
| 2026-09-01 to 2026-10-01 | — | — | 0 | — |
| 2025-01-01 to 2025-03-01 | — | — | — | 0 |

A zero-row historical response is now recorded as `historicalRangeEmpty: true` and `marketClosed: false`; an empty old range is not evidence that the market was closed. These probes did not insert external data into the BiQuote candle table.

The results do not support a claim that BiQuote can currently supply 1,000 historical candles for every required timeframe. The direct BiQuote history endpoint snapshot returned 192 × 15m, 168 × 1H, 180 × 4H and 499 × 1D per metal. The validation analysis route now uses the persisted database path instead; the 15m/1H/4H history gaps remain a provider/backfill limitation.

## Free external archive verified

EV Trading Labs publishes historical XAUUSD and XAGUSD files derived from Dukascopy tick data. Closed-year files through 2025 are downloadable without an account; the current-year 2026 files require a free account. The files contain bid and ask OHLC, volume and Unix UTC opening timestamps.

Successfully downloaded and decompressed all eight 2025 symbol/timeframe files in the Vercel preview:

| Metal | 15m rows | 1H rows | 4H rows | 1D rows |
|---|---:|---:|---:|---:|
| XAUUSD | 23,638 | 5,913 | 1,599 | 312 |
| XAGUSD | 23,638 | 5,913 | 1,599 | 312 |

The 2024 archive was also verified for all eight symbol/timeframe combinations: 23,733 M15, 5,938 H1, 1,606 H4 and 313 D1 rows per metal. The 2025 archive has 23,638 M15, 5,913 H1, 1,599 H4 and 312 D1 rows per metal. These are two calendar years of third-party archive availability, not two years of BiQuote-compatible candles.

The 2025 archive has enough bars for EMA200 on the intraday timeframes. Daily EMA200 is calculable with 312 bars, but a 1,000-bar daily warm-up requires roughly four years. Neither 2024 nor 2025 EV/Dukascopy data is inserted into GSAT's BiQuote series.

The data is Dukascopy-derived, not BiQuote. A preview-only `/api/validation/source-parity` endpoint compares exact common UTC candle timestamps and tests BiQuote against EV bid, ask and midpoint constructions. For 2025, only daily data overlaps the current BiQuote daily history; 2025 intraday files do not overlap BiQuote's 2026-only intraday history. Current-year EV files require a free account, so intraday source parity remains unverified.

Daily source comparison on the 231 exact common UTC timestamps from 2025-04-06 through 2025-12-31:

| Metric | XAUUSD | XAGUSD |
|---|---:|---:|
| Best matching EV price basis | Mid | Mid |
| Mean absolute close difference | $0.288 | $0.0217 |
| Maximum absolute close difference | $16.345 | $0.4595 |
| EMA20 absolute difference | $0.0197 | $0.00056 |
| EMA50 absolute difference | $0.0079 | $0.00666 |
| EMA200 absolute difference | $0.0950 | $0.01384 |
| RSI14 absolute difference | 0.050 | 0.054 |
| MACD line absolute difference | 0.075 | 0.0034 |
| ATR14 absolute difference | $0.271 | $0.129 |

The midpoint is the closest daily price construction for both metals. Indicator values are close on this aligned daily sample, but individual OHLC outliers are material: the largest gold close difference is $16.345 on 2025-06-20, and the largest silver close difference is $0.4595 on 2025-10-13. This is not a 99.99% feed-parity result and does not validate 15m, 1H or 4H. The large outliers must be reviewed before using this feed as a historical seed.

A direct serverless attempt using the Dukascopy Node downloader returned HTTP 202 from the upstream feed. That downloader route and dependency were removed; the verified EV archive files are now used for the separate QA comparison.

## Lowest-cost managed API alternative

MetalCharts documents a Starter plan at $9/month with one year of intraday history (15m through 8H), one year of daily history and 10,000 monthly request weight. Historical calls cost 2 weight. Its free tier is daily-only for 30 days, so it cannot provide the required intraday history without a paid plan. This is a separate feed from BiQuote and still requires a source-parity test.

## One-minute collection removed from validation

The validation collector was changed as follows:
- Supabase Cron now runs every 15 minutes under the job name `gsat-ingest-every-15-minutes`.
- Edge Function `gsat-ingest` is version 12 and only accepts 15m, 1H, 4H and 1D.
- The candle table constraint rejects 1m rows and the ingestion-run default timeframe list no longer includes 1m.
- Existing validation 1m candle rows were deleted.
- Health records `latest_closed_15m_candle_at`; the legacy 1m health column was dropped.
- A forced ingestion test across the four approved timeframes completed successfully: 8 feed calls, 42 raw bars, 34 completed candle updates, zero rejected bars, zero gaps and no collector health failures.

Validation candle rows after removal:
- 15m: 426 total (213 per metal)
- 1H: 346 total (173 per metal)
- 4H: 362 total (181 per metal)
- 1D: 998 total (499 per metal)
- 1m: 0

The validation candle table has a read-only RLS policy for `anon` and `authenticated` roles. Those roles cannot insert, update or delete candles. Health and ingestion-run tables explicitly deny public API-role access and retain no public grants.

The Vercel Supabase URL and publishable key are scoped only to preview deployments of `gsat-indicator-accuracy-audit`. The analysis route identifies whether it is using persisted history or the direct BiQuote fallback. Production collector, production database and production environment variables were not changed.

## Integration gate

Do not concatenate EV/Dukascopy history with BiQuote candles yet. The current-year EV files need free-account access to compare the same 2026 intraday timestamps. Once those files are available, compare OHLC on identical timestamps and price basis before deciding whether to:
1. Keep BiQuote and accept its current history limits while new candles accumulate.
2. Use EV/Dukascopy as the complete OHLC calculation source, keeping BiQuote live spot cards separate.
3. Use external data only as a labelled historical warm-up seed if measured overlap differences are small and the indicator values converge.

No external history has been inserted into the BiQuote candle table. Formula parity, source parity and signal performance remain separate. None of these changes supports a 99% or 99.99% prediction-accuracy claim.

## Not changed

- No production deployment, production database, production secrets or production environment variables were changed.
- No dashboard UI, TradingView widget, timeframe selector or BiQuote spot quote source was changed.
- No external provider data was mixed into GSAT calculations.
- The 1m collection removal described above applies only to the validation project; production remains untouched.
