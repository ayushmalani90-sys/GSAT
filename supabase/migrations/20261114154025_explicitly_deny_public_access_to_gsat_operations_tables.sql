revoke all on table public.gsat_market_data_health from anon, authenticated;
revoke all on table public.gsat_market_data_ingestion_runs from anon, authenticated;

drop policy if exists "Deny public access to GSAT health" on public.gsat_market_data_health;
create policy "Deny public access to GSAT health"
  on public.gsat_market_data_health
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "Deny public access to GSAT ingestion runs" on public.gsat_market_data_ingestion_runs;
create policy "Deny public access to GSAT ingestion runs"
  on public.gsat_market_data_ingestion_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);
