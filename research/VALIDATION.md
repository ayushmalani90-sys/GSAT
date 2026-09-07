# GSAT Preview Validation Checklist

## Gate 0 — Safety

- [x] Production baseline remains `f6c2e76cd74eaaf793670a3b655e3956c9a97617`.
- [x] Research work is isolated on `gsat-indicator-research-v1`.
- [x] No production deployment is authorized from this branch.

## Gate 1 — Build

- [ ] Vercel preview is READY.
- [ ] TypeScript build succeeds.
- [ ] No build warnings hide runtime failures.

## Gate 2 — API integrity

- [ ] `/api/analysis?timeframe=15m` returns 200.
- [ ] `/api/analysis?timeframe=1H` returns 200.
- [ ] `/api/analysis?timeframe=4H` returns 200.
- [ ] `/api/analysis?timeframe=1D` returns 200.
- [ ] Unsupported timeframe returns 400.
- [ ] Open candles are excluded.
- [ ] Gold and silver both return non-empty completed-candle samples.

## Gate 3 — Numerical indicators

- [ ] EMA20 comparison against the same TradingView series is within $0.02.
- [ ] EMA50 comparison against the same TradingView series is within $0.02.
- [ ] EMA200 comparison against the same TradingView series is within $0.05.
- [ ] RSI14 within 0.10.
- [ ] MACD within 0.02.
- [ ] ATR matches the same completed candle series.

## Gate 4 — Structural modules

- [ ] S/R candidates are confirmed pivots with no look-ahead.
- [ ] Strength is evidence-based and separate from distance.
- [ ] Nearest support/resistance is actually selected by distance.
- [ ] Fibonacci uses a documented structural swing leg.
- [ ] Volume Profile uses available broker/tick volume rather than candle-count volume.
- [ ] POC and 70% value area logic is deterministic.
- [ ] Pattern confidence is evidence-derived, not a fixed constant.

## Gate 5 — Interpretation

- [ ] ATR does not create bullish/bearish bias by itself.
- [ ] Proximity to resistance is not treated as bullish by itself.
- [ ] Proximity to support is not treated as bearish by itself.
- [ ] Correlated evidence is not blindly double-counted.
- [ ] Confidence reflects agreement and data quality, not win probability unless empirically calibrated.

## Gate 6 — UI safety

- [ ] TradingView OANDA chart symbols remain unchanged.
- [ ] Timeframes remain 15m / 1H / 4H / 1D.
- [ ] No dashboard layout redesign occurs.

## Gate 7 — Production

Only after all gates above pass and the user explicitly approves: merge to `main`, confirm production deployment, and verify rollback candidate availability.
