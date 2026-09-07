# GSAT Technical Indicator Audit — Initial Pass

Date: 2026-09-07

## Findings

### EMA
Current baseline implementation uses SMA seeding followed by recursive EMA updates. This is mathematically standard, but current API history length and warm-up are not yet proven sufficient for TradingView parity.

### RSI
Current baseline uses Wilder-style RMA for gains/losses. Formula family is correct, but parity requires enough historical candles and identical completed-candle boundaries.

### MACD
Current baseline computes EMA(12)-EMA(26), then applies a locally seeded EMA(9) to the shortened MACD series. This is a material warm-up risk and must be replaced with a full EMA-series pipeline using sufficient history before parity can be claimed.

### ATR
Current baseline uses True Range followed by RMA(14). Formula family is correct, but the initialization/warm-up history must be treated explicitly.

### Support/Resistance
Current baseline has a structural swing-high/low approach, but the production branch has simpler clustering. The research branch must make pivot confirmation, zone construction, touch/reaction scoring, recency, volume evidence, and nearest-level selection deterministic. Strength and proximity must remain separate concepts.

### Fibonacci
Current baseline uses the highest high and lowest low in a lookback window. This is not an adequate deterministic substitute for a selected structural swing leg. The research branch must define a swing-selection algorithm from confirmed pivots before using retracement levels for interpretation.

### Volume Profile
Current baseline uses candle occurrence counts at typical price. This is not a genuine volume profile. The branch should use available BiQuote broker/tick volume, distribute volume across price bins with a documented approximation, and calculate POC plus a 70% value area. It must disclose that this is not centralized exchange volume-at-price.

### Pattern Detection
Current baseline uses heuristic conditions with fixed confidence values. Fixed confidence constants are not analytically defensible. The research branch should use explicit geometry, context, confirmation and invalidation, with confidence derived from observable evidence.

### Overall Interpretation
Current weighted engine contains directional rules that can be misleading, especially treating high ATR as bullish and proximity to resistance as inherently bullish. The interpretation layer should consume corrected indicator outputs and use volatility as a regime/confidence modifier rather than a directional signal by itself.

## Immediate priority

1. Establish canonical indicator series with sufficient warm-up.
2. Add deterministic tests around known synthetic series.
3. Define swing-selection and S/R methodology.
4. Rebuild Volume Profile around real/tick volume where available.
5. Rebuild patterns and overall scoring only after underlying modules are stable.
