# GSAT external technical interpretation audit — 22 November 2026

## Scope and data boundary

This audit checks whether the wording and scoring used by GSAT are consistent with established indicator definitions. It does not claim that technical analysis predicts future prices or that any rule is profitable. Production calculations continue to use stored BiQuote OHLC only. TradingView/OANDA remains display-only. Dukascopy remains research-only and is not merged into the production indicator stream.

## Indicator-by-indicator interpretation policy

| GSAT output | External reference | Accepted interpretation | Limitation / GSAT handling |
|---|---|---|---|
| EMA 20/50/200 | StockCharts, Moving Averages — Simple and Exponential: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential | Price relative to moving averages describes trend context; EMA weights recent prices more heavily and remains lagging. | EMA seed depends on the initial SMA and subsequent recursive values. GSAT now withholds an EMA until the initial seed's residual weight is below 1%. For EMA200 this requires 661 closes. |
| RSI 14 | TradingView RSI: https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/ ; StockCharts RSI: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi | RSI below 30 is an oversold condition; above 70 is overbought. Wilder RSI uses smoothed average gains/losses. | Oversold/overbought is not an automatic reversal. GSAT keeps extreme RSI neutral in directional scoring until price confirmation; RSI is not treated as a standalone buy/sell signal. |
| MACD 12/26/9 | TradingView MACD: https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/ ; StockCharts MACD: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/macd-moving-average-convergence-divergence-oscillator | MACD line relative to zero describes fast-vs-slow EMA trend; histogram above/below zero means MACD is above/below its signal line. A positive histogram while MACD remains below zero means downside momentum is easing, not that the broader trend has turned bullish. | GSAT now describes zero-line trend and signal-line state separately. MACD contributes a directional score of 100 only when both line and histogram are positive, 0 only when both are negative, and 50 when they disagree. |
| ATR 14 | TradingView ATR: https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/ ; StockCharts True Range: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/true-range | ATR measures volatility, including gaps from prior close; it does not indicate direction. | GSAT displays ATR and ATR as a percentage of price, but excludes ATR from bullish/bearish confluence. |
| Support/resistance | TradingView Pivot Points Standard: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/ | Swing highs/lows and pivot-derived levels can be treated as potential support/resistance context. | GSAT uses confirmed 3-left/3-right pivots and clusters nearby levels. Strength is a heuristic ranking from touches, reaction, recency and prominence—not a probability or validated win rate. |
| Fibonacci retracement | TradingView Fibonacci Retracement: https://www.tradingview.com/support/solutions/43000518158-fibonacci-retracement-drawing-tool/ | Retracement ratios are potential support/resistance areas measured from two swing extremes. | GSAT selects the latest qualifying confirmed alternating swing leg. The nearest level is context, never a trade signal by itself. |
| Volume Profile | StockCharts Volume-by-Price: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-by-price | Conventional volume-by-price requires volume assigned to price zones. | GSAT does not have centralized exchange volume-at-price. It uses BiQuote tick count, uniformly allocated across each candle's high-low range. POC/value area are broker-feed proxies, not true traded volume-at-price. |
| Candlestick patterns | StockCharts Candlesticks and Traditional Chart Analysis: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlesticks-and-traditional-chart-analysis | Completed candle geometry can describe rejection/engulfing-type patterns and can provide context alongside trend and levels. | GSAT's pattern quality score is geometric, not a probability of success. Patterns are now excluded from directional confluence until their forward outcomes are tested out-of-sample. |

## Data-specific warm-up finding

At the latest live API check, stored BiQuote history per symbol was 673 x 15m, 288 x 1H, 212 x 4H and 505 x 1D candles. With EMA200's SMA seed, the residual seed weight after 212 candles is about 88.7%; after 288 candles about 41.5%; after 505 candles about 4.7%; after 673 candles about 0.9%. Therefore a raw EMA200 value was technically computable but not comparably warmed on 1H, 4H and 1D. GSAT now returns EMA200 as unavailable until 661 closes are present. This is a deterministic warm-up gate, not a claim that 661 candles guarantee market accuracy.

## Changes made on feature branch

- Added a pure helper module for EMA warm-up and MACD interpretation.
- EMA20/50/200 are withheld until seed residual weight is below 1%.
- MACD wording separates zero-line trend from signal-line momentum.
- MACD confluence requires trend and signal-line alignment; disagreement scores neutral.
- Candlestick pattern geometry is shown as context but excluded from directional confluence.
- Support/resistance strength is explicitly described as a heuristic, not a probability.
- Volume Profile wording now states that tick count is uniformly allocated across candle high-low ranges.
- Added automated tests for warm-up thresholds and MACD interpretation.

## Not yet validated

- This audit does not establish exact TradingView/OANDA parity. The display feed and BiQuote calculation feed are different providers. Exact parity requires identical OHLC arrays and identical warm-up/startup conventions.
- No profitability claim is made for any pattern, confluence threshold, support/resistance rule, or procurement strategy.
- Indian landed purchase cost remains unmodelled until USD/INR, MCX basis, local wholesale premium, GST, freight and making/assay costs are incorporated.
- The preview endpoint was runtime-checked before these new changes; the new commit still needs a fresh build and endpoint smoke test.
