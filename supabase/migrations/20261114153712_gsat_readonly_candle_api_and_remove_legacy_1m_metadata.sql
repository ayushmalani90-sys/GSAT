grant select on table public.gsat_market_candles to anon, authenticated;

drop policy if exists "Public read BiQuote market candles" on public.gsat_market_candles;
create policy "Public read BiQuote market candles"
  on public.gsat_market_candles
  for select
  to anon, authenticated
  using (true);

alter table public.gsat_market_data_ingestion_runs
  alter column timeframes
  set default array['15m'::text, '1h'::text, '4h'::text, '1d'::text];

comment on column public.gsat_market_candles.candle_open is
  'UTC candle-open timestamp. Composite primary key makes overlapping 15-minute collector fetches idempotent.';

alter table public.gsat_market_data_health
  drop column if exists latest_closed_1m_candle_at;
