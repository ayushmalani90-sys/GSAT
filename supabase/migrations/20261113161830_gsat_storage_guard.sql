create or replace function public.gsat_prune_market_candles()
returns bigint
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  deleted_rows bigint;
begin
  delete from public.gsat_market_candles
  where candle_open < now() - interval '2 years';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$function$;

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
set search_path to 'pg_catalog', 'public'
as $function$
  select
    pg_database_size(current_database())::bigint,
    pg_total_relation_size('public.gsat_market_candles'::regclass)::bigint,
    pg_total_relation_size('public.gsat_market_data_ingestion_runs'::regclass)::bigint,
    (select count(*)::bigint from public.gsat_market_candles);
$function$;

revoke all on function public.gsat_get_storage_usage() from public, anon, authenticated;
grant execute on function public.gsat_prune_market_candles() to service_role;
grant execute on function public.gsat_get_storage_usage() to service_role;

select cron.schedule(
  'gsat-prune-candles-daily',
  '15 0 * * *',
  'select public.gsat_prune_market_candles();'
);
