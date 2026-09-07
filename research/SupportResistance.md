# Structural Support & Resistance

## Authority and scope

TradingView documents pivot highs/lows as confirmed turning points: a pivot high has lower highs on both sides and a pivot low has higher lows on both sides. Classic Pivot Points are a different family and should not be mixed into the structural-zone engine.

## GSAT methodology

GSAT should use confirmed swing pivots for structural zones rather than arbitrary rolling maxima/minima.

### Candidate generation

- Symmetric pivot window, configurable but frozen for validation.
- Only confirmed pivots are eligible; no look-ahead.
- Candidates must be on the appropriate side of current price for support/resistance.

### Zone construction

Nearby pivots are clustered into a zone using ATR-normalized tolerance. A zone represents an area, not an exact tick price.

### Strength components

Strength should be based on observable evidence:

- number of independent touches;
- quality of reactions/rejections after touches;
- recency decay;
- traded/broker volume evidence where available;
- structural prominence / excursion from surrounding pivots.

Proximity to current price must not increase the structural strength score. Proximity belongs in the interpretation/risk context layer.

### Nearest-level selection

When a calculation needs nearest support/resistance, levels must first be filtered to the correct side of price and then sorted by distance, not strength. The baseline implementation currently risks selecting the strongest level rather than the nearest one.

## Interpretation

- Near support + bullish rejection/acceptance can support a bullish case.
- Near resistance + bearish rejection can support a bearish case.
- Breaking and accepting above resistance can turn the former resistance into a support candidate.
- Breaking and accepting below support can turn former support into resistance.

A nearby resistance is not itself bullish, and nearby support is not itself bearish. Breakout/breakdown state and reaction evidence are required.

## Relation to TradingView Pivot Points

TradingView's Standard Pivot Points are formulaic levels derived from higher-timeframe OHLC. They are not the same methodology as structural swing zones. GSAT should keep the two concepts separate unless a dedicated classic-pivot module is later added.

## Sources

- TradingView Pivot Points High Low: https://www.tradingview.com/support/solutions/43000589195-pivot-points-high-low/
- TradingView Pivot Points Standard: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/
- TradingView Pivot Reversal Strategy: https://www.tradingview.com/support/solutions/43000594526-pivot-reversal-strategy/
