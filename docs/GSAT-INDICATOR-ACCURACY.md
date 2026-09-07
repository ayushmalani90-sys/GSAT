# GSAT Indicator Accuracy Sprint

## Locked data policy

- BiQuote is the only source for GSAT calculation data.
- TradingView/OANDA charts are display-only and are not used as a calculation or parity data source.
- Indicators use completed BiQuote candles only.
- EMA, RSI, MACD and ATR must consume the same normalized candle series for a given symbol/timeframe.
- Do not declare numerical parity against another broker feed unless the candle dataset is demonstrably identical.

## History policy

- Request the maximum practical BiQuote history for each native timeframe.
- Target up to 1000 bars per request where the provider permits it.
- Never pretend that a short provider response is a full 1000-bar history.
- EMA200 requires at least 200 completed candles; validation should prefer materially more warm-up history when available.
- MACD 12/26/9 must be seeded from the same extended close series used by the other indicators.
- RSI14 uses Wilder RMA with a proper initial SMA seed.

## Accuracy gates

- EMA20/50/200: validate deterministic values from the exact BiQuote candle set.
- RSI14: validate deterministic values from the exact BiQuote candle set.
- MACD 12/26/9: validate line, signal and histogram from the exact BiQuote candle set.
- ATR14: validate True Range plus Wilder RMA from the exact BiQuote candle set.

A TradingView difference alone is not a failure when its underlying broker candles differ. A difference between two GSAT calculations using the same normalized candle set is a failure.
