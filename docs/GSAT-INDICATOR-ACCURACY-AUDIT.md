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

The preview self-test endpoint returned HTTP 200. Before the history-readiness and independent-benchmark additions, the suite passed 33 checks:
- Master OHLC normalization: 4
- Core indicator regressions: 11
- Advanced indicator regressions: 10
- Independent BiQuote indicator golden vectors: 8

The new additions contribute another 16 deterministic checks: 8 history-readiness boundary cases and 8 independent-benchmark golden cases. The combined suite must pass 49 checks before this PR is considered ready. These are deterministic regression tests, not market-prediction accuracy tests.

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

### 3. Live BiQuote history returned by the preview API

At the audit snapshot, the live analysis endpoint returned these completed candle counts for both metals:

| Timeframe | Returned bars | EMA200 |
|---|---:|---|
| 15m | 192 | Unavailable |
| 1H | 168 | Unavailable |
| 4H | 180 | Unavailable |
| 1D | 499 | Available |

The first three timeframes cannot calculate EMA200 because they have fewer than 200 completed candles. Daily EMA200 is calculable, but 499 bars remain below the conservative 1,000-bar recommended warm-up target.

This is a source-history limitation, not an arithmetic failure. The API requests up to 1,000 bars and follows only explicit provider cursors; the provider returned shorter histories in this snapshot.

### 4. Independent calculation parity against persisted validation candles

An independent calculation implementation was run over the validation database's most recent candles, aligned to the sample counts returned by the live preview API (192, 168, 180 and 499 bars).

Across all eight metal/timeframe combinations:
- EMA20 and EMA50 matched the preview API exactly.
- EMA200 matched exactly where available (1D); it was unavailable on 15m, 1H and 4H in both calculations.
- RSI14 matched exactly.
- MACD line, signal and histogram matched exactly.
- ATR14 matched exactly.

**Maximum observed absolute difference: 0** for every available comparison in this snapshot.

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
| EMA200 | 200 | 1,000 |
| RSI14 | 15 closes | 100 |
| MACD 12/26/9 | 34 | 200 |
| ATR14 | 14 | 100 |

These recommendations are engineering guidance, not hard mathematical requirements or guarantees of prediction accuracy.

## BiQuote historical range probes

BiQuote's public OHLC documentation supports `from`/`to` date ranges and a maximum of 1,000 bars per response. However, actual bounded-range probes for XAUUSD and XAGUSD returned:

| Requested UTC range | 15m | 1H | 4H | 1D |
|---|---:|---:|---:|---:|
| 2026-10-01 to 2026-10-08 | 0 | 0 | 15 per metal | 7 per metal |
| 2026-11-04 to 2026-11-08 | 0 | 54 per metal | — | — |
| 2026-09-01 to 2026-10-01 | — | — | 0 | — |
| 2025-01-01 to 2025-03-01 | — | — | — | 0 |

A zero-row historical response is now recorded as `historicalRangeEmpty: true` and `marketClosed: false`; an empty old range is not evidence that the market was closed. The range probes were validation-only and did not mix external data into the BiQuote candle table.

The results do not support a claim that BiQuote can currently supply 1,000 historical candles for every required timeframe. The current direct preview counts remain 192 × 15m, 168 × 1H, 180 × 4H and 499 × 1D per metal.

## One-minute collection removed from validation

The validation collector was changed as follows:
- Supabase Cron schedule changed from every minute to every 15 minutes.
- Edge Function `gsat-ingest` is now version 12 and only accepts 15m, 1H, 4H and 1D.
- The validation candle table constraint now rejects 1m rows.
- Existing validation 1m candle rows were deleted.
- Health now records `latest_closed_15m_candle_at`; the legacy 1m timestamp was cleared.
- A forced ingestion test across the four approved timeframes completed successfully: 8 feed calls, 42 raw bars, 34 completed candle updates, zero rejected bars, zero gaps and no collector health failures.

Validation candle rows after removal:
- 15m: 426 total (213 per metal)
- 1H: 346 total (173 per metal)
- 4H: 362 total (181 per metal)
- 1D: 998 total (499 per metal)
- 1m: 0

This change is isolated to the validation Supabase project. Production collector and production database were not changed.

## External historical source candidates

### Free candidate: Dukascopy

The public Dukascopy historical feed, accessed through the open-source `dukascopy-node` downloader, lists XAUUSD and XAGUSD data back to 1999, including 15m, 1H, 4H and daily candles. It is a different broker feed and its default candle price side is bid, whereas GSAT's BiQuote series has its own feed and price construction. It is suitable for a separately stored reference/seed dataset, not for silent concatenation with BiQuote candles.

### Low-cost managed API: MetalCharts

MetalCharts documents a Starter plan at $9/month with one year of intraday history (15m through 8H) and long daily history for metals. Its free tier is daily-only and limited to 30 days. It is easier to integrate as a REST API but remains a separate source from BiQuote.

### Integration gate

Do not mix Dukascopy or MetalCharts history into the BiQuote indicator series yet. First compare overlapping 15m, 1H, 4H and 1D bars using identical UTC candle boundaries and bid/ask/mid basis. Only after quantifying OHLC differences should we choose one of these paths:
1. Keep BiQuote for all calculations and accept that EMA200 is unavailable on 15m, 1H and 4H until enough BiQuote bars accumulate.
2. Use an external feed for the entire OHLC calculation series, while keeping the source clearly labelled and preserving BiQuote live spot cards only if the price-basis mismatch is acceptable.
3. Use external history only as an indicator warm-up seed, explicitly labelled as mixed-source and validated for convergence against the subsequent BiQuote-only series.

None of these paths creates a 99% or 99.99% prediction-accuracy guarantee. Formula parity, source parity and trading-signal performance remain separate tests.

## Not changed

- No production deployment, production database, production secrets or production environment variables were changed.
- No dashboard UI, TradingView widget, timeframe selector or BiQuote spot quote source was changed.
- No external provider data was mixed into GSAT calculations.
- The 1m collection removal described above applies only to the validation project; production remains untouched.
