delete from public.gsat_market_candles
where timeframe = '1m';

alter table public.gsat_market_candles
  drop constraint if exists gsat_market_candles_timeframe_check;

alter table public.gsat_market_candles
  add constraint gsat_market_candles_timeframe_check
  check (timeframe = any (array['15m'::text, '1h'::text, '4h'::text, '1d'::text]));

alter table public.gsat_market_data_health
  add column if not exists latest_closed_15m_candle_at timestamptz;

update public.gsat_market_data_health
set latest_closed_15m_candle_at = (
      select max(candle_open)
      from public.gsat_market_candles
      where timeframe = '15m'
    ),
    latest_closed_1m_candle_at = null,
    updated_at = now()
where id = 1;
