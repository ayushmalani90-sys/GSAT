# Fibonacci Retracement

## Authority

TradingView's official Fibonacci Retracement drawing-tool documentation defines retracement levels by connecting two extreme points and dividing the vertical distance using ratios including 23.6%, 38.2%, 61.8% and 100%. Values between 0 and 1 are internal retracements; values above 1 are extensions.

## Important GSAT design decision

The drawing tool requires two user-selected extreme points. GSAT is automated, so it needs a deterministic swing-selection algorithm. It must not blindly use the highest high and lowest low over an arbitrary lookback.

## Proposed deterministic swing selection

1. Detect confirmed pivot highs/lows using symmetric left/right bar counts.
2. Require a minimum price excursion between candidate swings, normalized by ATR.
3. Build candidate swing legs from alternating confirmed pivots.
4. Prefer the most recent leg that has sufficient magnitude and confirmation.
5. Select the leg direction explicitly: low-to-high for an upswing or high-to-low for a downswing.
6. Do not use a pivot that requires future candles which have not yet closed; a confirmed pivot becomes available only after its right-side bars are complete.

## Levels

For an upswing Low -> High:

level = High - ratio * (High - Low)

For a downswing High -> Low:

level = Low + ratio * (High - Low)

Primary levels: 23.6%, 38.2%, 50.0%, 61.8%, 78.6%. 0% and 100% are the anchors.

## Interpretation

The nearest level is context, not a signal. Bullish continuation requires price action to hold/reclaim a retracement level in the direction of the selected leg. Bearish confirmation requires failure/acceptance through the appropriate downside level. Fib confluence should be combined with structural S/R, not double-counted as independent evidence when the same swing generated both.

## Known limitation

There is no single universal automated rule for which swing pair every trader would select manually. GSAT therefore must document its deterministic selection policy rather than claim that its selected pair is the one true Fibonacci leg.

## Sources

- TradingView Fibonacci Retracement drawing tool: https://www.tradingview.com/support/solutions/43000518158-fibonacci-retracement-drawing-tool/
- TradingView Pivot Points High Low: https://www.tradingview.com/support/solutions/43000589195-pivot-points-high-low/
