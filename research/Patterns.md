# Pattern Detection

## Design principle

GSAT should detect patterns as deterministic geometric structures, not labels produced by loose visual heuristics. A pattern is useful only when its geometry, context, confirmation and invalidation are explicit.

## Required components

### Geometry

Define measurable swing relationships: support/resistance line fit, slope, symmetry, amplitude contraction/expansion, and minimum number of relevant pivots.

### Context

Evaluate the pattern relative to trend, volatility regime, structural support/resistance, and selected Fibonacci leg. Context changes the interpretation but must not rewrite the observed geometry.

### Confirmation

A pattern should not be described as confirmed solely because its shape exists. Confirmation can require a close through the pattern boundary, a rejection at the boundary, or another deterministic event appropriate to that pattern.

### Invalidation

Every detected pattern needs an explicit condition that makes it invalid, such as structural violation or failure of breakout/retest within a defined window.

### Confidence

Do not hard-code confidence values like 72/68/76. Confidence should be derived from measurable evidence: geometry quality, pivot count, symmetry, trend alignment, breakout/retest status, and data quality. Confidence must never imply a statistical win probability unless it has been empirically calibrated and documented.

## Initial supported pattern families

Start with a small, reliable set rather than 20+ labels:

- bullish/bearish engulfing;
- rejection candle / hammer / shooting-star style events;
- ascending/descending triangle only after line-fit and pivot-count rules are established;
- range breakout and failed breakout.

Broader chart-pattern coverage should wait until these are validated.

## Sources

Pattern definitions should be cross-checked against established technical-analysis references and TradingView's current educational material. Community examples may be used for edge cases but not as authoritative definitions.
