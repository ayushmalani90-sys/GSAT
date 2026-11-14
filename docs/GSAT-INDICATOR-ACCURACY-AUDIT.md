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

The preview self-test endpoint returned HTTP 200. The existing suite passed 33 checks:
- Master OHLC normalization: 4
- Core indicator regressions: 11
- Advanced indicator regressions: 10
- Independent BiQuote indicator golden vectors: 8

These are deterministic regression tests. They are not market-prediction accuracy tests.

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

## Not changed

- No production deployment, production database, production secrets or production environment variables were changed.
- No dashboard UI, TradingView widget, timeframe selector or BiQuote source behavior was changed.
- The existing validation database still contains the legacy 1m rows and its collector configuration; the analysis calculations use native 15m/1H/4H/1D candles only. Removing 1m collection/storage is a separate validation change and is not silently claimed as completed here.
- No external provider data was mixed into GSAT calculations.
