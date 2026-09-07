# MACD 12 / 26 / 9

## Authority

TradingView Pine provides `ta.macd(source, fastLength, slowLength, signalSmoothing)`. The official Pine primer demonstrates the canonical construction as EMA(12) minus EMA(26), with the signal line as EMA(9) of the MACD line.

## Formula

MACD_t = EMA12_t - EMA26_t
Signal_t = EMA9(MACD)_t
Histogram_t = MACD_t - Signal_t

## Critical warm-up rule

The signal line must be calculated from the complete MACD series produced by the full EMA histories. A shortened local MACD array with its own fresh seed can create avoidable divergence from TradingView. GSAT must preserve sufficient warm-up history before taking the last values.

## Interpretation rule

- MACD above signal: positive momentum differential.
- MACD below signal: negative momentum differential.
- Zero-line position describes the relationship between fast and slow EMA and should be evaluated separately from the signal crossover.
- Histogram magnitude and direction describe momentum acceleration/deceleration but are not standalone trade signals.

## Validation

Target numerical tolerance: absolute MACD line/signal/histogram difference <= 0.02 when the same candle series and warm-up are used.

## Sources

- TradingView Pine primer: https://www.tradingview.com/pine-script-docs/primer/first-indicator/
- TradingView Pine built-ins: https://www.tradingview.com/pine-script-docs/language/built-ins/
