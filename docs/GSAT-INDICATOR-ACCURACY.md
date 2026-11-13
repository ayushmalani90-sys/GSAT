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


## Current validation additions

- A fixed 240-close synthetic golden fixture now checks EMA20/50/200, RSI14, MACD line/signal/histogram and ATR14 against constants produced by an independent Python reference implementation.
- A confluence regression test varies candle range while holding closes fixed. Directional confluence must remain unchanged when only ATR volatility changes.
- These tests validate formula implementation and seeding. They do not prove that BiQuote supplies a complete history or that a live source snapshot matches another provider.


## Advanced modules — preview implementation

The preview analysis route now uses a separately testable advanced calculation module.

- **Support/resistance:** confirmed 3-left/3-right pivots, ATR-normalized clustering, and strength based on touch count, post-pivot reaction, recency and prominence. Distance is reported separately and does not raise strength. Broker tick count is not represented as traded volume.
- **Fibonacci:** selects the latest qualifying alternating confirmed pivot leg and requires a minimum excursion of 1.25 ATR (with a small price-relative floor). The selected direction and pivot indexes are returned. Retracement location is context, not a standalone signal.
- **Volume Profile:** distributes each candle's available weight across the price rows intersecting its high-low range, calculates POC and a 70% value area, and derives relative HVN/LVN candidates. Tick volume is labelled as a broker-feed proxy, not exchange volume-at-price. If all available tick-volume values are zero, POC is unavailable rather than fabricated.
- **Candlestick patterns:** the supported set is bullish/bearish engulfing and bullish/bearish rejection. Each is evaluated on the completed candle, includes an invalidation condition, and reports a bounded geometric quality score. That score is not a statistical win probability. Triangles and breakout/failure patterns remain unsupported until their geometry and confirmation rules are implemented.
- **Confluence:** EMA weight is reduced when EMA20/50/200 are not all available. ATR, S/R proximity, Fibonacci location and Volume Profile location are not treated as directional evidence. S/R context remains visible but unscored until a confirmed reaction/breakout model is validated. Coverage is normalized to the active directional evidence weights.

These are deterministic methodology choices, not proof of profitable signals. The preview self-test endpoint includes synthetic regression fixtures for the above behaviours. Persisted-database regression and multi-session live review remain separate gates.
