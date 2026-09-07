# RSI 14

## Authority

TradingView Pine exposes `ta.rsi()`. GSAT should match Pine's Wilder-style calculation when using the same completed close series.

## Formula

Delta_t = Close_t - Close_(t-1)

Gain_t = max(Delta_t, 0)
Loss_t = max(-Delta_t, 0)

Average gain and average loss use Wilder's RMA with length 14:

RMA_t = ((N-1) * RMA_(t-1) + source_t) / N

RS = AvgGain / AvgLoss
RSI = 100 - 100 / (1 + RS)

Edge cases must be handled deterministically when average loss or gain is zero.

## GSAT rule

Compute full gain/loss and RMA series from sufficient completed historical candles. Do not locally seed the calculation from only the latest 14 changes. Do not round intermediate values.

## Interpretation rule

RSI is momentum, not a standalone buy/sell instruction. Neutral 50, overbought/oversold zones, trend-specific ranges and divergences should be treated as separate evidence. GSAT's overall engine must never equate RSI > 70 with an automatic bearish signal or RSI < 30 with an automatic bullish signal.

## Validation

Target numerical tolerance: RSI14 <= 0.10 against the same TradingView series.

## Sources

- TradingView Pine Script built-ins: https://www.tradingview.com/pine-script-docs/language/built-ins/
- TradingView Pine reference material for `ta.rsi()` and RMA behavior.
