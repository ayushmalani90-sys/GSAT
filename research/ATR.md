# ATR 14

## Authority

Average True Range was introduced by J. Welles Wilder. TradingView's ATR implementation uses True Range followed by Wilder RMA smoothing.

## Formula

TR_t = max(H_t-L_t, abs(H_t-C_(t-1)), abs(L_t-C_(t-1)))

For the first candle, where no previous close exists, the range is H-L.

ATR_t = RMA(TR, 14)

## GSAT rule

Compute the complete TR series over sufficient historical completed candles, then apply Wilder RMA. Do not round intermediate values. The current open candle is excluded from the technical snapshot.

## Interpretation rule

ATR is a volatility magnitude measure. High ATR means larger realized ranges, not bullishness. Low ATR means contraction, not bearishness. Directional breakout/breakdown logic must come from price structure and confirmation; ATR should act as a volatility/regime filter and for normalized distances.

## Useful derived measures

ATR percentage = ATR / price * 100.
ATR multiples can normalize distance to support/resistance across gold and silver and across timeframes.

## Validation

Use the same completed candle series as TradingView. Numerical parity must be established before using ATR-derived thresholds elsewhere.

## Sources

- J. Welles Wilder, *New Concepts in Technical Trading Systems*.
- TradingView technical indicator documentation / Pine built-ins.
