create schema if not exists research;

create table if not exists research.gsat_external_candles (
  source text not null check (source = 'MetalCharts'),
  symbol text not null check (symbol in ('XAG', 'XAU')),
  timeframe text not null check (timeframe in ('15m', '1h', '4h', '1d')),
  candle_open timestamptz not null,
  open_price numeric(20,8) not null check (open_price > 0),
  high_price numeric(20,8) not null check (high_price > 0),
  low_price numeric(20,8) not null check (low_price > 0),
  close_price numeric(20,8) not null check (close_price > 0),
  volume numeric(24,8),
  currency text not null default 'USD' check (currency = 'USD'),
  price_unit text not null default 'troy_ounce' check (price_unit = 'troy_ounce'),
  raw_payload jsonb,
  retrieved_at timestamptz not null default now(),
  primary key (source, symbol, timeframe, candle_open),
  check (high_price >= greatest(open_price, close_price, low_price)),
  check (low_price <= least(open_price, close_price, high_price)),
  check (volume is null or volume >= 0)
);

create index if not exists gsat_external_candles_symbol_tf_time_idx
  on research.gsat_external_candles (symbol, timeframe, candle_open desc);

comment on schema research is 'Private research datasets kept separate from GSAT production calculation tables.';
comment on table research.gsat_external_candles is
  'External historical candles for research and source comparison only. Never use as GSAT production indicator input without explicit feed-basis validation and approval. Free MetalCharts tier is limited to daily history (30 days) and requires visible attribution for public display.';

alter table research.gsat_external_candles enable row level security;

create table if not exists research.gsat_external_ingestion_runs (
  id bigint generated always as identity primary key,
  source text not null check (source = 'MetalCharts'),
  symbol text not null check (symbol in ('XAG', 'XAU')),
  timeframe text not null check (timeframe in ('15m', '1h', '4h', '1d')),
  requested_start timestamptz,
  requested_end timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  request_weight integer not null default 0 check (request_weight >= 0),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_message text,
  details jsonb not null default '{}'::jsonb
);

comment on table research.gsat_external_ingestion_runs is
  'Audit log for isolated third-party research-history imports; not the production BiQuote collector.';
alter table research.gsat_external_ingestion_runs enable row level security;
