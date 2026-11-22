# GSAT free historical gold & silver data importer

## Selected source
MetalCharts API, symbols `XAG` (silver) and `XAU` (gold), daily candles on the Free plan.

Current provider terms and limits:
- Free: $0, 200 request-weight/month, 10 weight/minute, 30 days of daily history.
- A history request costs 2 weight. A daily sync of both metals uses 4 weight/day, about 120 weight per 30-day month, leaving about 80 weight for manual checks.
- Commercial use is permitted, including on Free.
- Public display of Free-tier data requires a visible attribution link to https://metalcharts.org. Private internal research does not require the credit link.
- API keys must remain server-side. Do not commit or expose them.
- The provider disallows bulk extraction to recreate or redistribute its dataset and makes no accuracy warranty.

Primary documentation:
- https://api.metalcharts.org/docs
- https://metalcharts.org/api-terms
- https://metalcharts.org/silver-price-api

## Data separation
The importer writes only to:
- `research.gsat_external_candles`
- `research.gsat_external_ingestion_runs`

It imports XAG and XAU daily bars. It never writes to `public.gsat_market_candles`. BiQuote remains the sole production calculation source. MetalCharts is a separate research benchmark only.

The external table stores USD per troy ounce. Provider-reported volume is explicitly labelled as not verified exchange volume and must not be called MCX traded volume.

## One-time setup
1. Create a Free API key at https://metalcharts.org/free-metals-api.
2. In Supabase Dashboard → Edge Functions → Secrets, add:
   - `METALCHARTS_API_KEY` = your MetalCharts API key
   - `GSAT_RESEARCH_IMPORT_SECRET` = a long random secret you generate and keep private
3. Do not put either key in GitHub or chat.
4. Invoke the function with POST and header `x-gsat-research-secret: <your secret>`.

Project: `vzwzopepgmfjylxvnltl`
Function: `gsat-import-metalcharts-research`
Endpoint: `https://vzwzopepgmfjylxvnltl.supabase.co/functions/v1/gsat-import-metalcharts-research`

The function uses Supabase's server-side Edge Function credentials and a restricted SECURITY DEFINER RPC; no direct database password or `SUPABASE_DB_URL` secret is required.

## Free-tier limitation
Free history does not provide intraday bars or enough history for a robust short-horizon backtest. It is useful for daily cross-source checks and long-horizon context only. Do not claim a tested short-term procurement edge from 30 daily observations.
