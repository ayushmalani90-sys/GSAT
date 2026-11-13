-- Keep diagnostic run history bounded; candle retention remains two years.
create or replace function public.gsat_prune_market_data_ingestion_runs()
returns bigint
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  deleted_rows bigint;
begin
  delete from public.gsat_market_data_ingestion_runs
  where started_at < now() - interval '30 days';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.gsat_prune_market_data_ingestion_runs() from public, anon, authenticated;
grant execute on function public.gsat_prune_market_data_ingestion_runs() to service_role;