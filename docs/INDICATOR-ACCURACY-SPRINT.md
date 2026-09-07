# GSAT Indicator Accuracy Sprint

## Locked policy

- BiQuote is the only calculation data source.
- TradingView/OANDA charts are display-only.
- Only completed candles are used for calculations.
- EMA, RSI, MACD and ATR receive the same long BiQuote history for the selected timeframe.
- Historical pagination is trusted only when BiQuote explicitly provides `nextCursor` or `next_cursor`.
- No OANDA API indicator values are used as references or inputs.

## Current implementation

The analysis API requests up to 1,000 BiQuote candles for the selected timeframe and follows explicit provider cursors. The API reports the actual loaded sample counts so validation can distinguish a provider-history limit from an indicator-engine problem.

## Acceptance checks

1. EMA20, EMA50 and EMA200 are available when at least 200 completed candles exist.
2. RSI14 uses Wilder RMA and completed closes only.
3. MACD uses EMA12, EMA26 and EMA9 signal on the same completed close series.
4. Histogram equals MACD minus signal.
5. ATR14 uses true range with Wilder RMA.
6. Differences versus TradingView are treated as source/candle-set differences unless the same completed BiQuote candle set is used.
