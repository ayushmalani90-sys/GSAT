-- GSAT market-data storage foundation.
-- This migration creates storage and observability tables only.
-- It does NOT schedule ingestion, backfill data, or change the live analysis route.

create table if not exists public.gsat_market_candles (
  symbol text not null
    check (symbol in ('XAUUSD', 'XAGUSD')),
  timeframe text not null
    check (timeframe in ('1m', '15m', '1h', '4h', '1d')),
  candle_open timestamptz not null,
  open_price double precision not null check (open_price > 0),
  high_price double precision not null check (high_price > 0),
  low_price double precision not null check (low_price > 0),
  close_price double precision not null check (close_price > 0),
  volume double precision,
  tick_volume bigint,
  source text not null default 'BiQuote'
    check (source = 'BiQuote'),
  first_ingested_at timestamptz not null default now(),
  last_ingested_at timestamptz not null default now(),

  constraint gsat_market_candles_ohlc_valid
    check (
      high_price >= greatest(open_price, close_price, low_price)
      and low_price <= least(open_price, close_price, high_price)
    ),
  constraint gsat_market_candles_volume_valid
    check (
      (volume is null or volume >= 0)
      and (tick_volume is null or tick_volume >= 0)
    ),
  constraint gsat_market_candles_pk
    primary key (symbol, timeframe, candle_open)
);

comment on table public.gsat_market_candles is
  'Completed BiQuote OHLC candles only. BiQuote is the sole market-data source for GSAT calculations.';
comment on column public.gsat_market_candles.candle_open is
  'UTC candle-open timestamp. The unique key makes repeated one-minute ingestion idempotent.';
comment on column public.gsat_market_candles.tick_volume is
  'BiQuote tick count, not exchange-traded volume or true volume-at-price.';

-- The primary key supports symbol + timeframe + time-range reads.
-- BRIN keeps the time-retention scan compact on an append-oriented table.
create index if not exists gsat_market_candles_time_brin
  on public.gsat_market_candles using brin (candle_open)
  with (pages_per_range = 64);

create table if not exists public.gsat_market_data_ingestion_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  symbols text[] not null default array['XAUUSD', 'XAGUSD']::text[],
  timeframes text[] not null default array['1m', '15m', '1h', '4h', '1d']::text[],
  api_requests integer not null default 0 check (api_requests >= 0),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  gap_count integer not null default 0 check (gap_count >= 0),
  details jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists gsat_market_data_ingestion_runs_started_idx
  on public.gsat_market_data_ingestion_runs (started_at desc);

create table if not exists public.gsat_market_data_health (
  id smallint primary key default 1 check (id = 1),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  latest_closed_1m_candle_at timestamptz,
  consecutive_failures integer not null default 0
    check (consecutive_failures >= 0),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'healthy', 'delayed', 'degraded', 'offline')),
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.gsat_market_data_health (id)
values (1)
on conflict (id) do nothing;

-- Retention is enforced by a scheduled job only after validation and activation.
-- The function is installed now; this migration deliberately does not schedule it.
create or replace function public.gsat_prune_market_candles()
returns bigint
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  deleted_rows bigint;
begin
  delete from public.gsat_market_candles
  where candle_open < now() - interval '2 years';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

-- No browser/client role can read or mutate market data directly.
-- The server-side ingestion/analysis runtime will use Supabase service_role.
alter table public.gsat_market_candles enable row level security;
alter table public.gsat_market_data_ingestion_runs enable row level security;
alter table public.gsat_market_data_health enable row level security;

revoke all on table public.gsat_market_candles from anon, authenticated;
revoke all on table public.gsat_market_data_ingestion_runs from anon, authenticated;
revoke all on table public.gsat_market_data_health from anon, authenticated;

grant select, insert, update, delete
  on table public.gsat_market_candles to service_role;
grant select, insert, update, delete
  on table public.gsat_market_data_ingestion_runs to service_role;
grant select, insert, update, delete
  on table public.gsat_market_data_health to service_role;

grant usage, select
  on sequence public.gsat_market_data_ingestion_runs_id_seq to service_role;

revoke all on function public.gsat_prune_market_candles() from public;
grant execute on function public.gsat_prune_market_candles() to service_role;
