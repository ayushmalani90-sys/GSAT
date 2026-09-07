# GSAT RSI 14 — 1H Investigation

## Observed discrepancy

A user comparison reported:

- TradingView RSI(14), XAUUSD, 1H: **39.46**
- GSAT RSI(14), 1H: **37.53**
- Absolute difference: **1.93 RSI points**

This is a validation failure. It is not considered ignorable against the GSAT target tolerance of 0.10 RSI points.

## Root-cause order

The investigation must proceed in this order, because changing the RSI formula before proving candle parity can mask a data-feed mismatch:

1. Compare the exact completed-bar timestamps used by GSAT and TradingView.
2. Compare the corresponding OHLC/close values for the same bars.
3. Verify the final bar is closed, not the currently forming 1H candle.
4. Verify the amount and start point of historical warm-up data.
5. Verify Wilder/RMA initialization and recurrence.
6. Only then adjust implementation if the same candle series still produces a mismatch.

## Current GSAT implementation

GSAT calculates RSI from close-to-close changes, separates gains and losses, seeds the RMA with the arithmetic mean of the first `period` observations, and then applies Wilder's recursive smoothing.

The implementation is now exported as `rma()` so the validation harness can inspect the exact smoothing method. The edge case where both average gain and average loss are zero returns 50 rather than an arbitrary extreme.

## Acceptance rule

RSI is **PASS** only when the GSAT value and the TradingView reference are generated from the same symbol, timeframe, completed candle, and candle history and the absolute difference is <= 0.10.

Until those conditions are demonstrated, label the result **UNVERIFIED** even when the arithmetic implementation appears mathematically plausible.
