# Volume Profile

## TradingView reference

TradingView defines the Point of Control (POC) as the price level with the highest traded volume in the profile. Value Area is commonly 70% of total volume, starting at the POC and expanding to adjacent rows according to the documented row-volume selection procedure. VAH and VAL are the upper/lower boundaries of that value area. HVN/LVN are volume-distribution concepts used to identify acceptance and lower-activity areas.

## GSAT data constraint

GSAT uses BiQuote CFD candles. This is not centralized exchange volume-at-price. If the feed provides broker/tick volume, it can be used as a proxy, but GSAT must not represent it as exchange-grade traded volume.

## Better approximation than current baseline

For each completed candle:

1. Determine the candle price interval [low, high].
2. Determine which profile rows overlap that interval.
3. Distribute the candle's available volume across overlapping rows using a documented weighting rule rather than placing all volume at one typical-price row.
4. Build the row-volume profile over the configured lookback.
5. POC = maximum-volume row.
6. Value area target = 70% of total profile volume.
7. Starting from POC, compare the immediately adjacent rows above and below and add the higher-volume side first, following TradingView's documented expansion logic until the target is reached.
8. HVN/LVN thresholds must be relative to the profile distribution and must not be arbitrary hard-coded price assumptions.

## Interpretation

- Inside value area: price is within the region where most profile volume accumulated.
- Above VAH: price is above the main value area; context can be expansion or excess and needs price-action confirmation.
- Below VAL: analogous downside context.
- Around POC: acceptance/equilibrium context, not automatically bullish or bearish.
- LVNs can behave as rejection/transition areas, but this is contextual rather than guaranteed.

## Double-counting warning

Volume Profile and support/resistance can describe the same historical reaction. The overall engine should avoid treating them as fully independent evidence when they arise from the same price/volume event.

## Sources

- TradingView Volume Profile basic concepts: https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/
- TradingView Session Volume Profile overview: https://www.tradingview.com/support/solutions/43000745275-session-volume-profile-charts-explained/
