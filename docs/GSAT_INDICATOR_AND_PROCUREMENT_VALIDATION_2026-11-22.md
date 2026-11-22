# GSAT Indicator & Procurement Validation — 2026-11-22

## Code changes completed on `gsat-analyst-platform`

1. **Newest-candle selection fixed.** `app/api/analysis/route.ts` previously requested ascending candles with a 1,000-row limit. As stored history grows beyond 1,000 rows, that would return the oldest candles and silently calculate stale indicators. It now requests newest-first, then reverses the rows locally before indicator calculations.
2. **Confluence coverage corrected.** An absent candle pattern was previously assigned a neutral score of 50, incorrectly treating missing evidence as neutral evidence. It now contributes no directional score, reducing confluence coverage instead.
3. **Automated indicator regression checks added.** Vercel runs `npm test` before `next build`.

## Automated test results

Latest preview build `dpl_HK3A9ok5RddkaV4eCm2tVJUBqe8q` completed READY. All 7 deterministic tests passed:

- EMA: SMA seed and recursive smoothing.
- Wilder RMA: SMA seed and Wilder recursion.
- RSI: rising, falling, flat and insufficient input.
- MACD: flat-market zero vector and varying-series numerical regression vector.
- ATR: constant-range Wilder smoothing and prior-close gap handling.

These tests verify the implemented formulas on known inputs. They do not prove profitability or exact parity with TradingView's startup conventions.

## Candle continuity

Dukascopy two-year history has recurring session breaks consistent with market closures:

- 15m and 1h contain recurring daily maintenance breaks (typically 1h15m and 2h respectively).
- 4h contains normal weekend closures.
- Daily bars occur six days per week (Sunday–Friday UTC), with Saturday closed.
- The two >72-hour closures occur around Easter: 17–20 April 2025 and 2–5 April 2026.

No automatic forward-fill is allowed across market closures. Backtests must use the actual session calendar.

## First procurement backtest — research only

The first baseline used two years of Dukascopy daily BID spot closes, a normalized 24 USD budget, 0.10% illustrative buy friction, and final valuation at the last spot close. Monthly DCA buys the first available candle each calendar month. The 2% dip rule signals when a completed close is at least 2% below the average of the prior 20 completed daily closes, then buys at the next available close using up to twelve equal tranches.

| Metal | Buy once at start | Monthly DCA | 2% prior-20-day dip |
|---|---:|---:|---:|
| XAG/USD | +31.445% | -8.530% | +1.076% |
| XAU/USD | +30.151% | -2.549% | +4.366% |

These are historical spot mark-to-market returns, not realized jewellery procurement savings. The rule is not robust across regimes:

- In the first year (rising market), buy-now beat monthly DCA and the tested dip rules.
- In the second year (falling market), buy-now lost less than monthly DCA and the dip rules.
- The dip rules often bought later at higher prices while the market was still rising or falling; a simple moving-average dip threshold is not a reliable timing model by itself.

## Critical limitations

- No USD/INR conversion.
- No MCX premium/basis, Indian dealer premium, import cost, GST, freight, making charges or working-capital cost.
- No inventory turnover or product mix.
- Only one historical two-year sample; this is not a walk-forward validated strategy.
- Dukascopy BID is an external research reference and is never merged into production BiQuote indicators.

## Saved notebook

[GSAT Procurement Strategy Backtest](https://supabase.com/dashboard/project/vzwzopepgmfjylxvnltl/explorer/notebook/ea2fab8d-0665-4ace-9e21-edb495752b83)

## Next acceptance gates

1. Compare indicator outputs against an independent implementation on the same BiQuote candle arrays, not against OANDA prices.
2. Add USD/INR and Indian wholesale/MCX basis before estimating J.P. Jewellers' landed cost.
3. Build rolling walk-forward tests with multiple market regimes, no look-ahead, and realistic buy costs.
4. Compare the strategies against simple inventory purchasing policies and include stock holding/turnover.
5. Do not promote to production until the analysis API is runtime-smoke-tested and all validation gates pass.
