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


## Validation update

The self-test suite now includes fixed golden outputs for EMA20/50/200, RSI14, MACD 12/26/9 and ATR14. It also verifies that changing only candle range (and therefore ATR) cannot change the directional confluence score. ATR remains visible in the volatility analysis but is excluded from directional scoring.


## Advanced-module validation

The preview route uses \`analyzeVerified\` for the selected timeframe and all four MTF panels. Its independent synthetic regression suite checks:
- structural strength is invariant to current-price distance when the same pivot zones remain eligible;
- Fibonacci uses a confirmed alternating swing and the documented ratios;
- Volume Profile conserves source tick count while distributing it across candle price ranges and calculates a 70% value area;
- zero tick volume does not create a fabricated POC;
- bullish/bearish engulfing and bullish rejection are detected with geometry-based quality and invalidation;
- missing EMA200 reduces EMA confluence weight and evidence coverage;
- ATR-only range changes do not change directional confluence;
- absence of a pattern is neutral price-action evidence.

The tests do not certify triangle/breakout patterns, statistical signal quality, or two-year source-history availability. Those remain out of scope until separately implemented and validated.
