# GSAT Indicator Research Standard

## Purpose

GSAT technical indicators must be research-first and accuracy-first. No production promotion is allowed from this branch. The protected production baseline is commit `f6c2e76cd74eaaf793670a3b655e3956c9a97617`.

## Source hierarchy

1. TradingView official Pine Script documentation and official support material, because GSAT charts are TradingView OANDA widgets.
2. Original indicator methodology and primary sources, especially J. Welles Wilder for RSI and ATR.
3. Established reference implementations such as TA-Lib when useful for cross-checking.
4. Academic or institutional material for advanced methodology.
5. Community code only as a secondary comparison; never as the authority when it conflicts with primary/reference sources.

## Validation rule

For each indicator, document:

- exact mathematical definition;
- initialization/warm-up behavior;
- smoothing method;
- treatment of missing/incomplete candles;
- precision/rounding policy;
- timeframe/data-source assumptions;
- known differences between TradingView and other implementations;
- GSAT implementation and unit tests;
- live preview verification before merge.

## Current GSAT acceptance tolerances

- Spot: <= $0.05
- EMA20: <= $0.02
- EMA50: <= $0.02
- EMA200: <= $0.05
- RSI14: <= 0.10
- MACD: <= 0.02

These tolerances apply only after the compared data series and candle boundaries are demonstrably the same.

## Data integrity rules

- Analyze completed candles only.
- Preserve chronological order.
- Never silently mix providers for one calculation.
- Keep TradingView widget configuration unchanged.
- Do not claim candle-for-candle parity unless the underlying compared OHLC series are identical.

## Indicator research status

### EMA 20/50/200
TradingView Pine provides `ta.ema()`. GSAT must use the standard recursive EMA and sufficient warm-up history. Exact current-value parity depends on having the same historical close series and seed/warm-up behavior.

### RSI 14
TradingView Pine provides `ta.rsi()`. GSAT must use Wilder-style RMA smoothing of gains and losses and sufficient warm-up history.

### MACD 12/26/9
TradingView Pine provides `ta.macd()`. GSAT must derive the MACD line from EMA(12)-EMA(26), the signal from EMA(9) of the MACD series, and preserve sufficient history for correct warm-up.

### ATR 14
TradingView ATR uses True Range smoothed with Wilder RMA. GSAT must preserve sufficient history and exclude the current open candle from completed-candle analysis.

### Fibonacci
TradingView's drawing tool uses two selected extreme points and standard retracement ratios. GSAT therefore needs a documented, deterministic swing-selection algorithm rather than blindly using arbitrary global highest/lowest values.

### Support/Resistance
TradingView documents pivot high/low concepts separately from classic pivot-point formulas. GSAT structural S/R must remain deterministic, use confirmed pivots, and distinguish structural strength from simple proximity.

### Volume Profile
TradingView defines POC as the price level with the highest traded volume and value area around the POC, commonly 70%. GSAT's BiQuote CFD feed may expose broker/tick volume rather than centralized exchange volume, so the implementation must explicitly label any volume-at-price approximation and must not present it as exchange-grade volume.

### Patterns
Pattern detection must use explicit geometric conditions, trend/context filters, invalidation, and deterministic confidence scoring. Fixed confidence constants without evidence are not acceptable.

## Preview-only policy

All indicator-engine changes from this branch must remain preview deployments until the user confirms the formulas and outputs. Production `main` is not modified as part of this research stage.
