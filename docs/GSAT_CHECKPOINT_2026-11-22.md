# GSAT checkpoint — 2026-11-22

## Purpose
Build a silver-market research and decision-support layer for J.P. Jewellers' physical silver procurement. The intended horizons are short-term and medium/long-term. This is decision support, not a guaranteed price predictor.

## Frozen production architecture
- Spot prices: BiQuote (XAUUSD and XAGUSD).
- OHLC calculation source: BiQuote only.
- Existing TradingView charts remain unchanged.
- Dark theme and current layout remain unchanged.
- Supported timeframes: 15m, 1h, 4h, 1d only.
- Existing indicators remain: EMA 20/50/200, RSI 14, MACD (12,26,9), Support & Resistance, ATR 14, Fibonacci Retracement, Volume Profile, Pattern Detection, Overall Technical Interpretation.
- Do not silently mix external historical feeds into BiQuote calculations.
- BiQuote tick_volume is a tick count, not exchange-traded volume.

## Live Supabase project inspected
- Project: GSAT-Validation
- Ref: vzwzopepgmfjylxvnltl
- Region: ap-south-1
- Status: ACTIVE_HEALTHY
- PostgreSQL: 17.11
- Edge Function: gsat-ingest, ACTIVE, version 12, verify_jwt=false; function body performs its own cron-secret validation.
- Tables: gsat_market_candles (RLS enabled), gsat_market_data_ingestion_runs (RLS enabled), gsat_market_data_health (RLS enabled).
- Candle table comment and CHECK constraints enforce BiQuote as the only production calculation source.

## Verified candle coverage at checkpoint
Rows are completed candles; timestamps are UTC.
| Symbol | Timeframe | Rows | Oldest | Newest |
|---|---:|---:|---|---|
| XAGUSD | 15m | 673 | 2026-11-11 14:30 | 2026-11-20 21:30 |
| XAGUSD | 1h | 288 | 2026-11-04 09:00 | 2026-11-20 20:00 |
| XAGUSD | 4h | 212 | 2026-10-05 12:00 | 2026-11-20 16:00 |
| XAGUSD | 1d | 505 | 2025-04-06 00:00 | 2026-11-19 00:00 |
| XAUUSD | 15m | 673 | 2026-11-11 14:30 | 2026-11-20 21:30 |
| XAUUSD | 1h | 288 | 2026-11-04 09:00 | 2026-11-20 20:00 |
| XAUUSD | 4h | 212 | 2026-10-05 12:00 | 2026-11-20 16:00 |
| XAUUSD | 1d | 505 | 2025-04-06 00:00 | 2026-11-19 00:00 |

All 3,356 stored candles are BiQuote; zero non-BiQuote rows. The table has composite key (symbol, timeframe, candle_open).

## Collector health at checkpoint
- Health status: healthy.
- Consecutive failures: 0.
- Last attempt: 2026-11-22 15:31:00.895 UTC.
- Last success: 2026-11-22 15:31:02.114 UTC.
- Latest closed 15m candle recorded: 2026-11-20 21:30 UTC.
- Ingestion runs: 1,322; latest run 2026-11-22 15:31 UTC; all recorded runs currently report succeeded.
- Note: health=healthy does not mean history is deep enough. Intraday backtest history is currently only days/weeks, not years.

## Free historical-data route selected
- Investigate Dukascopy XAGUSD historical export as a separate research/benchmark feed. Public historical downloads are available; verify actual endpoint, formats, timestamps, quote side, completeness, redistribution/usage terms, and whether the feed is suitable for this project before import.
- Keep this research data in separate tables/schema with explicit source/feed metadata. Never insert it into gsat_market_candles.
- Start with XAGUSD, then XAUUSD only if needed for cross-market context.
- Align UTC sessions and compare overlapping Dukascopy vs BiQuote candles by timeframe; quantify OHLC differences, missing bars, spreads/quote side and day/session boundaries.
- MCX public bhavcopy/EOD history can be a separate INR benchmark; MCX licensed feeds are required for proper exchange trade/order-book history. Do not label OTC CFD tick counts as MCX volume.

## Next work
1. Confirm the free provider's download/API method and terms from primary documentation.
2. Implement a resumable, idempotent historical downloader/importer into isolated research tables.
3. Backfill XAGUSD history first; record provenance and data-quality checks.
4. Run source-overlap diagnostics against BiQuote; do not promote external data to calculation source without explicit review.
5. Build procurement-focused backtests for short and medium/long horizons, including transaction costs, drawdown, false-positive rate, and baseline comparisons.
6. Only consider paid data after the free-data validation demonstrates a specific gap that blocks a useful test.

## Change control
No production dashboard redesign, indicator changes, BiQuote source changes, timeframe changes, or production candle-table modifications are included in this checkpoint.
