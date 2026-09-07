# GSAT RSI(14) 1H Gold Validation Record

## Reported discrepancy

TradingView RSI(14), XAUUSD, 1H: **39.46**
GSAT RSI(14), 1H: **37.53**
Absolute difference: **1.93 RSI points**

Result against GSAT tolerance of +/-0.10: **FAIL**.

## Diagnosis protocol

Before changing the RSI formula, GSAT must prove that the reference and calculated values use the same:

1. Symbol/feed (for example OANDA XAUUSD on TradingView versus BiQuote XAUUSD).
2. Timezone/session boundaries.
3. Completed 1H candle set.
4. Historical lookback used to seed the RMA.
5. Closing-price series.

A mismatch in any of these can produce a different RSI even when both implementations use Wilder RSI correctly.

## Acceptance rule

Do not modify production RSI solely to force 39.46 from a single screenshot. First capture the exact completed 1H OHLC/close series used by TradingView and GSAT. Then compare the full series and the final RSI. Only after the candle series is aligned should formula changes be accepted.

## Current status

UNVERIFIED / FAIL. This is a validation failure, not evidence that GSAT's arithmetic is necessarily wrong.
