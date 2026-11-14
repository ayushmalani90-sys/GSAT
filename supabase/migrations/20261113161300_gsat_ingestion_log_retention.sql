create or replace function public.gsat_prune_market_data_ingestion_runs()
returns bigint
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  deleted_rows bigint;
begin
  delete from public.gsat_market_data_ingestion_runs
  where started_at < now() - interval '7 days';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$function$;

revoke all on function public.gsat_prune_market_data_ingestion_runs() from public, anon, authenticated;
grant execute on function public.gsat_prune_market_data_ingestion_runs() to service_role;

select cron.schedule(
  'gsat-prune-run-logs-daily',
  '20 0 * * *',
  'select public.gsat_prune_market_data_ingestion_runs();'
);
