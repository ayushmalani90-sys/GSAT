# EMA 20 / 50 / 200

## Authority

TradingView Pine Script provides `ta.ema()` as the canonical platform reference for GSAT. Pine documentation and source examples describe EMA as the standard exponential moving average.

## Formula

For length N:

alpha = 2 / (N + 1)

EMA_t = alpha * source_t + (1 - alpha) * EMA_(t-1)

The warm-up/seed is material to exact numerical parity. A local implementation that begins from only the last N candles can disagree with TradingView when the platform has a longer history.

## GSAT rule

GSAT should compute an EMA series from a sufficiently long completed-candle history, then take the current final value. No intermediate rounding.

## Interpretation rule

EMA itself is a state estimate, not a bullish/bearish signal. Directional interpretation should consider price relative to EMA and EMA ordering/slope separately. Do not label price above one EMA as universally bullish.

## Validation

Compare values only when candle timestamps, OHLC source and completed/open status match TradingView's displayed series. Tolerance targets: EMA20 <= $0.02, EMA50 <= $0.02, EMA200 <= $0.05.

## Sources

- TradingView Pine Script built-ins: https://www.tradingview.com/pine-script-docs/language/built-ins/
- TradingView Pine indicator primer: https://www.tradingview.com/pine-script-docs/primer/first-indicator/
