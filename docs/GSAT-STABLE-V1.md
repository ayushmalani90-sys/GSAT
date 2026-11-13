# GSAT Stable V1

## Purpose

This is the frozen development baseline for the BiQuote-first GSAT indicator engine.

## Data policy

- BiQuote is the sole source for prices and OHLC used in GSAT technical calculations.
- TradingView OANDA widgets remain display-only.
- Do not use the OANDA API for analysis calculations.
- Do not add Supabase, Candle Vault, cron ingestion, or permanent history in this phase.

## Supported timeframes

- 15m
- 1H
- 4H
- 1D

## Technical modules

- EMA 20 / 50 / 200
- RSI 14
- MACD 12 / 26 / 9
- ATR 14
- Support / Resistance
- Fibonacci Retracement
- Volume Profile
- Pattern Detection
- Overall Technical Interpretation

## Development sequence

1. Confirm the stable BiQuote build.
2. Validate EMA calculations.
3. Validate RSI 14 using Wilder smoothing and enough warm-up history.
4. Validate MACD.
5. Validate ATR.
6. Validate Support / Resistance, Fibonacci, Volume Profile and Pattern Detection.
7. Only after all numerical checks pass should any historical-storage architecture be reconsidered.

## Safety rule

Production stays frozen while research changes are made. Never promote a research change based only on a successful compile; verify the preview and the relevant API responses first.
