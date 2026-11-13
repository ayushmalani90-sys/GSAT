-- Reduce diagnostic retention to seven days and expose server-only storage metrics.
create or replace function public.gsat_prune_market_data_ingestion_runs()
returns bigint
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  deleted_rows bigint;
begin
  delete from public.gsat_market_data_ingestion_runs
  where started_at < now() - interval '7 days';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

create or replace function public.gsat_get_storage_usage()
returns table(
  database_bytes bigint,
  candle_table_bytes bigint,
  ingestion_run_table_bytes bigint,
  candle_rows bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    pg_database_size(current_database())::bigint,
    pg_total_relation_size('public.gsat_market_candles'::regclass)::bigint,
    pg_total_relation_size('public.gsat_market_data_ingestion_runs'::regclass)::bigint,
    (select count(*)::bigint from public.gsat_market_candles);
$$;

revoke all on function public.gsat_prune_market_data_ingestion_runs() from public, anon, authenticated;
grant execute on function public.gsat_prune_market_data_ingestion_runs() to service_role;

revoke all on function public.gsat_get_storage_usage() from public, anon, authenticated;
grant execute on function public.gsat_get_storage_usage() to service_role;
