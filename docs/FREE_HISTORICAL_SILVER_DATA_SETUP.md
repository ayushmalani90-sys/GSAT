# GSAT free historical silver-data importer

## Source selected
MetalCharts API, symbol `XAG`, daily candles only on the Free plan. Its published documentation states:
- Free tier: $0, no card, 200 request-weight/month.
- Free history: 30 days, daily bars only.
- Each history call costs 2 request-weight, so a single daily XAG sync is approximately 2/200 monthly weight.
- Commercial use is permitted on every plan, including Free; public display of Free-tier data requires a visible attribution link to https://metalcharts.org.
- Raw API access must not be resold or republished as a competing feed.

Read the provider's current terms before use:
- https://metalcharts.org/free-metals-api
- https://metalcharts.org/silver-price-api
- https://metalcharts.org/metals-api/docs

## Separation from production
The importer writes only to `research.gsat_external_candles` and `research.gsat_external_ingestion_runs`. It never writes to `public.gsat_market_candles`. BiQuote remains the sole production calculation feed. MetalCharts data is for research and overlap diagnostics only until a source-basis review is completed.

The external table stores USD per troy ounce. The provider-reported volume field is not treated as MCX traded volume or verified centralized exchange volume.

## One-time setup
1. Create a no-card Free API key at https://metalcharts.org/free-metals-api.
2. In Supabase Dashboard → Edge Functions → Secrets, add:
   - `METALCHARTS_API_KEY` = the provider API key
   - `GSAT_RESEARCH_IMPORT_SECRET` = a long random secret you generate and keep private
3. Do not put either secret in GitHub, source code, screenshots, or chat.
4. Invoke `gsat-import-metalcharts-research` with POST and header `x-gsat-research-secret: <your secret>`. The function is deployed with JWT verification disabled, so this custom header check is mandatory.

Project: `vzwzopepgmfjylxvnltl`
Function slug: `gsat-import-metalcharts-research`
Endpoint: `https://vzwzopepgmfjylxvnltl.supabase.co/functions/v1/gsat-import-metalcharts-research`

## Current limitations
- The Free plan cannot provide the years of intraday history needed for a full robust short-horizon backtest.
- This importer is deliberately XAG daily only. It is not a predictor and it does not alter dashboard UI or technical indicators.
- If/when a paid plan is considered, compare incremental benefit against free route and only upgrade with evidence.
