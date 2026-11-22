# GSAT Dukascopy Historical Backfill — 2026-11-22

## Status

- Independent historical research backfill completed for XAU/USD and XAG/USD.
- Date window: 2024-11-22 00:00 UTC through 2026-11-22 00:00 UTC (end exclusive).
- Provider: Dukascopy via `dukascopy-node@1.51.1`.
- Candle side: BID.
- Timeframes: 15m, 1h, 4h, 1d only.
- Storage: private `research.gsat_external_candles` schema, separate from production.
- Supabase Edge Function: `gsat-import-dukascopy-research`, version 6, JWT verification enabled.
- Importer maximum range: 31 days per invocation.
- Production BiQuote table was not modified.

## Stored coverage

| Symbol | 15m | 1h | 4h | 1d | Total |
|---|---:|---:|---:|---:|---:|
| XAG | 47,171 | 11,800 | 3,191 | 623 | 62,785 |
| XAU | 47,174 | 11,800 | 3,191 | 623 | 62,788 |
| Total | 94,345 | 23,600 | 6,382 | 1,246 | 125,573 |

The coverage query returned 125,573 unique rows, matching the insert count. The 1,222 upserts are repeat writes caused by intentional overlap between the initial smoke test and the full backfill.

All rows passed OHLC validation (0 invalid rows). The provider volume field is stored and explicitly labelled `dukascopy_tick_volume`; it is NOT exchange-traded volume.

## Import audit

- 1,404 batch-level ingestion-run records.
- 126,795 candle rows fetched across overlapping chunks.
- 125,573 inserts and 1,222 upserts reported by the RPC.
- 0 rejected rows.
- Upserts are expected because the first seven-day smoke test overlapped with the later full backfill.

The high run count is because the database RPC logs each 100-row write batch as a separate run, not because 1,404 separate provider downloads occurred.

## Timestamp continuity review

The two-year series shows recurring session closures rather than random missing-data patterns:

- 15m: 46,656 consecutive 15-minute intervals for silver; 393 recurring 1h15m breaks, 93 weekend-sized gaps around 2d1h15m, and 2 closures longer than 3 days.
- 1h: 11,285 consecutive hourly intervals; 395 recurring 2-hour session breaks, 93 weekend-sized gaps around 2d2h, and 2 closures longer than 3 days.
- 4h: 3,082 consecutive 4-hour intervals; 97 weekend-sized 2-day gaps, plus a small number of holiday/session variations.
- 1d: 518 consecutive daily intervals, 102 two-day gaps and 2 three-day gaps. The provider's daily series contains six trading days per week (Sunday through Friday in UTC); Saturday is the regular closed day.

Gold follows the same session pattern. These are not automatically data defects. A backtest must respect the market calendar and must not forward-fill closed sessions as if they were tradable candles.

## BiQuote overlap validation

Daily comparison matched 505 timestamps per metal from 2025-04-06 through 2026-11-19.

| Symbol | Mean absolute close difference | Median | Maximum | Mean worst OHLC difference |
|---|---:|---:|---:|---:|
| XAGUSD | 0.06222% | 0.02865% | 1.25130% | 0.22591% |
| XAUUSD | 0.01493% | 0.00793% | 0.46878% | 0.08798% |

Outliers include XAGUSD on 2025-10-10 (1.2513% close difference) and XAUUSD on 2025-06-20 (0.4688%). This indicates meaningful provider/session differences. Do not merge Dukascopy candles into the BiQuote production indicator stream. Further session alignment and outlier analysis are required before research backtests are trusted.

Recent seven-day intraday overlap (459 matched 15m candles, 114 matched 1h candles, and 30 matched 4h candles per metal):

| Symbol | Timeframe | Mean absolute close difference | Median | Maximum |
|---|---|---:|---:|---:|
| XAGUSD | 15m | 0.04582% | 0.04626% | 0.12351% |
| XAGUSD | 1h | 0.04672% | 0.04975% | 0.12351% |
| XAGUSD | 4h | 0.04585% | 0.04931% | 0.07773% |
| XAUUSD | 15m | 0.00682% | 0.00623% | 0.09674% |
| XAUUSD | 1h | 0.00656% | 0.00607% | 0.01280% |
| XAUUSD | 4h | 0.00700% | 0.00770% | 0.01247% |

The intraday sample is recent and comparatively short; do not extrapolate these results to the full two-year period.

## Architecture and safety

1. BiQuote remains the sole production spot and OHLC source.
2. Dukascopy is a separate historical research source.
3. TradingView/OANDA remains display-only.
4. Do not add 1-minute candles or 1W/1M timeframes.
5. Do not claim 99% forecast accuracy.
6. No production deployment or dashboard redesign was performed.

## Next work

1. Investigate daily session alignment and outlier dates.
2. Check 15m/1h/4h overlap distributions and timestamp gaps.
3. Build a walk-forward procurement backtest using the research series, with no look-ahead bias, realistic spread/slippage and transaction costs.
4. Compare simple buy-now and periodic-buy baselines before testing signal-based procurement.
5. Only consider production changes after documented acceptance tests.
